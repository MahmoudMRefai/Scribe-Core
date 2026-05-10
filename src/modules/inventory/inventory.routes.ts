import { Router } from 'express';
import { InventoryController } from './inventory.controller.js';
import { authenticate, authorize } from '../auth/auth.middleware.js';
import { Role } from '../../shared/enums.js';

const router = Router();
router.use(authenticate, authorize(Role.MERCHANT));

router.post('/', InventoryController.create);
router.get('/', InventoryController.list);
router.patch('/:id', InventoryController.update);
router.delete('/:id', InventoryController.delete);
router.post('/:id/deliver', InventoryController.triggerDelivery);

export { router as inventoryRoutes };
