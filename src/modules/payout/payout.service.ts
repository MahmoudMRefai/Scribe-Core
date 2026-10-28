import { Prisma, PayoutStatus, PayoutRecipientType } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../../config/prisma.js';
import { PayoutRepository } from './payout.repository.js';
import { CourierWalletRepository } from '../courier-wallet/courier-wallet.repository.js';
import { CourierWalletService } from '../courier-wallet/courier-wallet.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AccountOwnerType, AccountType, AuditAction } from '../../shared/enums.js';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
  InsufficientFundsException,
} from '../../shared/errors.js';

export class PayoutService {
  /**
   * Courier or Merchant requests a payout / withdrawal.
   */
  static async request(userId: string, role: 'COURIER' | 'MERCHANT', amount: number, notes?: string) {
    const payoutAmount = new Decimal(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (payoutAmount.lessThanOrEqualTo(0)) {
      throw new ConflictException('Payout amount must be greater than zero');
    }

    if (role === 'COURIER') {
      const [wallet, courierCashAccount] = await Promise.all([
        CourierWalletRepository.findByCourierUserId(userId),
        prisma.ledgerAccount.findFirst({
          where: { ownerId: userId, ownerType: AccountOwnerType.COURIER, type: AccountType.ASSET },
        }),
      ]);

      const walletCashInHand = new Decimal(wallet?.cashInHandBalance.toString() ?? '0');
      const ledgerCashInHand = new Decimal(courierCashAccount?.balance.toString() ?? '0');
      const cashInHand = Decimal.max(walletCashInHand, ledgerCashInHand);

      if (cashInHand.greaterThan(0)) {
        throw new ConflictException(
          `Cannot request commission payout while holding unsettled cash (${cashInHand.toFixed(2)} EGP). Please hand over and confirm all collected COD with the hub first.`,
        );
      }

      const currentBalance = new Decimal(wallet?.currentBalance.toString() ?? '0');

      // Pending payouts already requested
      const pendingSum = await prisma.payout.aggregate({
        where: {
          recipientId: userId,
          status: { in: [PayoutStatus.PENDING, PayoutStatus.DISBURSED] },
        },
        _sum: { amount: true },
      });
      const pendingTotal = new Decimal(pendingSum._sum.amount?.toString() ?? '0');
      const available = currentBalance.minus(pendingTotal);

      if (payoutAmount.greaterThan(available)) {
        throw new InsufficientFundsException(
          wallet?.id ?? userId,
          payoutAmount.toFixed(2),
          available.toFixed(2),
        );
      }

      return PayoutRepository.create({
        recipient: { connect: { id: userId } },
        recipientType: PayoutRecipientType.COURIER,
        amount: payoutAmount.toNumber(),
        status: PayoutStatus.PENDING,
        notes,
      });
    } else {
      // Merchant
      const merchantAccount = await prisma.ledgerAccount.findFirst({
        where: { ownerId: userId, ownerType: AccountOwnerType.MERCHANT, type: AccountType.ASSET },
      });
      const currentBalance = new Decimal(merchantAccount?.balance.toString() ?? '0');

      const pendingSum = await prisma.payout.aggregate({
        where: {
          recipientId: userId,
          status: { in: [PayoutStatus.PENDING, PayoutStatus.DISBURSED] },
        },
        _sum: { amount: true },
      });
      const pendingTotal = new Decimal(pendingSum._sum.amount?.toString() ?? '0');
      const available = currentBalance.minus(pendingTotal);

      if (payoutAmount.greaterThan(available)) {
        throw new InsufficientFundsException(
          merchantAccount?.id ?? userId,
          payoutAmount.toFixed(2),
          available.toFixed(2),
        );
      }

      return PayoutRepository.create({
        recipient: { connect: { id: userId } },
        recipientType: PayoutRecipientType.MERCHANT,
        amount: payoutAmount.toNumber(),
        status: PayoutStatus.PENDING,
        notes,
      });
    }
  }

  /**
   * Admin initiates and disburses a payout directly to a Courier or Merchant
   * without waiting for a prior withdrawal request.
   */
  static async sendDirect(adminId: string, recipientId: string, amount: number, notes?: string) {
    const payoutAmount = new Decimal(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (payoutAmount.lessThanOrEqualTo(0)) {
      throw new ConflictException('Payout amount must be greater than zero');
    }

    const recipient = await prisma.user.findUnique({ where: { id: recipientId } });
    if (!recipient || !recipient.isActive || (recipient.role !== 'COURIER' && recipient.role !== 'MERCHANT')) {
      throw new NotFoundException('Courier or Merchant recipient', recipientId);
    }

    const pendingSum = await prisma.payout.aggregate({
      where: {
        recipientId,
        status: { in: [PayoutStatus.PENDING, PayoutStatus.DISBURSED] },
      },
      _sum: { amount: true },
    });
    const pendingTotal = new Decimal(pendingSum._sum.amount?.toString() ?? '0');

    if (recipient.role === 'COURIER') {
      const wallet = await CourierWalletRepository.findByCourierUserId(recipientId);
      const currentBalance = new Decimal(wallet?.currentBalance.toString() ?? '0');
      const available = currentBalance.minus(pendingTotal);

      if (payoutAmount.greaterThan(available)) {
        throw new InsufficientFundsException(
          wallet?.id ?? recipientId,
          payoutAmount.toFixed(2),
          available.toFixed(2),
        );
      }
    } else {
      const merchantAccount = await prisma.ledgerAccount.findFirst({
        where: { ownerId: recipientId, ownerType: AccountOwnerType.MERCHANT, type: AccountType.ASSET },
      });
      const currentBalance = new Decimal(merchantAccount?.balance.toString() ?? '0');
      const available = currentBalance.minus(pendingTotal);

      if (payoutAmount.greaterThan(available)) {
        throw new InsufficientFundsException(
          merchantAccount?.id ?? recipientId,
          payoutAmount.toFixed(2),
          available.toFixed(2),
        );
      }
    }

    const created = await PayoutRepository.create({
      recipient: { connect: { id: recipientId } },
      recipientType: recipient.role === 'COURIER' ? PayoutRecipientType.COURIER : PayoutRecipientType.MERCHANT,
      admin: { connect: { id: adminId } },
      amount: payoutAmount.toNumber(),
      status: PayoutStatus.DISBURSED,
      disbursedAt: new Date(),
      notes,
    });

    await AuditService.log({
      userId: adminId,
      entity: 'Payout',
      entityId: created.id,
      action: AuditAction.SETTLEMENT_INITIATED,
      newValue: {
        recipientId,
        recipientType: recipient.role,
        amount: payoutAmount.toFixed(2),
        status: PayoutStatus.DISBURSED,
        adminId,
      },
    });

    return PayoutRepository.findById(created.id);
  }

  /**
   * Admin disburses the payout (hands over cash or sends transfer).
   */
  static async disburse(payoutId: string, adminId: string, notes?: string) {
    const payout = await PayoutRepository.findById(payoutId);
    if (!payout) throw new NotFoundException('Payout', payoutId);

    if (payout.status !== PayoutStatus.PENDING) {
      throw new ConflictException(`Only PENDING payouts can be disbursed (current: ${payout.status})`);
    }

    const updated = await PayoutRepository.update(payoutId, {
      status: PayoutStatus.DISBURSED,
      admin: { connect: { id: adminId } },
      disbursedAt: new Date(),
      ...(notes ? { notes: payout.notes ? `${payout.notes} | ${notes}` : notes } : {}),
    });

    await AuditService.log({
      userId: adminId,
      entity: 'Payout',
      entityId: payoutId,
      action: AuditAction.SETTLEMENT_CONFIRMED,
      newValue: { status: PayoutStatus.DISBURSED, adminId },
    });

    return updated;
  }

  /**
   * Courier or Merchant confirms receipt of the payout.
   * This executes the financial deduction and ledger entries atomically.
   */
  static async confirm(payoutId: string, recipientUserId: string) {
    return prisma.$transaction(async (tx) => {
      const payout = await tx.payout.findUnique({
        where: { id: payoutId },
      });
      if (!payout) throw new NotFoundException('Payout', payoutId);

      if (payout.recipientId !== recipientUserId) {
        throw new ForbiddenException('You can only confirm payouts addressed to you');
      }

      if (payout.status === PayoutStatus.CONFIRMED) {
        throw new ConflictException('Payout is already confirmed');
      }

      if (payout.status !== PayoutStatus.DISBURSED && payout.status !== PayoutStatus.PENDING) {
        throw new ConflictException(`Cannot confirm payout with status '${payout.status}'`);
      }

      const amount = new Decimal(payout.amount.toString());

      // Find or create System Cash account
      let systemCashAccount = await tx.ledgerAccount.findFirst({
        where: { ownerType: AccountOwnerType.SYSTEM, type: AccountType.ASSET },
      });
      if (!systemCashAccount) {
        const admin = await tx.user.findFirst({ where: { role: 'ADMIN' } });
        if (!admin) throw new NotFoundException('System admin');
        systemCashAccount = await tx.ledgerAccount.create({
          data: {
            ownerId: admin.id,
            ownerType: AccountOwnerType.SYSTEM,
            type: AccountType.ASSET,
            name: 'System Cash',
          },
        });
      }

      if (payout.recipientType === PayoutRecipientType.COURIER) {
        // 1. Update CourierWallet: currentBalance ↓ via PAYOUT_SETTLED
        await CourierWalletService.recordCommissionPayout(recipientUserId, amount, payout.id, tx);

        // 2. Double-entry ledger:
        // DEBIT Courier Commission Payable liability (+amount in algebraic signed system)
        // CREDIT System Cash (-amount)
        const payable = await tx.ledgerAccount.findFirst({
          where: {
            ownerId: recipientUserId,
            ownerType: AccountOwnerType.COURIER,
            type: AccountType.LIABILITY,
          },
        });

        if (payable) {
          await tx.journalEntry.create({
            data: {
              description: `Courier commission payout #${payout.id} — ${amount.toFixed(2)} EGP`,
              createdById: recipientUserId,
              lines: {
                create: [
                  { accountId: payable.id, amount: amount.toNumber() },
                  { accountId: systemCashAccount.id, amount: amount.negated().toNumber() },
                ],
              },
            },
          });

          await tx.ledgerAccount.update({
            where: { id: payable.id },
            data: { balance: { increment: amount.toNumber() } },
          });
        }

        await tx.ledgerAccount.update({
          where: { id: systemCashAccount.id },
          data: { balance: { decrement: amount.toNumber() } },
        });
      } else {
        // MERCHANT
        const merchantAccount = await tx.ledgerAccount.findFirst({
          where: {
            ownerId: recipientUserId,
            ownerType: AccountOwnerType.MERCHANT,
            type: AccountType.ASSET,
          },
        });
        if (!merchantAccount) throw new NotFoundException('Merchant ledger account', recipientUserId);

        await tx.journalEntry.create({
          data: {
            description: `Merchant COD payout #${payout.id} — ${amount.toFixed(2)} EGP`,
            createdById: recipientUserId,
            lines: {
              create: [
                // DEBIT clearing/payout
                { accountId: systemCashAccount.id, amount: amount.negated().toNumber() },
                { accountId: merchantAccount.id, amount: amount.toNumber() },
              ],
            },
          },
        });

        await tx.ledgerAccount.update({
          where: { id: merchantAccount.id },
          data: { balance: { decrement: amount.toNumber() } },
        });

        await tx.ledgerAccount.update({
          where: { id: systemCashAccount.id },
          data: { balance: { decrement: amount.toNumber() } },
        });
      }

      // Mark confirmed
      const confirmed = await tx.payout.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.CONFIRMED,
          confirmedAt: new Date(),
        },
        include: {
          recipient: { select: { id: true, name: true, email: true, role: true } },
          admin: { select: { id: true, name: true } },
        },
      });

      await AuditService.log({
        userId: recipientUserId,
        entity: 'Payout',
        entityId: payoutId,
        action: AuditAction.SETTLEMENT_CONFIRMED,
        newValue: { status: PayoutStatus.CONFIRMED, amount: amount.toFixed(2) },
      }, tx);

      return confirmed;
    });
  }

  /**
   * Reject / Cancel payout (by Recipient or Admin).
   */
  static async reject(payoutId: string, userId: string, userRole: string, reason?: string) {
    const payout = await PayoutRepository.findById(payoutId);
    if (!payout) throw new NotFoundException('Payout', payoutId);

    if (userRole !== 'ADMIN' && payout.recipientId !== userId) {
      throw new ForbiddenException('You can only reject payouts addressed to you');
    }

    if (payout.status === PayoutStatus.CONFIRMED || payout.status === PayoutStatus.REJECTED) {
      throw new ConflictException(`Cannot reject a payout that is already '${payout.status}'`);
    }

    const actorLabel = userRole === 'ADMIN' ? 'Rejected by Admin' : `Rejected by ${payout.recipientType}`;
    const noteSuffix = reason ? `${actorLabel}: ${reason}` : actorLabel;

    const updated = await PayoutRepository.update(payoutId, {
      status: PayoutStatus.REJECTED,
      notes: payout.notes ? `${payout.notes} | ${noteSuffix}` : noteSuffix,
    });

    await AuditService.log({
      userId,
      entity: 'Payout',
      entityId: payoutId,
      action: AuditAction.SETTLEMENT_DISPUTED,
      newValue: { status: PayoutStatus.REJECTED, rejectedBy: userId, reason },
    });

    return updated;
  }

  /**
   * Admin helper: returns all active Couriers and Merchants with their current
   * available payout balances (total minus active pending/disbursed payouts).
   */
  static async getRecipientBalances() {
    const [couriers, merchants, activePayouts, merchantAccounts] = await Promise.all([
      prisma.courier.findMany({
        where: { isActive: true, user: { isActive: true } },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          wallet: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.merchant.findMany({
        where: { isActive: true, user: { isActive: true } },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.payout.groupBy({
        by: ['recipientId'],
        where: { status: { in: [PayoutStatus.PENDING, PayoutStatus.DISBURSED] } },
        _sum: { amount: true },
      }),
      prisma.ledgerAccount.findMany({
        where: { ownerType: AccountOwnerType.MERCHANT, type: AccountType.ASSET },
      }),
    ]);

    const pendingByUser = new Map<string, Decimal>(
      activePayouts.map((p) => [p.recipientId, new Decimal(p._sum.amount?.toString() ?? '0')]),
    );
    const merchantBalByUser = new Map<string, Decimal>(
      merchantAccounts.map((a) => [a.ownerId, new Decimal(a.balance.toString())]),
    );

    const courierList = couriers.map((c) => {
      const total = new Decimal(c.wallet?.currentBalance.toString() ?? '0');
      const pending = pendingByUser.get(c.userId) ?? new Decimal(0);
      const available = Decimal.max(0, total.minus(pending));
      return {
        userId: c.userId,
        name: c.user.name,
        email: c.user.email,
        phone: c.phone ?? c.user.phone,
        recipientType: 'COURIER' as const,
        totalBalance: total.toFixed(2),
        pendingPayouts: pending.toFixed(2),
        availableBalance: available.toFixed(2),
      };
    });

    const merchantList = merchants.map((m) => {
      const total = merchantBalByUser.get(m.userId) ?? new Decimal(0);
      const pending = pendingByUser.get(m.userId) ?? new Decimal(0);
      const available = Decimal.max(0, total.minus(pending));
      return {
        userId: m.userId,
        name: m.businessName ? `${m.businessName} (${m.user.name})` : m.user.name,
        email: m.user.email,
        phone: m.phone ?? m.user.phone,
        recipientType: 'MERCHANT' as const,
        totalBalance: total.toFixed(2),
        pendingPayouts: pending.toFixed(2),
        availableBalance: available.toFixed(2),
      };
    });

    return { couriers: courierList, merchants: merchantList };
  }

  static async list(filters: {
    recipientId?: string;
    recipientType?: PayoutRecipientType;
    status?: PayoutStatus;
    page: number;
    pageSize: number;
  }) {
    return PayoutRepository.findMany(filters);
  }
}

