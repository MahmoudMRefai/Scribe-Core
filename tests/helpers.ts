/**
 * Test Helpers — shared utilities for tests.
 *
 * Provides factory functions and auth helpers to reduce boilerplate.
 */
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-jest';

/** Generate a JWT for testing without hitting the auth endpoint */
export function generateTestToken(userId: string, role: 'ADMIN' | 'COURIER' | 'MERCHANT'): string {
  return jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn: '1h' });
}

/** Build an Authorization header value */
export function authHeader(userId: string, role: 'ADMIN' | 'COURIER' | 'MERCHANT'): string {
  return `Bearer ${generateTestToken(userId, role)}`;
}

/** Factory: create a mock parcel creation payload */
export function mockParcelInput(overrides: Record<string, unknown> = {}) {
  return {
    merchantId: '00000000-0000-0000-0000-000000000001',
    codAmount: 150.00,
    recipientName: 'Ahmed Hassan',
    recipientPhone: '+20-100-123-4567',
    recipientAddress: '15 Sharia al-Nile, Armant, Luxor',
    ...overrides,
  };
}
