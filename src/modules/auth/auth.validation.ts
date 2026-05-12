import { z } from 'zod';
import { Role, VehicleType } from '../../shared/enums.js';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().optional(),
  role: z.nativeEnum(Role),
  // Merchant-specific fields
  businessName: z.string().optional(),
  businessAddress: z.string().optional(),
  // Courier-specific fields
  vehicleType: z.nativeEnum(VehicleType).optional(),
  address: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

/** Refine: businessName is required when role is MERCHANT */
export const registerSchemaRefined = registerSchema.refine(
  (data) => data.role !== 'MERCHANT' || (data.businessName && data.businessName.length >= 2),
  {
    message: 'Business name is required for merchant registration',
    path: ['businessName'],
  },
);
