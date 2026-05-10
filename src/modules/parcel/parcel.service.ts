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
 */
import { ParcelStatus, Role } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { VALID_STATUS_TRANSITIONS } from '../../config/constants.js';
import { ParcelRepository } from './parcel.repository.js';
import { BarcodeUtil } from './barcode.util.js';
import { LedgerService } from '../ledger/ledger.service.js';
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
  weight?: number;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  notes?: string;
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

    // Atomic: generate tracking ID + create parcel
    const parcel = await prisma.$transaction(async (tx) => {
      const trackingId = await BarcodeUtil.generate(tx);

      const created = await ParcelRepository.create(
        {
          trackingId,
          merchant: { connect: { id: input.merchantId } },
          codAmount: input.codAmount,
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
        newValue: { trackingId, status: ParcelStatus.PENDING, codAmount: input.codAmount },
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

    // ─── Handle DELIVERED → trigger financial recording ────────
    if (newStatus === ParcelStatus.DELIVERED) {
      return this.handleDelivery(parcel.id, userId);
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

    const updated = await prisma.$transaction(async (tx) => {
      const result = await ParcelRepository.updateStatus(
        parcelId,
        ParcelStatus.PICKED_UP,
        { courierId },
        tx,
      );

      await AuditService.log({
        userId: adminId,
        entity: 'Parcel',
        entityId: parcelId,
        action: AuditAction.COURIER_ASSIGNED,
        previousValue: { status: ParcelStatus.PENDING, courierId: null },
        newValue: { status: ParcelStatus.PICKED_UP, courierId },
      }, tx);

      return result;
    });

    return updated;
  }

  /**
   * Handle DELIVERED status — updates parcel AND records financial entries.
   * All within a single Prisma interactive transaction for ACID compliance.
   */
  private static async handleDelivery(parcelId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const parcel = await tx.parcel.findUniqueOrThrow({ where: { id: parcelId } });
      const previousStatus = parcel.status;

      // Update parcel status to DELIVERED
      const updated = await ParcelRepository.updateStatus(
        parcelId,
        ParcelStatus.DELIVERED,
        { deliveredAt: new Date() },
        tx,
      );

      // Record financial entries (double-entry + balance updates)
      await LedgerService.recordDelivery(parcel, userId, tx);

      // Audit: status change
      await AuditService.log({
        userId,
        entity: 'Parcel',
        entityId: parcelId,
        action: AuditAction.STATUS_CHANGE,
        previousValue: { status: previousStatus },
        newValue: { status: ParcelStatus.DELIVERED },
      }, tx);

      return updated;
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
