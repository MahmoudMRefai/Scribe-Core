import { Request, Response, NextFunction } from 'express';
import { WalletService } from './wallet.service.js';
import { walletQuerySchema } from './wallet.validation.js';
import { ApiResponse } from '../../shared/api-response.js';

export class WalletController {
  static async getMyWallet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const accounts = await WalletService.getByOwnerId(req.user!.id);
      res.status(200).json(ApiResponse.success(accounts));
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const account = await WalletService.getById(req.params.id as string);
      res.status(200).json(ApiResponse.success(account));
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = walletQuerySchema.parse(req.query);
      const accounts = await WalletService.list(filters);
      res.status(200).json(ApiResponse.success(accounts));
    } catch (err) {
      next(err);
    }
  }

  static async getTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const result = await WalletService.getTransactions(req.params.id as string, page, pageSize);
      res.status(200).json(ApiResponse.success(result));
    } catch (err) {
      next(err);
    }
  }
}
