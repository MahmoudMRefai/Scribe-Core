import { Router } from 'express';
import { ParcelController } from './parcel.controller.js';
import { authenticate, authorize } from '../auth/auth.middleware.js';
import { Role } from '../../shared/enums.js';

const router = Router();

// All parcel routes require authentication
router.use(authenticate);

// Create a parcel (Admin or Merchant)
router.post('/', authorize(Role.ADMIN, Role.MERCHANT), ParcelController.create);

// List parcels with filters (all roles, service scopes results by role)
router.get('/', ParcelController.list);

// Get by tracking ID
router.get('/track/:trackingId', ParcelController.getByTrackingId);

// Get by ID
router.get('/:id', ParcelController.getById);

// Update parcel status (Admin or assigned Courier)
router.patch('/:id/status', authorize(Role.ADMIN, Role.COURIER), ParcelController.updateStatus);

// Assign a courier to a parcel (Admin only)
router.patch('/:id/assign', authorize(Role.ADMIN), ParcelController.assignCourier);

export { router as parcelRoutes };
