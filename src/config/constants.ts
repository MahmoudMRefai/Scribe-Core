/**
 * Application-wide constants for Scribe Smart Hub.
 */

/** Valid parcel status transitions — maps each status to its allowed next statuses */
export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['PICKED_UP'],
  PICKED_UP: ['AT_HUB'],
  AT_HUB: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED'],
  FAILED: ['RETURNED_TO_ORIGIN', 'OUT_FOR_DELIVERY'], // OUT_FOR_DELIVERY = retry
  // Terminal states — no further transitions
  DELIVERED: [],
  RETURNED_TO_ORIGIN: [],
};

/** Tracking ID prefix for Armant hub */
export const TRACKING_PREFIX = 'ARM';

/** Pagination defaults */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
