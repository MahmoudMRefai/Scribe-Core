import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { CourierWalletService } from './courier-wallet.service.js';
import { ApiResponse } from '../../shared/api-response.js';

const walletQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export class CourierWalletController {
  /** GET /api/couriers/me/wallet */
  static async getMyWallet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { limit } = walletQuerySchema.parse(req.query);
      const summary = await CourierWalletService.getSummary(req.user!.id, limit);
      res.status(200).json(ApiResponse.success(summary));
    } catch (err) {
      next(err);
    }
  }
}
