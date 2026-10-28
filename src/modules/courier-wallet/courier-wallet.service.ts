/**
 * Courier Wallet Service — the courier-facing balance sheet.
 *
 *   currentBalance     commission earned and not yet paid out   (hub owes courier)
 *   cashInHandBalance  COD collected and not yet handed over    (courier owes hub)
 *
 * ─── Invariants ──────────────────────────────────────────────
 *   - Every balance change goes through post(), which writes exactly one
 *     immutable WalletTransaction row in the same DB transaction.
 *   - All mutating methods REQUIRE a Prisma TransactionClient so they always
 *     commit/roll back together with the parcel/ledger/settlement change.
 *   - (walletId, type, referenceId) is unique, so a parcel can never be
 *     credited twice even if application-level guards are bypassed.
 *
 * The double-entry ledger (LedgerService) remains the accounting source of
 * truth; this wallet mirrors the courier's position for the courier app.
 */
import { Prisma, CourierWallet, WalletTransactionType } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../../config/prisma.js';
import { AccountOwnerType, AccountType } from '../../shared/enums.js';
import { ConflictException, NotFoundException } from '../../shared/errors.js';
import { CourierWalletRepository } from './courier-wallet.repository.js';

type BalanceField = 'currentBalance' | 'cashInHandBalance';

/** Which wallet balance each transaction type moves. */
const TARGET_BALANCE: Record<WalletTransactionType, BalanceField> = {
  OPENING_BALANCE: 'cashInHandBalance',
  CASH_COLLECTED: 'cashInHandBalance',
  CASH_DEPOSITED: 'cashInHandBalance',
  COMMISSION_EARNED: 'currentBalance',
  PAYOUT_SETTLED: 'currentBalance',
};

export interface DeliveryWalletInput {
  courierUserId: string;
  parcelId: string;
  commission: Decimal;
  codAmount: Decimal;
}

export class CourierWalletService {
  /**
   * Get (or lazily provision) the wallet for a courier user.
   *
   * On first provisioning, any cash-in-hand already recorded in the courier's
   * ledger ASSET account is carried over as an OPENING_BALANCE row, so the
   * wallet agrees with the ledger for couriers that pre-date this feature.
   *
   * IMPORTANT: call this BEFORE posting the current operation to the ledger,
   * otherwise that operation would be counted twice in the opening balance.
   */
  static async ensureWallet(courierUserId: string, tx: Prisma.TransactionClient): Promise<CourierWallet> {
    const courier = await tx.courier.findUnique({ where: { userId: courierUserId } });
    if (!courier) {
      throw new NotFoundException('Courier profile', courierUserId);
    }

    // INSERT … ON CONFLICT DO NOTHING — safe under concurrent first deliveries.
    const { count: created } = await tx.courierWallet.createMany({
      data: [{ courierId: courier.id }],
      skipDuplicates: true,
    });

    let wallet = await tx.courierWallet.findUniqueOrThrow({ where: { courierId: courier.id } });

    if (created === 1) {
      const ledgerAccount = await tx.ledgerAccount.findFirst({
        where: { ownerId: courierUserId, ownerType: AccountOwnerType.COURIER, type: AccountType.ASSET },
      });
      const opening = new Decimal(ledgerAccount?.balance.toString() ?? '0');
      if (!opening.isZero()) {
        wallet = await this.post(tx, wallet.id, WalletTransactionType.OPENING_BALANCE, opening, null);
      }
    }

    return wallet;
  }

  /** Delivery: credit commission and record the COD now held by the courier. */
  static async recordDelivery(input: DeliveryWalletInput, tx: Prisma.TransactionClient): Promise<CourierWallet> {
    let wallet = await this.ensureWallet(input.courierUserId, tx);

    if (input.commission.greaterThan(0)) {
      wallet = await this.post(tx, wallet.id, WalletTransactionType.COMMISSION_EARNED, input.commission, input.parcelId);
    }
    if (input.codAmount.greaterThan(0)) {
      wallet = await this.post(tx, wallet.id, WalletTransactionType.CASH_COLLECTED, input.codAmount, input.parcelId);
    }
    return wallet;
  }

  /** Settlement confirmed: courier handed physical cash to the hub. */
  static async recordCashDeposit(
    courierUserId: string,
    amount: Decimal,
    settlementId: string,
    tx: Prisma.TransactionClient,
  ): Promise<CourierWallet> {
    const wallet = await this.ensureWallet(courierUserId, tx);
    return this.post(tx, wallet.id, WalletTransactionType.CASH_DEPOSITED, amount.negated(), settlementId);
  }

  /** Commission payout: courier withdrew/received their commission earnings. */
  static async recordCommissionPayout(
    courierUserId: string,
    amount: Decimal,
    payoutId: string,
    tx: Prisma.TransactionClient,
  ): Promise<CourierWallet> {
    const wallet = await this.ensureWallet(courierUserId, tx);
    return this.post(tx, wallet.id, WalletTransactionType.PAYOUT_SETTLED, amount.negated(), payoutId);
  }

  /** Read model for GET /api/couriers/me/wallet. Read-only; no wallet yet → zeros. */
  static async getSummary(courierUserId: string, limit = 20) {
    const courier = await prisma.courier.findUnique({ where: { userId: courierUserId } });
    if (!courier) {
      throw new NotFoundException('Courier profile', courierUserId);
    }

    const wallet = await CourierWalletRepository.findByCourierUserId(courierUserId);
    if (!wallet) {
      // Not provisioned until the first delivery/settlement. Report the ledger's
      // cash-in-hand so legacy couriers still see what they owe.
      const ledgerAccount = await prisma.ledgerAccount.findFirst({
        where: { ownerId: courierUserId, ownerType: AccountOwnerType.COURIER, type: AccountType.ASSET },
      });
      return {
        walletId: null,
        totalEarnings: '0.00',
        pendingPayout: '0.00',
        cashInHand: new Decimal(ledgerAccount?.balance.toString() ?? '0').toFixed(2),
        updatedAt: null,
        transactions: [],
      };
    }

    const [earned, transactions] = await Promise.all([
      CourierWalletRepository.sumByType(wallet.id, WalletTransactionType.COMMISSION_EARNED),
      CourierWalletRepository.recentTransactions(wallet.id, limit),
    ]);

    return {
      walletId: wallet.id,
      totalEarnings: new Decimal(earned?.toString() ?? '0').toFixed(2), // lifetime commission
      pendingPayout: new Decimal(wallet.currentBalance.toString()).toFixed(2), // earned − paid out
      cashInHand: new Decimal(wallet.cashInHandBalance.toString()).toFixed(2), // owed to hub
      updatedAt: wallet.updatedAt,
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: new Decimal(t.amount.toString()).toFixed(2),
        balanceAfter: new Decimal(t.balanceAfter.toString()).toFixed(2),
        referenceId: t.referenceId,
        createdAt: t.createdAt,
      })),
    };
  }

  /**
   * The only code path that changes a wallet balance.
   * The UPDATE takes a row lock, so balanceAfter is exact even under concurrency.
   */
  private static async post(
    tx: Prisma.TransactionClient,
    walletId: string,
    type: WalletTransactionType,
    signedAmount: Decimal,
    referenceId: string | null,
  ): Promise<CourierWallet> {
    const field = TARGET_BALANCE[type];
    const amount = signedAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const wallet = await tx.courierWallet.update({
      where: { id: walletId },
      data: { [field]: { increment: amount.toFixed(2) } },
    });

    try {
      await CourierWalletRepository.createTransaction({
        walletId,
        type,
        amount: amount.toFixed(2),
        balanceAfter: new Decimal(wallet[field].toString()).toFixed(2),
        referenceId,
      }, tx);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Wallet already has a ${type} entry for reference '${referenceId}'`);
      }
      throw err;
    }

    return wallet;
  }
}
