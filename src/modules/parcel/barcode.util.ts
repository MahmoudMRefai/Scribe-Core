/**
 * Barcode Utility — generates unique tracking IDs.
 *
 * Pattern: ARM-YYYYMMDD-XXXX
 *   ARM       = Armant hub prefix
 *   YYYYMMDD  = Date of creation
 *   XXXX      = Zero-padded daily sequence (0001–9999)
 *
 * The sequence is determined by counting parcels created today with
 * the same date prefix, ensuring uniqueness within a single day.
 *
 * Edge case: If daily volume exceeds 9999, the sequence extends
 * beyond 4 digits (e.g., ARM-20260510-10000). This is safe because
 * the trackingId column has no length constraint.
 */
import { Prisma } from '@prisma/client';
import { TRACKING_PREFIX } from '../../config/constants.js';

export class BarcodeUtil {
  /**
   * Generate the next tracking ID for today.
   *
   * @param tx - Prisma transaction client (to ensure atomicity with parcel creation)
   */
  static async generate(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const today = BarcodeUtil.formatDate(new Date());
    const prefix = `${TRACKING_PREFIX}-${today}-`;

    // Count how many parcels were created today with this prefix
    const count = await tx.parcel.count({
      where: {
        trackingId: { startsWith: prefix },
      },
    });

    const sequence = String(count + 1).padStart(4, '0');
    return `${prefix}${sequence}`;
  }

  /**
   * Format a Date as YYYYMMDD string.
   */
  static formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  /**
   * Validate that a string matches the ARM-YYYYMMDD-XXXX pattern.
   */
  static isValid(trackingId: string): boolean {
    return /^ARM-\d{8}-\d{4,}$/.test(trackingId);
  }
}
