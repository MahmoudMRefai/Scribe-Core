/**
 * Parcel Repository — data access layer for parcels.
 *
 * Thin wrapper around Prisma queries. Business logic stays in the service.
 */
import { Prisma, Parcel, ParcelStatus } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

export class ParcelRepository {
  static async create(data: Prisma.ParcelCreateInput, tx?: Prisma.TransactionClient): Promise<Parcel> {
    const client = tx || prisma;
    return client.parcel.create({ data });
  }

  static async findById(id: string): Promise<Parcel | null> {
    return prisma.parcel.findUnique({ where: { id } });
  }

  static async findByTrackingId(trackingId: string): Promise<Parcel | null> {
    return prisma.parcel.findUnique({ where: { trackingId } });
  }

  static async findMany(filters: {
    status?: ParcelStatus;
    merchantId?: string;
    courierId?: string;
    page: number;
    pageSize: number;
  }) {
    const { status, merchantId, courierId, page, pageSize } = filters;
    const where: Prisma.ParcelWhereInput = {
      ...(status && { status }),
      ...(merchantId && { merchantId }),
      ...(courierId && { courierId }),
    };

    const [parcels, total] = await Promise.all([
      prisma.parcel.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          merchant: { select: { id: true, businessName: true } },
          courier: { select: { id: true, name: true } },
        },
      }),
      prisma.parcel.count({ where }),
    ]);

    return { parcels, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  static async updateStatus(
    id: string,
    status: ParcelStatus,
    extra: Partial<Pick<Parcel, 'courierId' | 'deliveredAt'>> = {},
    tx?: Prisma.TransactionClient,
  ): Promise<Parcel> {
    const client = tx || prisma;
    return client.parcel.update({
      where: { id },
      data: { status, ...extra },
    });
  }
}
