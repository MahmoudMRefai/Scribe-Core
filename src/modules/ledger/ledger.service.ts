/**
 * Ledger Service — double-entry accounting engine.
 *
 * Core rule: For every JournalEntry, the sum of all JournalLine amounts MUST equal zero.
 *   - Positive amount = DEBIT (asset increase or expense)
 *   - Negative amount = CREDIT (liability increase or revenue)
 *
 * ─── recordDelivery (Happy Path) ─────────────────────────────
 *   When a parcel is delivered (COD):
 *   1. Courier collected cash → DEBIT courier wallet +codAmount
 *   2. Merchant is owed money → CREDIT merchant account -codAmount
 *   3. Flat fee deducted from merchant → DEBIT merchant account +flatFee
 *   4. Hub earns revenue → CREDIT system revenue account -flatFee
 *
 *   Net effect:
 *   - Courier wallet increases by codAmount (they hold the cash)
 *   - Merchant net receivable = codAmount - flatFee
 *   - System revenue increases by flatFee
 *
 * ─── Edge Cases ──────────────────────────────────────────────
 *   - Unbalanced journal → Error (sum ≠ 0)
 *   - Missing accounts → NotFoundException
 *   - COD amount = 0 → Still record the delivery, just no financial movement
 */
import { Prisma, Parcel } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma as defaultPrisma } from '../../config/prisma.js';
import { AccountOwnerType, AccountType, AuditAction } from '../../shared/enums.js';
import { AuditService } from '../audit/audit.service.js';
import { NotFoundException } from '../../shared/errors.js';

export class LedgerService {
  /**
   * Record the financial impact of a delivered parcel.
   *
   * Must be called inside a Prisma interactive transaction from ParcelService.
   */
  static async recordDelivery(
    parcel: Parcel,
    userId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const codAmount = new Decimal(parcel.codAmount.toString());

    // If COD is zero, no financial entries needed
    if (codAmount.isZero()) return;

    // ─── Find accounts ───────────────────────────────────────
    const courierAccount = await tx.account.findFirst({
      where: { ownerId: parcel.courierId!, ownerType: AccountOwnerType.COURIER, type: AccountType.ASSET },
    });
    if (!courierAccount) {
      throw new NotFoundException('Courier account', parcel.courierId!);
    }

    // Find the merchant's user ID through the merchant record
    const merchant = await tx.merchant.findUniqueOrThrow({
      where: { id: parcel.merchantId },
    });

    const merchantAccount = await tx.account.findFirst({
      where: { ownerId: merchant.userId, ownerType: AccountOwnerType.MERCHANT, type: AccountType.ASSET },
    });
    if (!merchantAccount) {
      throw new NotFoundException('Merchant account', merchant.userId);
    }

    // System revenue account — create if not exists (singleton)
    let systemAccount = await tx.account.findFirst({
      where: { ownerType: AccountOwnerType.SYSTEM, type: AccountType.REVENUE },
    });
    if (!systemAccount) {
      // Find an admin user to own the system account
      const admin = await tx.user.findFirst({ where: { role: 'ADMIN' } });
      if (!admin) throw new NotFoundException('System admin for revenue account');
      systemAccount = await tx.account.create({
        data: {
          ownerId: admin.id,
          ownerType: AccountOwnerType.SYSTEM,
          type: AccountType.REVENUE,
          name: 'System Revenue',
        },
      });
    }

    // ─── Calculate flat delivery fee ─────────────────────────
    const flatFee = new Decimal(merchant.flatDeliveryFee.toString());

    // ─── Create journal entry with balanced splits ───────────
    // Sum check: +codAmount + (-codAmount) + (+flatFee) + (-flatFee) = 0 ✓
    const entry = await tx.journalEntry.create({
      data: {
        description: `Delivery of parcel ${parcel.trackingId} — COD: ${codAmount.toFixed(2)} EGP, Fee: ${flatFee.toFixed(2)} EGP`,
        createdById: userId,
        lines: {
          create: [
            // 1. DEBIT courier wallet (they collected cash)
            { accountId: courierAccount.id, amount: codAmount.toNumber() },
            // 2. CREDIT merchant account (they are owed the COD amount)
            { accountId: merchantAccount.id, amount: codAmount.negated().toNumber() },
            // 3. DEBIT merchant account (flat fee deduction)
            { accountId: merchantAccount.id, amount: flatFee.toNumber() },
            // 4. CREDIT system revenue (hub earns the fee)
            { accountId: systemAccount.id, amount: flatFee.negated().toNumber() },
          ],
        },
      },
    });

    // ─── Update running balances ─────────────────────────────
    const courierOldBalance = new Decimal(courierAccount.balance.toString());
    const merchantOldBalance = new Decimal(merchantAccount.balance.toString());

    await tx.account.update({
      where: { id: courierAccount.id },
      data: { balance: { increment: codAmount.toNumber() } },
    });

    await tx.account.update({
      where: { id: merchantAccount.id },
      data: { balance: { increment: codAmount.minus(flatFee).toNumber() } }, // net = cod - fee
    });

    await tx.account.update({
      where: { id: systemAccount.id },
      data: { balance: { increment: flatFee.toNumber() } },
    });

    // ─── Audit logs ──────────────────────────────────────────
    await AuditService.log({
      userId,
      entity: 'Account',
      entityId: courierAccount.id,
      action: AuditAction.BALANCE_CHANGE,
      previousValue: { balance: courierOldBalance.toFixed(2) },
      newValue: { balance: courierOldBalance.plus(codAmount).toFixed(2) },
    }, tx);

    await AuditService.log({
      userId,
      entity: 'Account',
      entityId: merchantAccount.id,
      action: AuditAction.BALANCE_CHANGE,
      previousValue: { balance: merchantOldBalance.toFixed(2) },
      newValue: { balance: merchantOldBalance.plus(codAmount).minus(flatFee).toFixed(2) },
    }, tx);

    await AuditService.log({
      userId,
      entity: 'Parcel',
      entityId: parcel.id,
      action: AuditAction.DELIVERY_RECORDED,
      newValue: {
        journalEntryId: entry.id,
        codAmount: codAmount.toFixed(2),
        flatFee: flatFee.toFixed(2),
        merchantNet: codAmount.minus(flatFee).toFixed(2),
      },
    }, tx);
  }
}
