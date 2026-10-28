/**
 * Commission Strategies — how much a courier earns for delivering a parcel.
 *
 * Strategies are pure: no DB, no env. They receive everything they need in a
 * CommissionContext, which keeps them trivially unit-testable and lets new
 * strategies (weight-based, COD-percentage, …) be plugged in via the registry
 * in commission.service.ts without touching ParcelService.
 */
import Decimal from 'decimal.js';
import { ServiceTier } from '@prisma/client';

export interface CommissionContext {
  serviceTier: ServiceTier;
  codAmount: Decimal.Value;
  weight?: Decimal.Value | null;
}

export interface CommissionStrategy {
  readonly name: string;
  /** Returns the commission in EGP, rounded to 2 decimal places. Never negative. */
  calculate(ctx: CommissionContext): Decimal;
}

export type TierRates = Record<ServiceTier, Decimal.Value>;

/**
 * Base rule: a fixed payout per service tier.
 *   LOCAL      — intra-city, Armant hub zone
 *   INTERCITY  — Luxor / outskirts
 *   EXPRESS    — same-day rush
 */
export class TieredFlatFeeStrategy implements CommissionStrategy {
  readonly name = 'TIERED_FLAT';
  private readonly rates: Record<ServiceTier, Decimal>;

  constructor(rates: TierRates) {
    const resolved = {} as Record<ServiceTier, Decimal>;
    for (const tier of Object.values(ServiceTier)) {
      const raw = rates[tier];
      if (raw === undefined || raw === null) {
        throw new Error(`TieredFlatFeeStrategy: missing rate for tier '${tier}'`);
      }
      const rate = new Decimal(raw);
      if (!rate.isFinite() || rate.isNegative()) {
        throw new Error(`TieredFlatFeeStrategy: rate for '${tier}' must be a non-negative number, got '${raw}'`);
      }
      resolved[tier] = rate.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }
    this.rates = resolved;
  }

  calculate(ctx: CommissionContext): Decimal {
    const rate = this.rates[ctx.serviceTier];
    if (!rate) {
      throw new Error(`TieredFlatFeeStrategy: unknown service tier '${ctx.serviceTier}'`);
    }
    return rate;
  }
}
