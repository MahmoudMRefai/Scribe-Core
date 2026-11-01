import { MerchantRepository } from './merchant.repository.js';
import { ConflictException, NotFoundException } from '../../shared/errors.js';
import { prisma } from '../../config/prisma.js';
import { normalizePhone } from '../../shared/phone.util.js';
import bcrypt from 'bcryptjs';

export class MerchantService {
  static async getById(id: string) {
    const merchant = await MerchantRepository.findById(id);
    if (!merchant) throw new NotFoundException('Merchant', id);
    return merchant;
  }

  static async getByUserId(userId: string) {
    const merchant = await MerchantRepository.findByUserId(userId);
    if (!merchant) throw new NotFoundException('Merchant', userId);
    return merchant;
  }

  static async list(page = 1, pageSize = 20) {
    return MerchantRepository.findMany(page, pageSize);
  }

  static async update(
    id: string,
    data: {
      businessName?: string;
      businessAddress?: string;
      address?: string;
      flatDeliveryFee?: number;
      phone?: string;
      isActive?: boolean;
      name?: string;
      email?: string;
      password?: string;
    },
  ) {
    const merchant = await MerchantRepository.findById(id);
    if (!merchant) throw new NotFoundException('Merchant', id);

    const { businessName, businessAddress, address, flatDeliveryFee, phone, isActive, name, email, password } = data;
    const formattedData: any = {};

    const normalizedPhone = phone !== undefined ? (phone.trim() ? normalizePhone(phone) : null) : undefined;

    if (email && email.toLowerCase() !== merchant.user.email.toLowerCase()) {
      const existingEmail = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (existingEmail && existingEmail.id !== merchant.userId) {
        throw new ConflictException(`Email '${email}' is already registered`);
      }
    }

    if (normalizedPhone) {
      const existingPhone = await prisma.user.findFirst({
        where: { phone: normalizedPhone, NOT: { id: merchant.userId } },
      });
      if (existingPhone) {
        throw new ConflictException(`Phone number '${phone}' is already registered`);
      }
    }

    if (businessName !== undefined) formattedData.businessName = businessName;
    if (address !== undefined || businessAddress !== undefined) {
      formattedData.address = address ?? businessAddress;
    }
    if (flatDeliveryFee !== undefined) formattedData.flatDeliveryFee = flatDeliveryFee;
    if (normalizedPhone !== undefined) formattedData.phone = normalizedPhone;
    if (isActive !== undefined) formattedData.isActive = isActive;

    const userUpdate: any = {};
    if (name !== undefined) userUpdate.name = name;
    if (email !== undefined) userUpdate.email = email.toLowerCase();
    if (normalizedPhone !== undefined) userUpdate.phone = normalizedPhone;
    if (isActive !== undefined) userUpdate.isActive = isActive;
    if (password) {
      userUpdate.passwordHash = await bcrypt.hash(password, 12);
    }

    if (Object.keys(userUpdate).length > 0) {
      formattedData.user = {
        update: userUpdate,
      };
    }

    const updated = await MerchantRepository.update(id, formattedData);

    const displayOwner = (name ?? updated.user?.name ?? businessName ?? updated.businessName)?.trim();
    if (displayOwner) {
      await prisma.ledgerAccount.updateMany({
        where: { ownerId: merchant.userId, ownerType: 'MERCHANT', type: 'ASSET' },
        data: { name: `MERCHANT Wallet — ${displayOwner}` },
      });
    }

    return updated;
  }
}
