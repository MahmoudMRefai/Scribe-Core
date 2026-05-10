/**
 * Unit Tests — BarcodeUtil
 *
 * Tests the ARM-YYYYMMDD-XXXX tracking ID generator.
 */
import { BarcodeUtil } from '../../src/modules/parcel/barcode.util';

describe('BarcodeUtil', () => {
  describe('formatDate', () => {
    it('should format a date as YYYYMMDD', () => {
      const date = new Date('2026-05-10T12:00:00Z');
      expect(BarcodeUtil.formatDate(date)).toBe('20260510');
    });

    it('should zero-pad single-digit months and days', () => {
      const date = new Date('2026-01-05T00:00:00Z');
      expect(BarcodeUtil.formatDate(date)).toBe('20260105');
    });
  });

  describe('isValid', () => {
    it('should return true for valid tracking IDs', () => {
      expect(BarcodeUtil.isValid('ARM-20260510-0001')).toBe(true);
      expect(BarcodeUtil.isValid('ARM-20260510-0123')).toBe(true);
      expect(BarcodeUtil.isValid('ARM-20260510-10000')).toBe(true); // 5 digits OK
    });

    it('should return false for invalid tracking IDs', () => {
      expect(BarcodeUtil.isValid('XYZ-20260510-0001')).toBe(false);  // wrong prefix
      expect(BarcodeUtil.isValid('ARM-2026051-0001')).toBe(false);   // short date
      expect(BarcodeUtil.isValid('ARM-20260510-01')).toBe(false);    // short sequence
      expect(BarcodeUtil.isValid('ARM-20260510-')).toBe(false);      // no sequence
      expect(BarcodeUtil.isValid('')).toBe(false);                    // empty
    });
  });

  describe('generate', () => {
    it('should generate a tracking ID with the correct format', async () => {
      // Mock the Prisma transaction client
      const mockTx = {
        parcel: {
          count: jest.fn().mockResolvedValue(0),
        },
      } as any;

      const trackingId = await BarcodeUtil.generate(mockTx);

      // Should match ARM-YYYYMMDD-0001 (first of the day)
      expect(BarcodeUtil.isValid(trackingId)).toBe(true);
      expect(trackingId).toMatch(/^ARM-\d{8}-0001$/);
    });

    it('should increment the sequence number based on existing parcels', async () => {
      const mockTx = {
        parcel: {
          count: jest.fn().mockResolvedValue(42), // 42 parcels already today
        },
      } as any;

      const trackingId = await BarcodeUtil.generate(mockTx);

      expect(trackingId).toMatch(/^ARM-\d{8}-0043$/); // 42 + 1 = 43
    });

    it('should use today\'s date in the tracking ID', async () => {
      const mockTx = {
        parcel: {
          count: jest.fn().mockResolvedValue(0),
        },
      } as any;

      const trackingId = await BarcodeUtil.generate(mockTx);
      const todayStr = BarcodeUtil.formatDate(new Date());

      expect(trackingId).toContain(`ARM-${todayStr}-`);
    });
  });
});
