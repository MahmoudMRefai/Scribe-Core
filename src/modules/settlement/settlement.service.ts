/**
 * Settlement Service — The "Armant" Settlement Protocol.
 *
 * This module handles the physical cash handover process between couriers and the hub admin.
 *
 * ─── Protocol Flow ───────────────────────────────────────────
 *   1. INITIATE: Courier/Admin creates a settlement request with the cash amount
 *   2. CONFIRM:  Admin physically receives the cash and confirms in the system
 *   3. CLEAR:    Courier's wallet balance is reduced by the settled amount
 *
 * ─── Happy Path (Confirm Settlement) ────────────────────────
 *   1. Admin confirms receipt of physical cash
 *   2. System creates a journal entry (DEBIT system cash, CREDIT courier wallet)
 *   3. Courier wallet balance decremented
 *   4. Settlement marked CONFIRMED with timestamp
 *   5. Audit logs written
 *
 * ─── Edge Cases ──────────────────────────────────────────────
 *   - Courier wallet balance < settlement amount → InsufficientFundsException
 *   - Settlement already confirmed → ConflictException (prevent double-confirm)
 *   - Settlement not found → NotFoundException
 *   - Dispute: Admin flags a discrepancy (e.g., cash count mismatch)
 */
import { Prisma, SettlementStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../../config/prisma.js';
import { SettlementRepository } from './settlement.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { CourierWalletService } from '../courier-wallet/courier-wallet.service.js';
import { AccountOwnerType, AccountType, AuditAction } from '../../shared/enums.js';
import {
  NotFoundException,
  ConflictException,
  InsufficientFundsException,
} from '../../shared/errors.js';

export class SettlementService {
  /**
   * Step 1: Initiate a settlement (courier or admin).
   * Verifies the courier has sufficient wallet balance.
   */
  static async initiate(courierId: string, amount: number, userId: string, notes?: string) {
    // Verify courier has an account with sufficient balance
    const courierAccount = await prisma.ledgerAccount.findFirst({
      where: { ownerId: courierId, ownerType: AccountOwnerType.COURIER, type: AccountType.ASSET },
    });
    if (!courierAccount) {
      throw new NotFoundException('Courier account', courierId);
    }

    const balance = new Decimal(courierAccount.balance.toString());
    const settlementAmount = new Decimal(amount);

    if (balance.lessThan(settlementAmount)) {
      throw new InsufficientFundsException(
        courierAccount.id,
        settlementAmount.toFixed(2),
        balance.toFixed(2),
      );
    }

    const settlement = await prisma.$transaction(async (tx) => {
      const created = await SettlementRepository.create({
        courier: { connect: { id: courierId } },
        amount: settlementAmount.toNumber(),
        status: SettlementStatus.PENDING,
        notes,
      }, tx);

      await AuditService.log({
        userId,
        entity: 'Settlement',
        entityId: created.id,
        action: AuditAction.SETTLEMENT_INITIATED,
        newValue: { courierId, amount: settlementAmount.toFixed(2), status: 'PENDING' },
      }, tx);

      return created;
    });

    return settlement;
  }

  /**
   * Step 2: Admin confirms physical cash receipt.
   *
   * This is the critical financial operation — uses Prisma interactive transaction
   * with Serializable isolation to prevent race conditions.
   */
  static async confirm(settlementId: string, adminId: string, notes?: string) {
    return prisma.$transaction(async (tx) => {
      // Lock the settlement record
      const settlement = await SettlementRepository.findById(settlementId, tx);
      if (!settlement) {
        throw new NotFoundException('Settlement', settlementId);
      }

      // Prevent double-confirmation
      if (settlement.status !== SettlementStatus.PENDING) {
        throw new ConflictException(
          `Settlement is already '${settlement.status}'. Only PENDING settlements can be confirmed.`,
        );
      }

      const amount = new Decimal(settlement.amount.toString());

      // ─── Find accounts ───────────────────────────────────
      const courierAccount = await tx.ledgerAccount.findFirst({
        where: {
          ownerId: settlement.courierId,
          ownerType: AccountOwnerType.COURIER,
          type: AccountType.ASSET,
        },
      });
      if (!courierAccount) {
        throw new NotFoundException('Courier account', settlement.courierId);
      }

      // Verify sufficient balance (could have changed since initiation)
      const courierBalance = new Decimal(courierAccount.balance.toString());
      if (courierBalance.lessThan(amount)) {
        throw new InsufficientFundsException(
          courierAccount.id,
          amount.toFixed(2),
          courierBalance.toFixed(2),
        );
      }

      // System cash account (ASSET — physical cash at hub)
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

      // ─── Courier wallet: cash-in-hand ↓ (CASH_DEPOSITED) ────
      // Must run BEFORE the ledger decrement: if the wallet is provisioned here
      // for the first time, its opening balance is read from the ledger.
      await CourierWalletService.recordCashDeposit(settlement.courierId, amount, settlementId, tx);

      // ─── Create journal entry ────────────────────────────
      // Cash moves from courier to hub
      // DEBIT system cash (+amount), CREDIT courier wallet (-amount) → sum = 0
      await tx.journalEntry.create({
        data: {
          description: `Cash Handover Settlement #${settlementId.slice(0, 8)}`,
          createdById: adminId,
          lines: {
            create: [
              { accountId: systemCashAccount.id, amount: amount.toNumber() },
              { accountId: courierAccount.id, amount: amount.negated().toNumber() },
            ],
          },
        },
      });

      // ─── Update balances ─────────────────────────────────
      const oldCourierBalance = courierBalance;

      await tx.ledgerAccount.update({
        where: { id: courierAccount.id },
        data: { balance: { decrement: amount.toNumber() } },
      });

      await tx.ledgerAccount.update({
        where: { id: systemCashAccount.id },
        data: { balance: { increment: amount.toNumber() } },
      });

      // ─── Update settlement status ────────────────────────
      const updated = await SettlementRepository.update(settlementId, {
        status: SettlementStatus.CONFIRMED,
        admin: { connect: { id: adminId } },
        confirmedAt: new Date(),
        notes: notes || settlement.notes,
      }, tx);

      // ─── Audit logs ──────────────────────────────────────
      await AuditService.log({
        userId: adminId,
        entity: 'Settlement',
        entityId: settlementId,
        action: AuditAction.SETTLEMENT_CONFIRMED,
        previousValue: { status: 'PENDING' },
        newValue: { status: 'CONFIRMED', confirmedAt: new Date().toISOString() },
      }, tx);

      await AuditService.log({
        userId: adminId,
        entity: 'LedgerAccount',
        entityId: courierAccount.id,
        action: AuditAction.BALANCE_CHANGE,
        previousValue: { balance: oldCourierBalance.toFixed(2) },
        newValue: { balance: oldCourierBalance.minus(amount).toFixed(2) },
      }, tx);

      return updated;
    }, {
      // Use Serializable isolation for financial operations
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  /**
   * Dispute a settlement — admin flags a cash count mismatch or issue.
   */
  static async dispute(settlementId: string, adminId: string, reason: string) {
    const settlement = await SettlementRepository.findById(settlementId);
    if (!settlement) {
      throw new NotFoundException('Settlement', settlementId);
    }

    if (settlement.status !== SettlementStatus.PENDING) {
      throw new ConflictException(
        `Cannot dispute: settlement is '${settlement.status}', expected 'PENDING'`,
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await SettlementRepository.update(settlementId, {
        status: SettlementStatus.DISPUTED,
        admin: { connect: { id: adminId } },
        notes: `DISPUTED: ${reason}`,
      }, tx);

      await AuditService.log({
        userId: adminId,
        entity: 'Settlement',
        entityId: settlementId,
        action: AuditAction.SETTLEMENT_DISPUTED,
        previousValue: { status: 'PENDING' },
        newValue: { status: 'DISPUTED', reason },
      }, tx);

      return result;
    });

    return updated;
  }

  /**
   * Get a settlement by ID.
   */
  static async getById(settlementId: string) {
    const settlement = await SettlementRepository.findById(settlementId);
    if (!settlement) {
      throw new NotFoundException('Settlement', settlementId);
    }
    return settlement;
  }

  /**
   * List settlements with filters.
   */
  static async list(filters: {
    courierId?: string;
    status?: SettlementStatus;
    page: number;
    pageSize: number;
  }) {
    return SettlementRepository.findMany(filters);
  }
}
