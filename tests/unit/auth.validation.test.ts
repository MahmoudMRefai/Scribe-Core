import { loginSchema, registerSchemaRefined } from '../../src/modules/auth/auth.validation.js';
import { normalizePhone, isValidEgyptianMobile } from '../../src/shared/phone.util.js';

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

describe('Auth Validation - registerSchema', () => {
  const base = {
    email: 'courier9@scribe.local',
    password: 'Courier@2026',
    name: 'Test Courier',
    phone: '01012345678',
    role: 'COURIER',
  };

  it('should accept a courier registration', () => {
    expect(registerSchemaRefined.safeParse(base).success).toBe(true);
  });

  it('should reject ADMIN self-registration', () => {
    const result = registerSchemaRefined.safeParse({ ...base, role: 'ADMIN' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('role'))).toBe(true);
    }
  });

  it.each(['01012345678', '+201012345678', '201012345678', '+20-100-111-2222', '010 1234 5678'])(
    'should accept phone format %s',
    (phone) => {
      expect(registerSchemaRefined.safeParse({ ...base, phone }).success).toBe(true);
    },
  );

  it.each(['12345', '0101234567', '+14155552671', '01312345678'])('should reject phone %s', (phone) => {
    expect(registerSchemaRefined.safeParse({ ...base, phone }).success).toBe(false);
  });
});

describe('phone.util', () => {
  it('normalizes all common formats to E.164', () => {
    expect(normalizePhone('01001112222')).toBe('+201001112222');
    expect(normalizePhone('+20-100-111-2222')).toBe('+201001112222');
    expect(normalizePhone('201001112222')).toBe('+201001112222');
  });

  it('validates Egyptian mobile prefixes 010/011/012/015 only', () => {
    expect(isValidEgyptianMobile('01512345678')).toBe(true);
    expect(isValidEgyptianMobile('01412345678')).toBe(false);
  });
});
