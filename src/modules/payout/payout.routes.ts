import { Router } from 'express';
import { PayoutController } from './payout.controller.js';
import { authenticate, authorize } from '../auth/auth.middleware.js';
import { Role } from '@prisma/client';

const router = Router();

router.use(authenticate);

// Request a payout / withdrawal (Courier or Merchant)
router.post('/', authorize(Role.COURIER, Role.MERCHANT), PayoutController.request);

// Admin sends/disburses a payout directly to a Courier or Merchant without prior request
router.post('/send', authorize(Role.ADMIN), PayoutController.sendDirect);

// Admin helper: list available payout balances for all active Couriers and Merchants
router.get('/balances', authorize(Role.ADMIN), PayoutController.getRecipientBalances);

// List payouts (Admin sees all or filters; Courier/Merchant sees their own)
router.get('/', PayoutController.list);

// Admin disburses funds
router.patch('/:id/disburse', authorize(Role.ADMIN), PayoutController.disburse);

// Courier or Merchant confirms receipt of funds
router.patch('/:id/confirm', authorize(Role.COURIER, Role.MERCHANT), PayoutController.confirm);

// Reject / cancel payout
router.patch('/:id/reject', PayoutController.reject);

export { router as payoutRoutes };

