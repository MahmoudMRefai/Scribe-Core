/**
 * Auth Service — registration and login with JWT.
 *
 * Happy Path (register):
 *   1. Validate input → 2. Check email uniqueness → 3. Hash password →
 *   4. Create User → 5. If MERCHANT, create Merchant record →
 *   6. If COURIER/MERCHANT, create ledger Account → 7. Return JWT.
 *
 * Happy Path (login):
 *   1. Find user by email → 2. Verify password → 3. Return JWT.
 *
 * Edge Cases:
 *   - Duplicate email → ConflictException
 *   - Wrong password → UnauthorizedException
 *   - Inactive user → UnauthorizedException
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { Role, AccountType, AccountOwnerType } from '../../shared/enums.js';
import {
  ConflictException,
  UnauthorizedException,
} from '../../shared/errors.js';

interface RegisterInput {
  email: string;
  password: string;
  name: string;
  phone?: string;
  role: Role;
  businessName?: string;
  businessAddress?: string;
}

interface AuthResult {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
  };
}

export class AuthService {
  static async register(input: RegisterInput): Promise<AuthResult> {
    // Check for existing email
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictException(`Email '${input.email}' is already registered`);
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    // Use transaction to ensure User + Merchant + Account are created atomically
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          name: input.name,
          phone: input.phone,
          role: input.role,
        },
      });

      // Create Merchant record if role is MERCHANT
      if (input.role === Role.MERCHANT) {
        await tx.merchant.create({
          data: {
            userId: newUser.id,
            businessName: input.businessName || input.name,
            address: input.businessAddress,
            phone: input.phone,
            flatDeliveryFee: env.FLAT_DELIVERY_FEE,
          },
        });
      }

      // Create ledger accounts for COURIER and MERCHANT users
      if (input.role === Role.COURIER || input.role === Role.MERCHANT) {
        const ownerType = input.role === Role.COURIER
          ? AccountOwnerType.COURIER
          : AccountOwnerType.MERCHANT;

        await tx.account.create({
          data: {
            ownerId: newUser.id,
            ownerType,
            type: AccountType.ASSET,
            name: `${input.role} Wallet — ${input.name}`,
          },
        });
      }

      return newUser;
    });

    const token = AuthService.signToken(user.id, user.role);
    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  static async login(email: string, password: string): Promise<AuthResult> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = AuthService.signToken(user.id, user.role);
    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  private static signToken(userId: string, role: Role): string {
    const options: jwt.SignOptions = {
      expiresIn: env.JWT_EXPIRES_IN as unknown as jwt.SignOptions['expiresIn'],
    };
    return jwt.sign(
      { sub: userId, role },
      env.JWT_SECRET,
      options,
    );
  }
}
