/**
 * Integration Tests — Settlement API
 *
 * Tests the Armant Settlement Protocol through the HTTP API.
 *
 * IMPORTANT: These tests require a running PostgreSQL test database.
 */
import request from 'supertest';
import { app } from '../../src/app';
import { generateTestToken } from '../helpers';

const SKIP = !process.env.DATABASE_URL_TEST;

(SKIP ? describe.skip : describe)('Settlement API Integration', () => {
  const adminToken = generateTestToken('admin-test-id', 'ADMIN');
  const courierToken = generateTestToken('courier-test-id', 'COURIER');

  describe('POST /api/settlements', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/settlements')
        .send({
          courierId: '00000000-0000-0000-0000-000000000002',
          amount: 300,
        });

      expect(res.status).toBe(401);
    });

    it('should return 403 for MERCHANT role', async () => {
      const merchantToken = generateTestToken('merchant-test-id', 'MERCHANT');
      const res = await request(app)
        .post('/api/settlements')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({
          courierId: '00000000-0000-0000-0000-000000000002',
          amount: 300,
        });

      expect(res.status).toBe(403);
    });

    it('should return 400 with invalid amount', async () => {
      const res = await request(app)
        .post('/api/settlements')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          courierId: '00000000-0000-0000-0000-000000000002',
          amount: -100, // Negative amount
        });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/settlements/:id/confirm', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .patch('/api/settlements/some-id/confirm')
        .send({});

      expect(res.status).toBe(401);
    });

    it('should return 403 for COURIER role (admin only)', async () => {
      const res = await request(app)
        .patch('/api/settlements/some-id/confirm')
        .set('Authorization', `Bearer ${courierToken}`)
        .send({});

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/settlements/:id/dispute', () => {
    it('should return 400 without reason', async () => {
      const res = await request(app)
        .patch('/api/settlements/some-id/dispute')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({}); // Missing required 'reason'

      expect(res.status).toBe(400);
    });
  });
});
