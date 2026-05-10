import { Router } from 'express';
import { AuditController } from './audit.controller.js';
import { authenticate, authorize } from '../auth/auth.middleware.js';
import { Role } from '../../shared/enums.js';

const router = Router();
router.use(authenticate, authorize(Role.ADMIN));

// Query audit logs (admin only)
router.get('/', AuditController.query);

export { router as auditRoutes };
