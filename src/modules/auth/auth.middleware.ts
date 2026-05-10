/**
 * Auth Middleware — JWT verification and role-based authorization.
 *
 * authenticate(): Extracts and verifies the Bearer token, attaches user to req.
 * authorize(...roles): Checks that the authenticated user has one of the allowed roles.
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { Role } from '../../shared/enums.js';
import { UnauthorizedException, ForbiddenException } from '../../shared/errors.js';

// Extend Express Request to carry authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: Role;
      };
    }
  }
}

interface JwtPayload {
  sub: string;
  role: Role;
  iat: number;
  exp: number;
}

/**
 * Middleware: Verify JWT and attach user to request.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }

    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or deactivated');
    }

    req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
    next();
  } catch (err) {
    if (err instanceof UnauthorizedException) {
      next(err);
    } else {
      next(new UnauthorizedException('Invalid or expired token'));
    }
  }
}

/**
 * Middleware factory: Restrict access to specific roles.
 *
 * Usage: router.get('/admin-only', authenticate, authorize(Role.ADMIN), handler);
 */
export function authorize(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedException());
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(new ForbiddenException(
        `Role '${req.user.role}' is not authorized. Required: ${allowedRoles.join(', ')}`,
      ));
      return;
    }

    next();
  };
}
