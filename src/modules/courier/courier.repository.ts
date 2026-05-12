import { prisma } from '../../config/prisma.js';
import { Prisma } from '@prisma/client';

export class CourierRepository {
  static async findById(id: string) {
    return prisma.courier.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, name: true, role: true } } },
    });
  }

  static async findByUserId(userId: string) {
    return prisma.courier.findUnique({ where: { userId } });
  }

  static async findMany(page = 1, pageSize = 20) {
    const [couriers, total] = await Promise.all([
      prisma.courier.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, email: true, name: true } } },
      }),
      prisma.courier.count(),
    ]);
    return { couriers, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  static async update(id: string, data: Prisma.CourierUpdateInput) {
    return prisma.courier.update({ where: { id }, data });
  }
}
