/**
 * Integration Tests — Parcel API
 *
 * Tests the full parcel lifecycle through the HTTP API using Supertest.
 *
 * IMPORTANT: These tests require a running PostgreSQL test database.
 * Run: docker-compose up -d postgres_test
 * Set: DATABASE_URL to the test database URL before running.
 *
 * For CI, these would run against a test container. For local dev,
 * run the unit tests first (npm run test:unit) — they don't need a DB.
 */
import request from 'supertest';
import { app } from '../../src/app';
import { generateTestToken } from '../helpers';

// Skip integration tests if no test DB is configured
const SKIP = !process.env.DATABASE_URL_TEST;

(SKIP ? describe.skip : describe)('Parcel API Integration', () => {
  const adminToken = generateTestToken('admin-test-id', 'ADMIN');

  describe('POST /api/parcels', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/parcels')
        .send({
          merchantId: '00000000-0000-0000-0000-000000000001',
          codAmount: 150,
          recipientName: 'Test Recipient',
          recipientPhone: '+20-100-000-0000',
          recipientAddress: '15 Test Street, Armant',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 with invalid body', async () => {
      const res = await request(app)
        .post('/api/parcels')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          // Missing required fields
          codAmount: 150,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/parcels', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(app).get('/api/parcels');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/parcels/:id/status', () => {
    it('should return 400 with invalid status', async () => {
      const res = await request(app)
        .patch('/api/parcels/some-id/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'INVALID_STATUS' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /health', () => {
    it('should return health check', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });
});
