import { Router } from 'express';
import { WalletController } from './wallet.controller.js';
import { authenticate, authorize } from '../auth/auth.middleware.js';
import { Role } from '../../shared/enums.js';

const router = Router();

router.use(authenticate);

// Get my own wallet(s)
router.get('/me', WalletController.getMyWallet);

// List all wallets (admin only)
router.get('/', authorize(Role.ADMIN), WalletController.list);

// Get wallet by ID
router.get('/:id', WalletController.getById);

// Get transaction history for a wallet
router.get('/:id/transactions', WalletController.getTransactions);

export { router as walletRoutes };
