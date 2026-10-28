import Decimal from 'decimal.js';
import { ServiceTier } from '@prisma/client';
import {
  CommissionStrategy,
  CommissionContext,
  TieredFlatFeeStrategy,
} from '../../src/modules/commission/commission.strategy';
import { CommissionService } from '../../src/modules/commission/commission.service';

describe('TieredFlatFeeStrategy', () => {
  const defaultRates = {
    [ServiceTier.LOCAL]: 15,
    [ServiceTier.INTERCITY]: 22,
    [ServiceTier.EXPRESS]: 30,
  };

  it('should calculate correct fixed payout for LOCAL tier', () => {
    const strategy = new TieredFlatFeeStrategy(defaultRates);
    const result = strategy.calculate({
      serviceTier: ServiceTier.LOCAL,
      codAmount: 150,
      weight: 1.5,
    });
    expect(result.toString()).toBe('15');
    expect(result.toNumber()).toBe(15);
  });

  it('should calculate correct fixed payout for INTERCITY tier', () => {
    const strategy = new TieredFlatFeeStrategy(defaultRates);
    const result = strategy.calculate({
      serviceTier: ServiceTier.INTERCITY,
      codAmount: 250,
      weight: 3.0,
    });
    expect(result.toString()).toBe('22');
    expect(result.toNumber()).toBe(22);
  });

  it('should calculate correct fixed payout for EXPRESS tier', () => {
    const strategy = new TieredFlatFeeStrategy(defaultRates);
    const result = strategy.calculate({
      serviceTier: ServiceTier.EXPRESS,
      codAmount: 500,
      weight: 0.5,
    });
    expect(result.toString()).toBe('30');
    expect(result.toNumber()).toBe(30);
  });

  it('should format decimals to 2 decimal places properly', () => {
    const strategy = new TieredFlatFeeStrategy({
      [ServiceTier.LOCAL]: 15.555,
      [ServiceTier.INTERCITY]: 22.0,
      [ServiceTier.EXPRESS]: 30.123,
    });
    expect(strategy.calculate({ serviceTier: ServiceTier.LOCAL, codAmount: 0 }).toFixed(2)).toBe('15.56');
    expect(strategy.calculate({ serviceTier: ServiceTier.EXPRESS, codAmount: 0 }).toFixed(2)).toBe('30.12');
  });

  it('should throw if any tier rate is missing or invalid', () => {
    expect(() => {
      new TieredFlatFeeStrategy({
        [ServiceTier.LOCAL]: 15,
        [ServiceTier.INTERCITY]: 22,
      } as any);
    }).toThrow(/missing rate for tier 'EXPRESS'/);

    expect(() => {
      new TieredFlatFeeStrategy({
        [ServiceTier.LOCAL]: -10,
        [ServiceTier.INTERCITY]: 22,
        [ServiceTier.EXPRESS]: 30,
      });
    }).toThrow(/must be a non-negative number/);
  });
});

describe('Pluggable Commission Strategy Pattern', () => {
  afterEach(() => {
    CommissionService.setStrategy(null);
  });

  it('CommissionService should use default strategy from env', () => {
    const strategy = CommissionService.getStrategy();
    expect(strategy.name).toBe('TIERED_FLAT');

    const commission = CommissionService.calculate({
      serviceTier: ServiceTier.LOCAL,
      codAmount: 100,
    });
    expect(commission.toNumber()).toBe(15);
  });

  it('CommissionService should allow plugging in a custom strategy', () => {
    class CustomPercentWithBonusStrategy implements CommissionStrategy {
      readonly name = 'PERCENT_PLUS_BONUS';
      calculate(ctx: CommissionContext): Decimal {
        const cod = new Decimal(ctx.codAmount.toString());
        // 5% of COD + 10 EGP base
        return cod.times(0.05).plus(10).toDecimalPlaces(2);
      }
    }

    CommissionService.setStrategy(new CustomPercentWithBonusStrategy());
    expect(CommissionService.getStrategy().name).toBe('PERCENT_PLUS_BONUS');

    const result = CommissionService.calculate({
      serviceTier: ServiceTier.LOCAL,
      codAmount: 200,
    });
    // 200 * 0.05 = 10, + 10 = 20
    expect(result.toNumber()).toBe(20);
  });
});
