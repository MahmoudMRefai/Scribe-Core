import { z } from 'zod';

export const createMerchantSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
  name: z.string().min(2),
  phone: z.string().optional(),
  businessName: z.string().min(2),
  businessAddress: z.string().optional(),
  flatDeliveryFee: z.coerce.number().min(0).optional(),
});

export const updateMerchantSchema = z.object({
  businessName: z.string().min(2).optional(),
  businessAddress: z.string().optional(),
  address: z.string().optional(),
  flatDeliveryFee: z.coerce.number().min(0).optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
  name: z.string().min(2).optional(),
  email: z.email().optional(),
  password: z.string().min(6).optional(),
});
