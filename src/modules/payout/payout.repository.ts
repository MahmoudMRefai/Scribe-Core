import { Prisma, Payout, PayoutStatus, PayoutRecipientType } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

export class PayoutRepository {
  static async create(data: Prisma.PayoutCreateInput, tx?: Prisma.TransactionClient): Promise<Payout> {
    const client = tx || prisma;
    return client.payout.create({ data });
  }

  static async findById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx || prisma;
    return client.payout.findUnique({
      where: { id },
      include: {
        recipient: { select: { id: true, name: true, email: true, phone: true, role: true } },
        admin: { select: { id: true, name: true, email: true } },
      },
    });
  }

  static async findMany(filters: {
    recipientId?: string;
    recipientType?: PayoutRecipientType;
    status?: PayoutStatus;
    page: number;
    pageSize: number;
  }) {
    const { recipientId, recipientType, status, page, pageSize } = filters;
    const where: Prisma.PayoutWhereInput = {
      ...(recipientId && { recipientId }),
      ...(recipientType && { recipientType }),
      ...(status && { status }),
    };

    const [payouts, total] = await Promise.all([
      prisma.payout.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          recipient: { select: { id: true, name: true, email: true, phone: true, role: true } },
          admin: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.payout.count({ where }),
    ]);

    return { payouts, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  static async update(id: string, data: Prisma.PayoutUpdateInput, tx?: Prisma.TransactionClient): Promise<Payout> {
    const client = tx || prisma;
    return client.payout.update({ where: { id }, data });
  }
}

