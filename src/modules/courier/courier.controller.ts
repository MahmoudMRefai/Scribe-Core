import { Request, Response, NextFunction } from 'express';
import { CourierService } from './courier.service.js';
import { updateCourierSchema } from './courier.validation.js';
import { ApiResponse } from '../../shared/api-response.js';

export class CourierController {
  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const courier = await CourierService.getById(req.params.id as string);
      res.status(200).json(ApiResponse.success(courier));
    } catch (err) { next(err); }
  }

  static async getMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const courier = await CourierService.getByUserId(req.user!.id);
      res.status(200).json(ApiResponse.success(courier));
    } catch (err) { next(err); }
  }

  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const result = await CourierService.list(page, pageSize);
      res.status(200).json(ApiResponse.success(result));
    } catch (err) { next(err); }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = updateCourierSchema.parse(req.body);
      const courier = await CourierService.update(req.params.id as string, data);
      res.status(200).json(ApiResponse.success(courier));
    } catch (err) { next(err); }
  }
}
