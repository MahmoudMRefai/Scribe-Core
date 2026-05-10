import { z } from 'zod';

export const walletQuerySchema = z.object({
  ownerId: z.string().uuid().optional(),
  ownerType: z.enum(['COURIER', 'MERCHANT', 'SYSTEM']).optional(),
});
