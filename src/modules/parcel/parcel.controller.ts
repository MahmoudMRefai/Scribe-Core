import { Request, Response, NextFunction } from 'express';
import { ParcelService } from './parcel.service.js';
import {
  createParcelSchema,
  updateParcelStatusSchema,
  assignCourierSchema,
  parcelQuerySchema,
} from './parcel.validation.js';
import { ApiResponse } from '../../shared/api-response.js';
import { ParcelStatus } from '../../shared/enums.js';

export class ParcelController {
  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = createParcelSchema.parse(req.body);
      const parcel = await ParcelService.create(data, req.user!.id);
      res.status(201).json(ApiResponse.success(parcel));
    } catch (err) {
      next(err);
    }
  }

  static async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, deliveryNote } = updateParcelStatusSchema.parse(req.body);
      const parcel = await ParcelService.updateStatus(
        req.params.id as string,
        status as ParcelStatus,
        req.user!.id,
        req.user!.role,
        { note: deliveryNote },
      );
      res.status(200).json(ApiResponse.success(parcel));
    } catch (err) {
      next(err);
    }
  }

  static async assignCourier(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { courierId } = assignCourierSchema.parse(req.body);
      const parcel = await ParcelService.assignCourier(req.params.id as string, courierId, req.user!.id);
      res.status(200).json(ApiResponse.success(parcel));
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parcel = await ParcelService.getById(req.params.id as string);
      res.status(200).json(ApiResponse.success(parcel));
    } catch (err) {
      next(err);
    }
  }

  static async getByTrackingId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parcel = await ParcelService.getByTrackingId(req.params.trackingId as string);
      res.status(200).json(ApiResponse.success(parcel));
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = parcelQuerySchema.parse(req.query);
      const result = await ParcelService.list(filters as { status?: ParcelStatus; merchantId?: string; courierId?: string; page: number; pageSize: number });
      res.status(200).json(ApiResponse.success(result));
    } catch (err) {
      next(err);
    }
  }
}
