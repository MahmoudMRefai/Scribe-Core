import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(10),
  JWT_EXPIRES_IN: z.string().default('30d'),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ADMIN_EMAIL: z.email().default('admin@scribe.local'),
  ADMIN_PASSWORD: z.string().min(6).default('Admin@Scribe2026'),
  FLAT_DELIVERY_FEE: z.coerce.number().default(25.00),

  // ─── Courier commission (EGP) ─────────────────────────────
  // Applied at courier assignment and snapshotted on the parcel.
  COMMISSION_STRATEGY: z.enum(['TIERED_FLAT']).default('TIERED_FLAT'),
  COMMISSION_RATE_LOCAL: z.coerce.number().min(0).default(15),
  COMMISSION_RATE_INTERCITY: z.coerce.number().min(0).default(22),
  COMMISSION_RATE_EXPRESS: z.coerce.number().min(0).default(30),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
