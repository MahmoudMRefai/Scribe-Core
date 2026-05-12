import { z } from 'zod';

export const createMerchantSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  name: z.string().min(2),
  phone: z.string().optional(),
  businessName: z.string().min(2),
  businessAddress: z.string().optional(),
  flatDeliveryFee: z.number().min(0).optional(),
});

export const updateMerchantSchema = z.object({
  businessName: z.string().min(2).optional(),
  businessAddress: z.string().optional(),
  flatDeliveryFee: z.number().min(0).optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
});
