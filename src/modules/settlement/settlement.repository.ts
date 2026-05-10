import { Prisma, SettlementStatus } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

export class SettlementRepository {
  static async create(data: Prisma.SettlementCreateInput, tx?: Prisma.TransactionClient) {
    const client = tx || prisma;
    return client.settlement.create({ data });
  }

  static async findById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx || prisma;
    return client.settlement.findUnique({
      where: { id },
      include: {
        courier: { select: { id: true, name: true, email: true } },
        admin: { select: { id: true, name: true, email: true } },
      },
    });
  }

  static async update(
    id: string,
    data: Prisma.SettlementUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || prisma;
    return client.settlement.update({ where: { id }, data });
  }

  static async findMany(filters: {
    courierId?: string;
    status?: SettlementStatus;
    page: number;
    pageSize: number;
  }) {
    const { courierId, status, page, pageSize } = filters;
    const where: Prisma.SettlementWhereInput = {
      ...(courierId && { courierId }),
      ...(status && { status }),
    };

    const [settlements, total] = await Promise.all([
      prisma.settlement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          courier: { select: { id: true, name: true } },
          admin: { select: { id: true, name: true } },
        },
      }),
      prisma.settlement.count({ where }),
    ]);

    return { settlements, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }
}
