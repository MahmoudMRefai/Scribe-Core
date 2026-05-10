import { prisma } from '../../config/prisma.js';
import { Prisma } from '@prisma/client';

export class MerchantRepository {
  static async findById(id: string) {
    return prisma.merchant.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, name: true, role: true } } },
    });
  }

  static async findByUserId(userId: string) {
    return prisma.merchant.findUnique({ where: { userId } });
  }

  static async findMany(page = 1, pageSize = 20) {
    const [merchants, total] = await Promise.all([
      prisma.merchant.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, email: true, name: true } } },
      }),
      prisma.merchant.count(),
    ]);
    return { merchants, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  static async update(id: string, data: Prisma.MerchantUpdateInput) {
    return prisma.merchant.update({ where: { id }, data });
  }
}
