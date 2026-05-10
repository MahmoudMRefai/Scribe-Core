import { Request, Response, NextFunction } from 'express';
import { AuditService } from './audit.service.js';
import { ApiResponse } from '../../shared/api-response.js';

export class AuditController {
  static async query(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { entity, entityId, userId, from, to, page, pageSize } = req.query;
      const result = await AuditService.query({
        entity: entity as string | undefined,
        entityId: entityId as string | undefined,
        userId: userId as string | undefined,
        from: from ? new Date(from as string) : undefined,
        to: to ? new Date(to as string) : undefined,
        page: page ? parseInt(page as string) : 1,
        pageSize: pageSize ? parseInt(pageSize as string) : 20,
      });
      res.status(200).json(ApiResponse.success(result));
    } catch (err) {
      next(err);
    }
  }
}
