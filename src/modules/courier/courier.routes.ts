import { Router } from 'express';
import { CourierController } from './courier.controller.js';
import { CourierWalletController } from '../courier-wallet/courier-wallet.controller.js';
import { authenticate, authorize } from '../auth/auth.middleware.js';
import { Role } from '../../shared/enums.js';

const router = Router();
router.use(authenticate);

router.get('/me', authorize(Role.COURIER), CourierController.getMyProfile);
router.get('/me/wallet', authorize(Role.COURIER), CourierWalletController.getMyWallet);
router.get('/wallet', authorize(Role.COURIER), CourierWalletController.getMyWallet);
router.get('/', authorize(Role.ADMIN), CourierController.list);
router.get('/:id', authorize(Role.ADMIN, Role.COURIER), CourierController.getById);
router.patch('/:id', authorize(Role.ADMIN), CourierController.update);

export { router as courierRoutes };
