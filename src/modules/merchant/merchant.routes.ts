import { Router } from 'express';
import { MerchantController } from './merchant.controller.js';
import { authenticate, authorize } from '../auth/auth.middleware.js';
import { Role } from '../../shared/enums.js';

const router = Router();
router.use(authenticate);

router.get('/me', authorize(Role.MERCHANT), MerchantController.getMyProfile);
router.get('/', authorize(Role.ADMIN), MerchantController.list);
router.get('/:id', authorize(Role.ADMIN, Role.MERCHANT), MerchantController.getById);
router.patch('/:id', authorize(Role.ADMIN), MerchantController.update);

export { router as merchantRoutes };
