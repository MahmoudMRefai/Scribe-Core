import { WalletRepository } from './wallet.repository.js';
import { NotFoundException } from '../../shared/errors.js';

export class WalletService {
  static async getByOwnerId(ownerId: string) {
    const accounts = await WalletRepository.findByOwnerId(ownerId);
    if (!accounts.length) {
      throw new NotFoundException('Wallet', ownerId);
    }
    return accounts;
  }

  static async getById(id: string) {
    const account = await WalletRepository.findById(id);
    if (!account) {
      throw new NotFoundException('Wallet', id);
    }
    return account;
  }

  static async list(filters: { ownerId?: string; ownerType?: string }) {
    return WalletRepository.findMany(filters);
  }

  static async getTransactions(accountId: string, page = 1, pageSize = 20) {
    // Verify account exists
    const account = await WalletRepository.findById(accountId);
    if (!account) {
      throw new NotFoundException('Wallet', accountId);
    }
    return WalletRepository.getTransactions(accountId, page, pageSize);
  }
}
