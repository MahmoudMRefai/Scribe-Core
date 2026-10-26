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
import { Role, AccountType, AccountOwnerType, VehicleType } from '../../shared/enums.js';
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
  businessAddress?: string;   // merchant address
  vehicleType?: VehicleType;
  address?: string;           // courier address
}

interface AuthResult {
  token: string;
  user: {
    id: string;
    email: string;
    phone: string | null;
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

    // Check for existing phone
    if (input.phone) {
      const normalizedPhone = AuthService.normalizePhone(input.phone);
      const existingPhone = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
      if (existingPhone) {
        throw new ConflictException(`Phone number '${input.phone}' is already registered`);
      }
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    // Use transaction to ensure User + Merchant + Account are created atomically
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          name: input.name,
          phone: input.phone ? AuthService.normalizePhone(input.phone) : undefined,
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

      // Create Courier record if role is COURIER
      if (input.role === Role.COURIER) {
        await tx.courier.create({
          data: {
            userId: newUser.id,
            phone: input.phone,
            vehicleType: input.vehicleType,
            address: input.address,
          },
        });
      }

      // Create ledger accounts for COURIER and MERCHANT users
      if (input.role === Role.COURIER || input.role === Role.MERCHANT) {
        const ownerType = input.role === Role.COURIER
          ? AccountOwnerType.COURIER
          : AccountOwnerType.MERCHANT;

        await tx.ledgerAccount.create({
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
      user: { id: user.id, email: user.email, phone: user.phone, name: user.name, role: user.role },
    };
  }

  static async login(
    identifier: { email?: string; phone?: string } | string,
    password: string,
  ): Promise<AuthResult> {
    let user = null;

    if (typeof identifier === 'string') {
      if (identifier.includes('@')) {
        user = await prisma.user.findUnique({
          where: { email: identifier.trim().toLowerCase() },
        });
      } else {
        const normalizedPhone = AuthService.normalizePhone(identifier);
        user = await prisma.user.findFirst({
          where: {
            OR: [{ phone: normalizedPhone }, { phone: identifier.trim() }],
          },
        });
      }
    } else {
      if (identifier.email) {
        user = await prisma.user.findUnique({
          where: { email: identifier.email.trim().toLowerCase() },
        });
      } else if (identifier.phone) {
        const normalizedPhone = AuthService.normalizePhone(identifier.phone);
        user = await prisma.user.findFirst({
          where: {
            OR: [{ phone: normalizedPhone }, { phone: identifier.phone.trim() }],
          },
        });
      }
    }

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = AuthService.signToken(user.id, user.role);
    return {
      token,
      user: { id: user.id, email: user.email, phone: user.phone, name: user.name, role: user.role },
    };
  }
  
  private static normalizePhone(phone: string): string {
    // Remove all non-digit characters except +
    const cleaned = phone.replace(/[^\d+]/g, '');
    
    // If it's a standard Egyptian number (e.g., 010..., 011...) and has 11 digits
    if (cleaned.startsWith('0') && cleaned.length === 11) {
      return '+20' + cleaned.substring(1);
    }
    
    // If it starts with 20... (country code without +)
    if (cleaned.startsWith('20') && cleaned.length === 12) {
      return '+' + cleaned;
    }
    
    return cleaned;
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
