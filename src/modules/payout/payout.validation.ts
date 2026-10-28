import { z } from 'zod';

export const requestPayoutSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  notes: z.string().max(500).optional(),
});

export const sendDirectPayoutSchema = z.object({
  recipientId: z.string().uuid('Valid recipient user ID is required'),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  notes: z.string().max(500).optional(),
});

export const disbursePayoutSchema = z.object({
  notes: z.string().max(500).optional(),
});

export const rejectPayoutSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const payoutQuerySchema = z.object({
  recipientId: z.string().uuid().optional(),
  recipientType: z.enum(['COURIER', 'MERCHANT']).optional(),
  status: z.enum(['PENDING', 'DISBURSED', 'CONFIRMED', 'REJECTED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

