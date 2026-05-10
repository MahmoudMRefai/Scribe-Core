import { Request, Response, NextFunction } from 'express';
import { MerchantService } from './merchant.service.js';
import { updateMerchantSchema } from './merchant.validation.js';
import { ApiResponse } from '../../shared/api-response.js';

export class MerchantController {
  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await MerchantService.getById(req.params.id as string);
      res.status(200).json(ApiResponse.success(merchant));
    } catch (err) { next(err); }
  }

  static async getMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await MerchantService.getByUserId(req.user!.id);
      res.status(200).json(ApiResponse.success(merchant));
    } catch (err) { next(err); }
  }

  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const result = await MerchantService.list(page, pageSize);
      res.status(200).json(ApiResponse.success(result));
    } catch (err) { next(err); }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = updateMerchantSchema.parse(req.body);
      const merchant = await MerchantService.update(req.params.id as string, data);
      res.status(200).json(ApiResponse.success(merchant));
    } catch (err) { next(err); }
  }
}
