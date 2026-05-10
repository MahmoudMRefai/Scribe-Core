import { z } from 'zod';

export const createInventorySchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  name: z.string().min(1, 'Name is required'),
  quantity: z.number().int().min(0).default(0),
  unitValue: z.number().min(0).optional(),
  unitWeight: z.number().min(0).optional(),
  location: z.string().optional(),
});

export const bulkCreateInventorySchema = z.array(createInventorySchema);

export const updateInventorySchema = z.object({
  name: z.string().min(1).optional(),
  quantity: z.number().int().min(0).optional(),
  unitValue: z.number().min(0).optional(),
  unitWeight: z.number().min(0).optional(),
  location: z.string().optional(),
});

export const triggerDeliverySchema = z.object({
  quantity: z.number().int().min(1, 'Must request at least 1 item'),
  recipientName: z.string().min(1),
  recipientPhone: z.string().min(8),
  recipientAddress: z.string().min(5),
  notes: z.string().optional(),
});
