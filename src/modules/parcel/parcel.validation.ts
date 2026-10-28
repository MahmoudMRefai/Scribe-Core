import { z } from 'zod';

export const createParcelSchema = z.object({
  merchantId: z.string().uuid('Invalid merchant ID'),
  codAmount: z.number().min(0, 'COD amount must be non-negative'),
  serviceTier: z.enum(['LOCAL', 'INTERCITY', 'EXPRESS']).default('LOCAL'),
  weight: z.number().min(0).optional(),
  recipientName: z.string().min(1, 'Recipient name is required'),
  recipientPhone: z.string().min(8, 'Recipient phone is required'),
  recipientAddress: z.string().min(5, 'Recipient address is required'),
  notes: z.string().optional(),
});

export const updateParcelStatusSchema = z.object({
  status: z.enum([
    'PENDING', 'PICKED_UP', 'AT_HUB', 'OUT_FOR_DELIVERY',
    'DELIVERED', 'FAILED', 'RETURNED_TO_ORIGIN',
  ]),
  deliveryNote: z.string().trim().max(500).optional(),
});

export const assignCourierSchema = z.object({
  courierId: z.string().uuid('Invalid courier ID'),
});

export const parcelQuerySchema = z.object({
  status: z.enum([
    'PENDING', 'PICKED_UP', 'AT_HUB', 'OUT_FOR_DELIVERY',
    'DELIVERED', 'FAILED', 'RETURNED_TO_ORIGIN',
  ]).optional(),
  merchantId: z.string().uuid().optional(),
  courierId: z.string().uuid().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});
