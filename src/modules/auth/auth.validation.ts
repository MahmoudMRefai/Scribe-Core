import { z } from 'zod';
import { Role, VehicleType } from '../../shared/enums.js';
import { isValidEgyptianMobile } from '../../shared/phone.util.js';

export const registerSchema = z.object({
  email: z.email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z
    .string()
    .refine(isValidEgyptianMobile, 'Invalid Egyptian mobile number (e.g. 01012345678 or +201012345678)'),
  // Public registration is limited to couriers and merchants. Admins are created via the seed script.
  role: z
    .nativeEnum(Role)
    .refine((role) => role !== Role.ADMIN, 'Admin accounts cannot be self-registered'),
  // Merchant-specific fields
  businessName: z.string().optional(),
  businessAddress: z.string().optional(),
  // Courier-specific fields
  vehicleType: z.nativeEnum(VehicleType).optional(),
  address: z.string().optional(),
});

export const loginSchema = z
  .object({
    email: z.string().trim().email('Invalid email address').optional().or(z.literal('')),
    phone: z.string().trim().optional(),
    password: z.string().min(1, 'Password is required'),
  })
  .refine((data) => Boolean(data.email || data.phone), {
    message: 'Either email or phone number is required',
    path: ['phone'],
  });

/** Refine: businessName is required when role is MERCHANT */
export const registerSchemaRefined = registerSchema.refine(
  (data) => data.role !== 'MERCHANT' || (data.businessName && data.businessName.length >= 2),
  {
    message: 'Business name is required for merchant registration',
    path: ['businessName'],
  },
);
