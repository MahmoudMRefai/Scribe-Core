import { z } from 'zod';

export const initiateSettlementSchema = z.object({
  courierId: z.string().uuid('Invalid courier ID'),
  amount: z.number().positive('Amount must be positive'),
  notes: z.string().optional(),
});

export const confirmSettlementSchema = z.object({
  notes: z.string().optional(),
});

export const disputeSettlementSchema = z.object({
  reason: z.string().min(5, 'Dispute reason must be at least 5 characters'),
});

export const settlementQuerySchema = z.object({
  courierId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'DISPUTED']).optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});
