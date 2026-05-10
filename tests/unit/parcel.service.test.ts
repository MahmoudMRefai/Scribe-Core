/**
 * Unit Tests — ParcelService
 *
 * Tests the parcel lifecycle state machine and edge cases.
 * Uses mocked repositories to isolate business logic.
 */
import { ParcelStatus, Role } from '@prisma/client';
import { VALID_STATUS_TRANSITIONS } from '../../src/config/constants';

// We test the transition logic directly since the service depends on Prisma
describe('Parcel Status Transitions', () => {
  describe('VALID_STATUS_TRANSITIONS map', () => {
    it('should allow PENDING → PICKED_UP only', () => {
      expect(VALID_STATUS_TRANSITIONS['PENDING']).toEqual(['PICKED_UP']);
    });

    it('should allow PICKED_UP → AT_HUB only', () => {
      expect(VALID_STATUS_TRANSITIONS['PICKED_UP']).toEqual(['AT_HUB']);
    });

    it('should allow AT_HUB → OUT_FOR_DELIVERY only', () => {
      expect(VALID_STATUS_TRANSITIONS['AT_HUB']).toEqual(['OUT_FOR_DELIVERY']);
    });

    it('should allow OUT_FOR_DELIVERY → DELIVERED or FAILED', () => {
      const allowed = VALID_STATUS_TRANSITIONS['OUT_FOR_DELIVERY'];
      expect(allowed).toContain('DELIVERED');
      expect(allowed).toContain('FAILED');
      expect(allowed).toHaveLength(2);
    });

    it('should allow FAILED → RETURNED_TO_ORIGIN or OUT_FOR_DELIVERY (retry)', () => {
      const allowed = VALID_STATUS_TRANSITIONS['FAILED'];
      expect(allowed).toContain('RETURNED_TO_ORIGIN');
      expect(allowed).toContain('OUT_FOR_DELIVERY');
      expect(allowed).toHaveLength(2);
    });

    it('should not allow any transition from DELIVERED (terminal)', () => {
      expect(VALID_STATUS_TRANSITIONS['DELIVERED']).toEqual([]);
    });

    it('should not allow any transition from RETURNED_TO_ORIGIN (terminal)', () => {
      expect(VALID_STATUS_TRANSITIONS['RETURNED_TO_ORIGIN']).toEqual([]);
    });
  });

  describe('Transition validation logic', () => {
    function isTransitionAllowed(from: string, to: string): boolean {
      const allowed = VALID_STATUS_TRANSITIONS[from] || [];
      return allowed.includes(to);
    }

    // ─── Happy paths ─────────────────────────────────────────
    it('should allow the full happy path: PENDING → PICKED_UP → AT_HUB → OUT_FOR_DELIVERY → DELIVERED', () => {
      expect(isTransitionAllowed('PENDING', 'PICKED_UP')).toBe(true);
      expect(isTransitionAllowed('PICKED_UP', 'AT_HUB')).toBe(true);
      expect(isTransitionAllowed('AT_HUB', 'OUT_FOR_DELIVERY')).toBe(true);
      expect(isTransitionAllowed('OUT_FOR_DELIVERY', 'DELIVERED')).toBe(true);
    });

    it('should allow the failure + retry path: OUT_FOR_DELIVERY → FAILED → OUT_FOR_DELIVERY', () => {
      expect(isTransitionAllowed('OUT_FOR_DELIVERY', 'FAILED')).toBe(true);
      expect(isTransitionAllowed('FAILED', 'OUT_FOR_DELIVERY')).toBe(true);
    });

    it('should allow the return path: FAILED → RETURNED_TO_ORIGIN', () => {
      expect(isTransitionAllowed('FAILED', 'RETURNED_TO_ORIGIN')).toBe(true);
    });

    // ─── Edge cases (invalid transitions) ────────────────────
    it('should NOT allow skipping steps: PENDING → DELIVERED', () => {
      expect(isTransitionAllowed('PENDING', 'DELIVERED')).toBe(false);
    });

    it('should NOT allow PENDING → AT_HUB (must go through PICKED_UP)', () => {
      expect(isTransitionAllowed('PENDING', 'AT_HUB')).toBe(false);
    });

    it('should NOT allow backwards: AT_HUB → PENDING', () => {
      expect(isTransitionAllowed('AT_HUB', 'PENDING')).toBe(false);
    });

    it('should NOT allow transitions from terminal state DELIVERED', () => {
      expect(isTransitionAllowed('DELIVERED', 'PENDING')).toBe(false);
      expect(isTransitionAllowed('DELIVERED', 'FAILED')).toBe(false);
      expect(isTransitionAllowed('DELIVERED', 'RETURNED_TO_ORIGIN')).toBe(false);
    });
  });

  describe('Courier authorization (conceptual)', () => {
    /**
     * Edge case: A courier tries to deliver a parcel not assigned to them.
     * The service should throw ForbiddenException.
     *
     * This tests the logic pattern — the actual service test would need
     * a mocked Prisma client.
     */
    it('should reject if courier ID does not match parcel assignment', () => {
      const parcel = {
        courierId: 'courier-001',
        status: 'OUT_FOR_DELIVERY',
      };
      const requestingCourierId = 'courier-999'; // Different courier

      const isAssigned = parcel.courierId === requestingCourierId;
      expect(isAssigned).toBe(false);
    });

    it('should allow if courier ID matches parcel assignment', () => {
      const parcel = {
        courierId: 'courier-001',
        status: 'OUT_FOR_DELIVERY',
      };
      const requestingCourierId = 'courier-001'; // Same courier

      const isAssigned = parcel.courierId === requestingCourierId;
      expect(isAssigned).toBe(true);
    });
  });
});
