/**
 * Audit Service — immutable logging for every mutation.
 *
 * Called by every service that changes a parcel status, wallet balance,
 * or settlement. Audit records are write-only — never updated or deleted.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../config/prisma.js';

export interface AuditLogInput {
  userId: string;
  entity: string;       // e.g., 'Parcel', 'LedgerAccount', 'Settlement'
  entityId: string;
  action: string;       // AuditAction enum value
  previousValue?: unknown;
  newValue?: unknown;
}

export class AuditService {
  /**
   * Write an audit log entry.
   *
   * @param input  - Who, what, when, previous value, new value
   * @param tx     - Optional Prisma transaction client (for ACID with parent operation)
   */
  static async log(
    input: AuditLogInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx || defaultPrisma;
    await client.auditLog.create({
      data: {
        userId: input.userId,
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        previousValue: input.previousValue as Prisma.JsonValue ?? Prisma.JsonNull,
        newValue: input.newValue as Prisma.JsonValue ?? Prisma.JsonNull,
      },
    });
  }

  /**
   * Query audit logs (admin only). Supports filtering by entity, entityId, userId, date range.
   */
  static async query(filters: {
    entity?: string;
    entityId?: string;
    userId?: string;
    from?: Date;
    to?: Date;
    page?: number;
    pageSize?: number;
  }) {
    const { entity, entityId, userId, from, to, page = 1, pageSize = 20 } = filters;

    const where: Prisma.AuditLogWhereInput = {
      ...(entity && { entity }),
      ...(entityId && { entityId }),
      ...(userId && { userId }),
      ...((from || to) && {
        timestamp: {
          ...(from && { gte: from }),
          ...(to && { lte: to }),
        },
      }),
    };

    const [logs, total] = await Promise.all([
      defaultPrisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      }),
      defaultPrisma.auditLog.count({ where }),
    ]);

    return { logs, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }
}
