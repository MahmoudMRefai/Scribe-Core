import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

export class InventoryRepository {
  static async create(data: Prisma.InventoryItemCreateInput) {
    return prisma.inventoryItem.create({ data });
  }

  static async createMany(data: Prisma.InventoryItemCreateManyInput[]) {
    return prisma.inventoryItem.createMany({ data });
  }

  static async findById(id: string) {
    return prisma.inventoryItem.findUnique({ where: { id } });
  }

  static async findByMerchant(merchantId: string, page = 1, pageSize = 20) {
    const [items, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: { merchantId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.inventoryItem.count({ where: { merchantId } }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  static async update(id: string, data: Prisma.InventoryItemUpdateInput, tx?: Prisma.TransactionClient) {
    const client = tx || prisma;
    return client.inventoryItem.update({ where: { id }, data });
  }

  static async delete(id: string) {
    return prisma.inventoryItem.delete({ where: { id } });
  }
}
