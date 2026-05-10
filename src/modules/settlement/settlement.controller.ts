import { Request, Response, NextFunction } from 'express';
import { SettlementService } from './settlement.service.js';
import {
  initiateSettlementSchema,
  confirmSettlementSchema,
  disputeSettlementSchema,
  settlementQuerySchema,
} from './settlement.validation.js';
import { ApiResponse } from '../../shared/api-response.js';
import { SettlementStatus } from '../../shared/enums.js';

export class SettlementController {
  static async initiate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { courierId, amount, notes } = initiateSettlementSchema.parse(req.body);
      const settlement = await SettlementService.initiate(courierId, amount, req.user!.id, notes);
      res.status(201).json(ApiResponse.success(settlement));
    } catch (err) {
      next(err);
    }
  }

  static async confirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { notes } = confirmSettlementSchema.parse(req.body);
      const settlement = await SettlementService.confirm(req.params.id as string, req.user!.id, notes);
      res.status(200).json(ApiResponse.success(settlement));
    } catch (err) {
      next(err);
    }
  }

  static async dispute(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reason } = disputeSettlementSchema.parse(req.body);
      const settlement = await SettlementService.dispute(req.params.id as string, req.user!.id, reason);
      res.status(200).json(ApiResponse.success(settlement));
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const settlement = await SettlementService.getById(req.params.id as string);
      res.status(200).json(ApiResponse.success(settlement));
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = settlementQuerySchema.parse(req.query);
      const result = await SettlementService.list(filters as { courierId?: string; status?: SettlementStatus; page: number; pageSize: number });
      res.status(200).json(ApiResponse.success(result));
    } catch (err) {
      next(err);
    }
  }
}
