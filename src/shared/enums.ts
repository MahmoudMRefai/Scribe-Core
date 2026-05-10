/**
 * Re-export Prisma-generated enums for use throughout the application.
 * This file acts as the single source of truth for all enum types.
 *
 * NOTE: The actual enum values are defined in prisma/schema.prisma.
 * We re-export them here so modules don't need to import from @prisma/client directly.
 */
export {
  Role,
  ParcelStatus,
  AccountType,
  AccountOwnerType,
  SettlementStatus,
} from '@prisma/client';

/**
 * Audit action types — not stored as a Prisma enum because they're
 * free-form strings in the AuditLog.action column, but we enforce
 * them via this TS enum for compile-time safety.
 */
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  STATUS_CHANGE = 'STATUS_CHANGE',
  BALANCE_CHANGE = 'BALANCE_CHANGE',
  SETTLEMENT_INITIATED = 'SETTLEMENT_INITIATED',
  SETTLEMENT_CONFIRMED = 'SETTLEMENT_CONFIRMED',
  SETTLEMENT_DISPUTED = 'SETTLEMENT_DISPUTED',
  DELIVERY_RECORDED = 'DELIVERY_RECORDED',
  COURIER_ASSIGNED = 'COURIER_ASSIGNED',
}
