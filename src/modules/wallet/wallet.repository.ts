import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

export class WalletRepository {
  static async findByOwnerId(ownerId: string) {
    return prisma.account.findMany({ where: { ownerId } });
  }

  static async findById(id: string) {
    return prisma.account.findUnique({ where: { id } });
  }

  static async findMany(filters: {
    ownerId?: string;
    ownerType?: string;
  }) {
    const where: Prisma.AccountWhereInput = {
      ...(filters.ownerId && { ownerId: filters.ownerId }),
      ...(filters.ownerType && { ownerType: filters.ownerType as any }),
    };
    return prisma.account.findMany({
      where,
      include: { owner: { select: { id: true, name: true, email: true, role: true } } },
    });
  }

  /** Get the transaction history (journal lines) for an account */
  static async getTransactions(accountId: string, page = 1, pageSize = 20) {
    const [lines, total] = await Promise.all([
      prisma.journalLine.findMany({
        where: { accountId },
        orderBy: { entry: { createdAt: 'desc' } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          entry: { select: { id: true, description: true, createdAt: true } },
        },
      }),
      prisma.journalLine.count({ where: { accountId } }),
    ]);
    return { lines, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }
}
