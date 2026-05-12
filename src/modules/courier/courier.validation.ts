import { z } from 'zod';
import { VehicleType } from '../../shared/enums.js';

export const createCourierSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  name: z.string().min(2),
  phone: z.string().optional(),
  vehicleType: z.nativeEnum(VehicleType).optional(),
  address: z.string().optional(),
});

export const updateCourierSchema = z.object({
  email: z.email().optional(),
  password: z.string().min(8).optional(),
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  vehicleType: z.nativeEnum(VehicleType).optional(),
  address: z.string().optional(),
  isActive: z.boolean().optional(),
});
