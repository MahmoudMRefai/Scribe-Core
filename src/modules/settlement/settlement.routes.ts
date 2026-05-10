import { Router } from 'express';
import { SettlementController } from './settlement.controller.js';
import { authenticate, authorize } from '../auth/auth.middleware.js';
import { Role } from '../../shared/enums.js';

const router = Router();

router.use(authenticate);

// Initiate a settlement (admin or courier)
router.post('/', authorize(Role.ADMIN, Role.COURIER), SettlementController.initiate);

// List settlements
router.get('/', authorize(Role.ADMIN, Role.COURIER), SettlementController.list);

// Get by ID
router.get('/:id', SettlementController.getById);

// Confirm cash receipt (admin only — the Armant handover)
router.patch('/:id/confirm', authorize(Role.ADMIN), SettlementController.confirm);

// Dispute a settlement (admin only)
router.patch('/:id/dispute', authorize(Role.ADMIN), SettlementController.dispute);

export { router as settlementRoutes };
