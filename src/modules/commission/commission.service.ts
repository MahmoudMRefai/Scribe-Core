/**
 * Commission Service — resolves the configured CommissionStrategy.
 *
 * To add a strategy: implement CommissionStrategy, register a factory below,
 * and add its key to COMMISSION_STRATEGY in config/env.ts.
 */
import Decimal from 'decimal.js';
import { env } from '../../config/env.js';
import {
  CommissionContext,
  CommissionStrategy,
  TieredFlatFeeStrategy,
} from './commission.strategy.js';

type StrategyKey = typeof env.COMMISSION_STRATEGY;

const STRATEGY_FACTORIES: Record<StrategyKey, () => CommissionStrategy> = {
  TIERED_FLAT: () =>
    new TieredFlatFeeStrategy({
      LOCAL: env.COMMISSION_RATE_LOCAL,
      INTERCITY: env.COMMISSION_RATE_INTERCITY,
      EXPRESS: env.COMMISSION_RATE_EXPRESS,
    }),
};

export class CommissionService {
  private static strategy: CommissionStrategy | null = null;

  static getStrategy(): CommissionStrategy {
    if (!this.strategy) {
      this.strategy = STRATEGY_FACTORIES[env.COMMISSION_STRATEGY]();
    }
    return this.strategy;
  }

  /** Override the active strategy (tests, or a future admin-configurable rate card). */
  static setStrategy(strategy: CommissionStrategy | null): void {
    this.strategy = strategy;
  }

  static calculate(ctx: CommissionContext): Decimal {
    return this.getStrategy().calculate(ctx);
  }
}
