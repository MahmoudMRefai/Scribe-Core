/**
 * Express Application Configuration.
 *
 * This file sets up all middleware and routes. It is exported separately
 * from server.ts so that Supertest can import it for integration testing
 * without starting the HTTP server.
 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { globalErrorHandler } from './shared/error-handler.js';

// Route imports
import { authRoutes } from './modules/auth/auth.routes.js';
import { parcelRoutes } from './modules/parcel/parcel.routes.js';
import { walletRoutes } from './modules/wallet/wallet.routes.js';
import { settlementRoutes } from './modules/settlement/settlement.routes.js';
import { merchantRoutes } from './modules/merchant/merchant.routes.js';
import { inventoryRoutes } from './modules/inventory/inventory.routes.js';
import { auditRoutes } from './modules/audit/audit.routes.js';
import { courierRoutes } from './modules/courier/courier.routes.js';

const app = express();

// ─── Global Middleware ──────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── Health Check ───────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ─────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/parcels', parcelRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/merchants', merchantRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/couriers', courierRoutes);

// ─── 404 Handler ────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// ─── Global Error Handler (must be last) ────────────────────
app.use(globalErrorHandler);

export { app };
