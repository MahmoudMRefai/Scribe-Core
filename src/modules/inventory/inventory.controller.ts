import { Request, Response, NextFunction } from 'express';
import { InventoryService } from './inventory.service.js';
import { MerchantService } from '../merchant/merchant.service.js';
import {
  createInventorySchema,
  bulkCreateInventorySchema,
  updateInventorySchema,
  triggerDeliverySchema
} from './inventory.validation.js';
import { ApiResponse } from '../../shared/api-response.js';

export class InventoryController {
  /** Helper: get the merchant ID for the current user */
  private static async getMerchantId(req: Request): Promise<string> {
    const merchant = await MerchantService.getByUserId(req.user!.id);
    return merchant.id;
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = await InventoryController.getMerchantId(req);

      if (Array.isArray(req.body)) {
        const data = bulkCreateInventorySchema.parse(req.body);
        const result = await InventoryService.createMany(merchantId, data);
        res.status(201).json(ApiResponse.success(result));
      } else {
        const data = createInventorySchema.parse(req.body);
        const item = await InventoryService.create(merchantId, data);
        res.status(201).json(ApiResponse.success(item));
      }
    } catch (err) { next(err); }
  }

  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = await InventoryController.getMerchantId(req);
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const result = await InventoryService.getByMerchant(merchantId, page, pageSize);
      res.status(200).json(ApiResponse.success(result));
    } catch (err) { next(err); }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = updateInventorySchema.parse(req.body);
      const merchantId = await InventoryController.getMerchantId(req);
      const item = await InventoryService.update(req.params.id as string, merchantId, data);
      res.status(200).json(ApiResponse.success(item));
    } catch (err) { next(err); }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = await InventoryController.getMerchantId(req);
      await InventoryService.delete(req.params.id as string, merchantId);
      res.status(200).json(ApiResponse.success({ deleted: true }));
    } catch (err) { next(err); }
  }

  static async triggerDelivery(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = triggerDeliverySchema.parse(req.body);
      const merchantId = await InventoryController.getMerchantId(req);
      const parcel = await InventoryService.triggerDelivery(
        req.params.id as string, merchantId, req.user!.id, data,
      );
      res.status(201).json(ApiResponse.success(parcel));
    } catch (err) { next(err); }
  }
}
