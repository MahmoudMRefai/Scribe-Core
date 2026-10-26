/**
 * Phone utilities — single source of truth for Egyptian mobile numbers.
 *
 * All phones are stored in E.164 form: +201XXXXXXXXX
 * Accepted inputs: 01012345678, 201012345678, +201012345678, +20-101-234-5678, "010 1234 5678"
 */

const EGYPTIAN_MOBILE_E164 = /^\+201[0125]\d{8}$/;

/** Normalize an Egyptian phone number to E.164 (+20...). Unknown formats are returned cleaned. */
export function normalizePhone(phone: string): string {
  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, '');

  // Local format: 010..., 011..., 012..., 015... (11 digits)
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    return '+20' + cleaned.substring(1);
  }

  // Country code without +
  if (cleaned.startsWith('20') && cleaned.length === 12) {
    return '+' + cleaned;
  }

  return cleaned;
}

/** True if the input normalizes to a valid Egyptian mobile number. */
export function isValidEgyptianMobile(phone: string): boolean {
  return EGYPTIAN_MOBILE_E164.test(normalizePhone(phone));
}
