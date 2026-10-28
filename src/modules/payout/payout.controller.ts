import { Request, Response, NextFunction } from 'express';
import { PayoutService } from './payout.service.js';
import {
  requestPayoutSchema,
  sendDirectPayoutSchema,
  disbursePayoutSchema,
  rejectPayoutSchema,
  payoutQuerySchema,
} from './payout.validation.js';
import { ApiResponse } from '../../shared/api-response.js';
import { Role } from '@prisma/client';

export class PayoutController {
  static async request(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = requestPayoutSchema.parse(req.body);
      const role = req.user!.role as 'COURIER' | 'MERCHANT';
      const payout = await PayoutService.request(req.user!.id, role, data.amount, data.notes);
      res.status(201).json(ApiResponse.success(payout));
    } catch (err) {
      next(err);
    }
  }

  static async sendDirect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = sendDirectPayoutSchema.parse(req.body);
      const payout = await PayoutService.sendDirect(req.user!.id, data.recipientId, data.amount, data.notes);
      res.status(201).json(ApiResponse.success(payout));
    } catch (err) {
      next(err);
    }
  }

  static async getRecipientBalances(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const balances = await PayoutService.getRecipientBalances();
      res.status(200).json(ApiResponse.success(balances));
    } catch (err) {
      next(err);
    }
  }

  static async disburse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = disbursePayoutSchema.parse(req.body);
      const payout = await PayoutService.disburse(req.params.id as string, req.user!.id, data.notes);
      res.status(200).json(ApiResponse.success(payout));
    } catch (err) {
      next(err);
    }
  }

  static async confirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payout = await PayoutService.confirm(req.params.id as string, req.user!.id);
      res.status(200).json(ApiResponse.success(payout));
    } catch (err) {
      next(err);
    }
  }

  static async reject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = rejectPayoutSchema.parse(req.body ?? {});
      const payout = await PayoutService.reject(req.params.id as string, req.user!.id, req.user!.role, data.reason);
      res.status(200).json(ApiResponse.success(payout));
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = payoutQuerySchema.parse(req.query);

      // If caller is courier or merchant, scope to their own payouts unless admin
      let recipientId = query.recipientId;
      if (req.user!.role !== Role.ADMIN) {
        recipientId = req.user!.id;
      }

      const result = await PayoutService.list({
        ...query,
        recipientId,
      });
      res.status(200).json(ApiResponse.success(result));
    } catch (err) {
      next(err);
    }
  }
}

