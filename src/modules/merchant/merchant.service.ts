import { MerchantRepository } from './merchant.repository.js';
import { NotFoundException } from '../../shared/errors.js';

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

  static async update(id: string, data: { businessName?: string; businessAddress?: string; flatDeliveryFee?: number; phone?: string; isActive?: boolean }) {
    const merchant = await MerchantRepository.findById(id);
    if (!merchant) throw new NotFoundException('Merchant', id);
    return MerchantRepository.update(id, data);
  }
}
