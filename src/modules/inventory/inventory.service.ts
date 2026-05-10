/**
 * Inventory Service — merchant fulfillment module.
 */
import { prisma } from '../../config/prisma.js';
import { InventoryRepository } from './inventory.repository.js';
import { ParcelService } from '../parcel/parcel.service.js';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '../../shared/errors.js';

export class InventoryService {
  static async create(merchantId: string, data: { sku: string; name: string; quantity: number; unitValue?: number; unitWeight?: number; location?: string }) {
    // Check if SKU already exists for this merchant
    const existing = await prisma.inventoryItem.findUnique({
      where: { merchantId_sku: { merchantId, sku: data.sku } }
    });

    if (existing) {
      throw new ConflictException(`An inventory item with SKU '${data.sku}' already exists. You cannot add it again.`);
    }

    const item = await InventoryRepository.create({
      merchant: { connect: { id: merchantId } },
      ...data,
    });

    return this.mapResponse(item);
  }

  static async createMany(merchantId: string, items: { sku: string; name: string; quantity: number; unitValue?: number; unitWeight?: number; location?: string }[]) {
    const skus = items.map(i => i.sku);

    // Check for existing SKUs in the batch
    const existingItems = await prisma.inventoryItem.findMany({
      where: {
        merchantId,
        sku: { in: skus }
      },
      select: { sku: true }
    });

    if (existingItems.length > 0) {
      const existingSkus = existingItems.map(i => i.sku).join(', ');
      throw new ConflictException(`The following SKUs already exist and cannot be added again: ${existingSkus}`);
    }

    // We use a transaction of individual creates to get the full objects back
    const createdItems = await prisma.$transaction(
      items.map(item =>
        prisma.inventoryItem.create({
          data: {
            merchantId,
            ...item
          }
        })
      )
    );

    return createdItems.map(item => this.mapResponse(item));
  }

  static async getByMerchant(merchantId: string, page = 1, pageSize = 20) {
    const result = await InventoryRepository.findByMerchant(merchantId, page, pageSize);

    const mappedItems = result.items.map(item => this.mapResponse(item));

    return {
      ...result,
      items: mappedItems
    };
  }

  static async update(itemId: string, merchantId: string, data: { name?: string; quantity?: number; unitValue?: number; unitWeight?: number; location?: string }) {
    const item = await InventoryRepository.findById(itemId);
    if (!item) throw new NotFoundException('InventoryItem', itemId);
    if (item.merchantId !== merchantId) throw new ForbiddenException('This item does not belong to your merchant account');

    const updated = await InventoryRepository.update(itemId, data);
    return this.mapResponse(updated);
  }

  static async delete(itemId: string, merchantId: string) {
    const item = await InventoryRepository.findById(itemId);
    if (!item) throw new NotFoundException('InventoryItem', itemId);
    if (item.merchantId !== merchantId) throw new ForbiddenException('This item does not belong to your merchant account');
    return InventoryRepository.delete(itemId);
  }

  /**
   * Helper to map DB response to API response with calculated values
   */
  private static mapResponse(item: any) {
    const unitValue = Number(item.unitValue);
    const unitWeight = item.unitWeight ? Number(item.unitWeight) : 0;
    
    // Explicitly destructure out internal fields so they don't appear in the final JSON
    const { unitWeight: _, unitValue: __, ...rest } = item;

    return {
      ...rest,
      totalValue: unitValue * item.quantity,
      totalWeight: unitWeight * item.quantity
    };
  }

  /**
   * Create a parcel from an inventory item and decrement stock.
   */
  static async triggerDelivery(
    itemId: string,
    merchantId: string,
    userId: string,
    data: {
      quantity: number;
      recipientName: string;
      recipientPhone: string;
      recipientAddress: string;
      notes?: string;
    },
  ) {
    const item = await InventoryRepository.findById(itemId);
    if (!item) throw new NotFoundException('InventoryItem', itemId);
    if (item.merchantId !== merchantId) {
      throw new ForbiddenException('This item does not belong to your merchant account');
    }
    if (item.quantity < data.quantity) {
      throw new ConflictException(
        `Insufficient stock: requested ${data.quantity}, available ${item.quantity}`,
      );
    }

    // Atomic: decrement stock + create parcel
    const result = await prisma.$transaction(async (tx) => {
      await InventoryRepository.update(itemId, {
        quantity: { decrement: data.quantity },
      }, tx);

      const totalWeight = item.unitWeight ? Number(item.unitWeight) * data.quantity : undefined;

      const parcel = await ParcelService.create({
        merchantId,
        codAmount: Number(item.unitValue) * data.quantity, // Auto-calculated!
        weight: totalWeight, // Auto-calculated from unit weight * quantity!
        recipientName: data.recipientName,
        recipientPhone: data.recipientPhone,
        recipientAddress: data.recipientAddress,
        notes: data.notes || `Fulfillment: ${data.quantity}x ${item.name} (SKU: ${item.sku})`,
      }, userId);

      return parcel;
    });

    return result;
  }
}
