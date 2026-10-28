/**
 * Parcel Service — core parcel lifecycle logic.
 *
 * ─── Create Parcel (Happy Path) ──────────────────────────────
 *   1. Validate merchant exists and is active
 *   2. Generate tracking ID (ARM-YYYYMMDD-XXXX)
 *   3. Create parcel with PENDING status
 *   4. Write audit log
 *
 * ─── Update Status (Happy Path) ──────────────────────────────
 *   1. Verify parcel exists
 *   2. Validate the status transition (PENDING→PICKED_UP, etc.)
 *   3. If courier is performing the action, verify they are assigned
 *   4. If transitioning to DELIVERED, trigger financial recording
 *   5. Update status and write audit log
 *
 * ─── Edge Cases ──────────────────────────────────────────────
 *   - Courier tries to deliver a parcel not assigned to them → ForbiddenException
 *   - Invalid status transition (e.g., PENDING→DELIVERED) → ConflictException
 *   - Parcel not found → NotFoundException
 *   - Merchant not found or inactive → NotFoundException
 *
 * ─── Mark As Delivered (atomic settlement) ────────────────────
 *   One DB transaction: CAS parcel status → wallet (commission + cash-in-hand)
 *   → double-entry ledger → audit. Any failure rolls back everything.
 *   - Concurrent / repeated delivery → ConflictException (only one CAS wins)
 */
import Decimal from 'decimal.js';
import { Parcel, ParcelStatus, Role, ServiceTier } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { VALID_STATUS_TRANSITIONS } from '../../config/constants.js';
import { ParcelRepository } from './parcel.repository.js';
import { BarcodeUtil } from './barcode.util.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { CommissionService } from '../commission/commission.service.js';
import { CourierWalletService } from '../courier-wallet/courier-wallet.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditAction } from '../../shared/enums.js';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '../../shared/errors.js';

interface CreateParcelInput {
  merchantId: string;
  codAmount: number;
  serviceTier?: ServiceTier;
  weight?: number;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  notes?: string;
}

export interface DeliveryMetadata {
  /** User performing the action (courier themself, or an admin). Defaults to the courier. */
  performedBy?: string;
  /** Free-text note from the courier, stored in the audit trail. */
  note?: string;
}

export class ParcelService {
  /**
   * Create a new parcel and assign it a tracking ID.
   */
  static async create(input: CreateParcelInput, userId: string) {
    // Verify merchant exists
    const merchant = await prisma.merchant.findUnique({ where: { id: input.merchantId } });
    if (!merchant || !merchant.isActive) {
      throw new NotFoundException('Merchant', input.merchantId);
    }

    const codAmount = new Decimal(input.codAmount);
    const deliveryFee = new Decimal(merchant.flatDeliveryFee.toString());
    if (codAmount.lessThan(deliveryFee)) {
      throw new ConflictException(
        `Parcel COD amount (${codAmount.toFixed(2)} EGP) cannot be less than the delivery fee (${deliveryFee.toFixed(2)} EGP)`,
      );
    }

    // Atomic: generate tracking ID + create parcel
    const parcel = await prisma.$transaction(async (tx) => {
      const trackingId = await BarcodeUtil.generate(tx);

      const created = await ParcelRepository.create(
        {
          trackingId,
          merchant: { connect: { id: input.merchantId } },
          codAmount: input.codAmount,
          serviceTier: input.serviceTier ?? ServiceTier.LOCAL,
          weight: input.weight,
          recipientName: input.recipientName,
          recipientPhone: input.recipientPhone,
          recipientAddress: input.recipientAddress,
          notes: input.notes,
          status: ParcelStatus.PENDING,
        },
        tx,
      );

      await AuditService.log({
        userId,
        entity: 'Parcel',
        entityId: created.id,
        action: AuditAction.CREATE,
        newValue: {
          trackingId,
          status: ParcelStatus.PENDING,
          codAmount: input.codAmount,
          serviceTier: input.serviceTier ?? ServiceTier.LOCAL,
        },
      }, tx);

      return created;
    });

    return parcel;
  }

  /**
   * Update a parcel's status with full validation.
   */
  static async updateStatus(
    parcelId: string,
    newStatus: ParcelStatus,
    userId: string,
    userRole: Role,
    metadata: Omit<DeliveryMetadata, 'performedBy'> = {},
  ) {
    const parcel = await ParcelRepository.findById(parcelId);
    if (!parcel) {
      throw new NotFoundException('Parcel', parcelId);
    }

    // ─── Validate status transition ────────────────────────────
    const allowedTransitions = VALID_STATUS_TRANSITIONS[parcel.status] || [];
    if (!allowedTransitions.includes(newStatus)) {
      throw new ConflictException(
        `Cannot transition from '${parcel.status}' to '${newStatus}'. ` +
        `Allowed: ${allowedTransitions.join(', ') || 'none (terminal state)'}`,
      );
    }

    // ─── Courier authorization check ───────────────────────────
    // Edge case: courier tries to update a parcel not assigned to them
    if (userRole === Role.COURIER && parcel.courierId !== userId) {
      throw new ForbiddenException(
        'You cannot update a parcel that is not assigned to you',
      );
    }

    // ─── Handle DELIVERED → atomic financial settlement ────────
    if (newStatus === ParcelStatus.DELIVERED) {
      const courierId = userRole === Role.COURIER ? userId : parcel.courierId;
      if (!courierId) {
        throw new ConflictException('Cannot deliver a parcel with no assigned courier');
      }
      return this.markAsDelivered(parcel.id, courierId, { ...metadata, performedBy: userId });
    }

    // ─── Standard status update ────────────────────────────────
    const previousStatus = parcel.status;
    const updated = await prisma.$transaction(async (tx) => {
      const result = await ParcelRepository.updateStatus(parcel.id, newStatus, {}, tx);

      await AuditService.log({
        userId,
        entity: 'Parcel',
        entityId: parcel.id,
        action: AuditAction.STATUS_CHANGE,
        previousValue: { status: previousStatus },
        newValue: { status: newStatus },
      }, tx);

      return result;
    });

    return updated;
  }

  /**
   * Assign a courier to a parcel (admin only).
   * Transitions status from PENDING → PICKED_UP.
   */
  static async assignCourier(parcelId: string, courierId: string, adminId: string) {
    const parcel = await ParcelRepository.findById(parcelId);
    if (!parcel) {
      throw new NotFoundException('Parcel', parcelId);
    }

    if (parcel.status !== ParcelStatus.PENDING) {
      throw new ConflictException(
        `Cannot assign courier: parcel status is '${parcel.status}', expected 'PENDING'`,
      );
    }

    // Verify courier exists and has COURIER role
    const courier = await prisma.user.findUnique({ where: { id: courierId } });
    if (!courier || courier.role !== Role.COURIER || !courier.isActive) {
      throw new NotFoundException('Courier', courierId);
    }

    // Lock the commission rate now so later rate-card changes don't alter it.
    const courierCommission = this.calculateCommission(parcel);

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.parcel.update({
        where: { id: parcelId },
        data: {
          status: ParcelStatus.PICKED_UP,
          courierId,
          courierCommission: courierCommission.toFixed(2),
        },
      });

      await AuditService.log({
        userId: adminId,
        entity: 'Parcel',
        entityId: parcelId,
        action: AuditAction.COURIER_ASSIGNED,
        previousValue: { status: ParcelStatus.PENDING, courierId: null },
        newValue: {
          status: ParcelStatus.PICKED_UP,
          courierId,
          serviceTier: parcel.serviceTier,
          courierCommission: courierCommission.toFixed(2),
          commissionStrategy: CommissionService.getStrategy().name,
        },
      }, tx);

      return result;
    });

    return updated;
  }

  /**
   * Mark a parcel DELIVERED and settle the courier's position atomically:
   *   1. Verify the courier is assigned
   *   2. Compare-and-set status OUT_FOR_DELIVERY → DELIVERED (row-locked)
   *   3. Wallet: +commission (COMMISSION_EARNED), +COD cash-in-hand (CASH_COLLECTED)
   *   4. Ledger: COD/fee journal + commission journal
   *   5. Audit trail
   *
   * Step 2 is what makes this safe under concurrency: in READ COMMITTED,
   * a second concurrent UPDATE blocks on the row lock, re-evaluates the WHERE
   * after the first commits, matches 0 rows, and we abort with a 409.
   * The unique (walletId, type, referenceId) index is a second, DB-level guard.
   */
  static async markAsDelivered(parcelId: string, courierId: string, metadata: DeliveryMetadata = {}) {
    const performedBy = metadata.performedBy ?? courierId;

    return prisma.$transaction(async (tx) => {
      const parcel = await tx.parcel.findUnique({ where: { id: parcelId } });
      if (!parcel) {
        throw new NotFoundException('Parcel', parcelId);
      }
      if (parcel.courierId !== courierId) {
        throw new ForbiddenException('You cannot update a parcel that is not assigned to you');
      }

      const deliveredAt = new Date();
      const { count } = await tx.parcel.updateMany({
        where: { id: parcelId, courierId, status: ParcelStatus.OUT_FOR_DELIVERY },
        data: { status: ParcelStatus.DELIVERED, deliveredAt },
      });
      if (count === 0) {
        throw new ConflictException(
          `Parcel ${parcel.trackingId} is not OUT_FOR_DELIVERY (it may already have been delivered)`,
        );
      }

      // Parcels assigned before this feature have no snapshot — compute and persist once.
      let commission: Decimal;
      if (parcel.courierCommission !== null) {
        commission = new Decimal(parcel.courierCommission.toString());
      } else {
        commission = this.calculateCommission(parcel);
        await tx.parcel.update({
          where: { id: parcelId },
          data: { courierCommission: commission.toFixed(2) },
        });
      }
      const codAmount = new Decimal(parcel.codAmount.toString());

      // Wallet BEFORE ledger: first-time wallet provisioning reads the ledger's
      // existing cash-in-hand as the opening balance.
      const wallet = await CourierWalletService.recordDelivery(
        { courierUserId: courierId, parcelId, commission, codAmount },
        tx,
      );

      await LedgerService.recordDelivery(parcel, performedBy, tx);
      await LedgerService.recordCourierCommission(parcel, commission, performedBy, tx);

      await AuditService.log({
        userId: performedBy,
        entity: 'Parcel',
        entityId: parcelId,
        action: AuditAction.STATUS_CHANGE,
        previousValue: { status: parcel.status },
        newValue: {
          status: ParcelStatus.DELIVERED,
          deliveredAt: deliveredAt.toISOString(),
          courierCommission: commission.toFixed(2),
          codCollected: codAmount.toFixed(2),
          walletId: wallet.id,
          ...(metadata.note && { note: metadata.note }),
        },
      }, tx);

      return tx.parcel.findUniqueOrThrow({ where: { id: parcelId } });
    });
  }

  private static calculateCommission(parcel: Pick<Parcel, 'serviceTier' | 'codAmount' | 'weight'>): Decimal {
    return CommissionService.calculate({
      serviceTier: parcel.serviceTier,
      codAmount: parcel.codAmount.toString(),
      weight: parcel.weight?.toString() ?? null,
    });
  }

  /**
   * Get a parcel by ID.
   */
  static async getById(parcelId: string) {
    const parcel = await ParcelRepository.findById(parcelId);
    if (!parcel) {
      throw new NotFoundException('Parcel', parcelId);
    }
    return parcel;
  }

  /**
   * Get a parcel by tracking ID.
   */
  static async getByTrackingId(trackingId: string) {
    const parcel = await ParcelRepository.findByTrackingId(trackingId);
    if (!parcel) {
      throw new NotFoundException('Parcel', trackingId);
    }
    return parcel;
  }

  /**
   * List parcels with pagination and filters.
   */
  static async list(filters: {
    status?: ParcelStatus;
    merchantId?: string;
    courierId?: string;
    page: number;
    pageSize: number;
  }) {
    return ParcelRepository.findMany(filters);
  }
}
