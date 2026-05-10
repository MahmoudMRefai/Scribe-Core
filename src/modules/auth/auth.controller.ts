import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import { registerSchemaRefined, loginSchema } from './auth.validation.js';
import { ApiResponse } from '../../shared/api-response.js';

export class AuthController {
  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = registerSchemaRefined.parse(req.body);
      const result = await AuthService.register(data);
      res.status(201).json(ApiResponse.success(result));
    } catch (err) {
      next(err);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const result = await AuthService.login(email, password);
      res.status(200).json(ApiResponse.success(result));
    } catch (err) {
      next(err);
    }
  }
}
