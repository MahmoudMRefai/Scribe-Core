/**
 * Courier Wallet Repository — data access for CourierWallet / WalletTransaction.
 *
 * WalletTransaction is append-only (enforced by a DB trigger); there are
 * deliberately no update/delete helpers here.
 */
import { Prisma, WalletTransactionType } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

export interface WalletTransactionInput {
  walletId: string;
  type: WalletTransactionType;
  amount: string;        // signed, 2dp
  balanceAfter: string;  // 2dp
  referenceId: string | null;
}

export class CourierWalletRepository {
  static async createTransaction(data: WalletTransactionInput, tx: Prisma.TransactionClient) {
    return tx.walletTransaction.create({ data });
  }

  static async findByCourierUserId(userId: string, client: Prisma.TransactionClient = prisma) {
    return client.courierWallet.findFirst({ where: { courier: { userId } } });
  }

  static async recentTransactions(walletId: string, limit: number) {
    return prisma.walletTransaction.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  static async sumByType(walletId: string, type: WalletTransactionType) {
    const result = await prisma.walletTransaction.aggregate({
      where: { walletId, type },
      _sum: { amount: true },
    });
    return result._sum.amount;
  }
}
