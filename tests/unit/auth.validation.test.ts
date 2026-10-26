import { loginSchema } from '../../src/modules/auth/auth.validation.js';

describe('Auth Validation - loginSchema', () => {
  it('should accept login with valid email and password', () => {
    const result = loginSchema.safeParse({
      email: 'admin@scribe.local',
      password: 'Admin@Scribe2026',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('admin@scribe.local');
    }
  });

  it('should accept login with phone and password', () => {
    const result = loginSchema.safeParse({
      phone: '01012345678',
      password: 'password123',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe('01012345678');
    }
  });

  it('should reject login if neither email nor phone is provided', () => {
    const result = loginSchema.safeParse({
      password: 'password123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('phone'))).toBe(true);
    }
  });

  it('should reject login with invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });
});
