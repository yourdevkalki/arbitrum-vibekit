/**
 * Range Calculator for Concentrated Liquidity Positions
 *
 * Calculates optimal tick ranges based on:
 * - Current pool price and liquidity distribution
 * - Historical volatility and price trends
 * - Risk profile parameters
 * - Fee optimization targets
 */

import { getRiskProfile, type RiskProfile } from './riskProfiles.js';
import {
  calculateVolatility,
  getVolatilityAdjustedRange,
  type PriceData,
  type VolatilityMetrics,
} from './volatilityCalculator.js';

export interface PoolState {
  currentPrice: number;
  token0Symbol: string;
  token1Symbol: string;
  tickSpacing: number;
  fee: number; // Fee tier (e.g., 3000 = 0.3%)
  liquidity: string;
  sqrtPriceX96: string;
  tick: number;
}

export interface LiquidityDistribution {
  activeLiquidity: number;
  totalLiquidity: number;
  utilizationRate: number;
  concentrationRatio: number; // How concentrated liquidity is around current price
}

export interface OptimalRange {
  lowerTick: number;
  upperTick: number;
  lowerPrice: number;
  upperPrice: number;
  rangeWidth: number; // As percentage (0-1)
  confidence: number; // Confidence in the range (0-1)
  reasoning: string[]; // Human-readable reasoning for the range
  expectedAPR: number; // Expected APR based on current conditions
  riskScore: number; // Risk score (0-100)
}

export interface RangeCalculationInput {
  poolState: PoolState;
  riskProfile: string | RiskProfile;
  priceHistory?: PriceData[];
  liquidityDistribution?: LiquidityDistribution;
  volatilityMethod?: 'standard' | 'ewma' | 'garch';
  customRangeWidth?: number; // Override default range width
}

/**
 * Calculate optimal tick range for a concentrated liquidity position
 */
export function calculateOptimalRange(input: RangeCalculationInput): OptimalRange {
  const riskProfile =
    typeof input.riskProfile === 'string' ? getRiskProfile(input.riskProfile) : input.riskProfile;

  const reasoning: string[] = [];
  let rangeWidth = input.customRangeWidth || riskProfile.rangeWidth.default;

  // Calculate volatility if price history is available
  let volatilityMetrics: VolatilityMetrics | undefined;
  if (input.priceHistory && input.priceHistory.length > 1) {
    volatilityMetrics = calculateVolatility(
      input.priceHistory,
      input.volatilityMethod || 'standard'
    );

    // Adjust range based on volatility
    rangeWidth = getVolatilityAdjustedRange(
      rangeWidth,
      volatilityMetrics,
      riskProfile.volatilityFactor.weight
    );

    reasoning.push(
      `Volatility-adjusted range: ${(volatilityMetrics.annualizedVolatility * 100).toFixed(1)}% annual volatility detected`
    );
    reasoning.push(`Volatility trend: ${volatilityMetrics.trend}`);
  } else {
    reasoning.push('Using default range width (no price history available)');
  }

  // Adjust based on liquidity distribution
  if (input.liquidityDistribution) {
    const { utilizationRate, concentrationRatio } = input.liquidityDistribution;

    if (utilizationRate < riskProfile.feeOptimization.targetUtilization) {
      // Low utilization - can narrow range to capture more fees
      rangeWidth *= 0.9;
      reasoning.push(
        `Narrowed range due to low liquidity utilization (${(utilizationRate * 100).toFixed(1)}%)`
      );
    } else if (utilizationRate > riskProfile.feeOptimization.targetUtilization * 1.2) {
      // High utilization - widen range to reduce IL risk
      rangeWidth *= 1.1;
      reasoning.push(
        `Widened range due to high liquidity utilization (${(utilizationRate * 100).toFixed(1)}%)`
      );
    }

    if (concentrationRatio > 0.8) {
      // Very concentrated liquidity - slightly widen to differentiate
      rangeWidth *= 1.05;
      reasoning.push('Slightly widened range due to high liquidity concentration');
    }
  }

  // Apply risk profile constraints
  rangeWidth = Math.max(
    riskProfile.rangeWidth.min,
    Math.min(riskProfile.rangeWidth.max, rangeWidth)
  );
  reasoning.push(`Applied ${riskProfile.name} risk profile constraints`);

  // Convert to price range
  const currentPrice = input.poolState.currentPrice;
  const lowerPrice = currentPrice * (1 - rangeWidth / 2);
  const upperPrice = currentPrice * (1 + rangeWidth / 2);

  // Convert prices to ticks
  const lowerTick = priceToTick(lowerPrice, input.poolState.tickSpacing);
  const upperTick = priceToTick(upperPrice, input.poolState.tickSpacing);

  // Recalculate actual prices from rounded ticks
  const actualLowerPrice = tickToPrice(lowerTick);
  const actualUpperPrice = tickToPrice(upperTick);
  const actualRangeWidth = (actualUpperPrice - actualLowerPrice) / currentPrice;

  // Calculate confidence based on data availability
  let confidence = 0.7; // Base confidence
  if (volatilityMetrics) {
    confidence = Math.max(confidence, volatilityMetrics.confidence);
  }
  if (input.liquidityDistribution) {
    confidence = Math.min(confidence + 0.2, 1.0);
  }

  // Estimate expected APR (simplified model)
  const expectedAPR = estimateAPR(
    input.poolState,
    actualRangeWidth,
    input.liquidityDistribution,
    riskProfile
  );

  // Calculate risk score
  const riskScore = calculateRiskScore(actualRangeWidth, volatilityMetrics, riskProfile);

  return {
    lowerTick,
    upperTick,
    lowerPrice: actualLowerPrice,
    upperPrice: actualUpperPrice,
    rangeWidth: actualRangeWidth,
    confidence,
    reasoning,
    expectedAPR,
    riskScore,
  };
}

/**
 * Check if a position needs rebalancing
 */
export function shouldRebalance(
  currentRange: { lowerPrice: number; upperPrice: number },
  currentPrice: number,
  riskProfile: string | RiskProfile,
  lastRebalanceTime?: number
): {
  shouldRebalance: boolean;
  reason: string;
  urgency: 'low' | 'medium' | 'high';
} {
  const profile = typeof riskProfile === 'string' ? getRiskProfile(riskProfile) : riskProfile;

  // Check time threshold
  if (lastRebalanceTime) {
    const timeSinceRebalance = Date.now() / 1000 - lastRebalanceTime;
    if (timeSinceRebalance < profile.rebalanceThreshold.timeThreshold) {
      return {
        shouldRebalance: false,
        reason: `Too soon since last rebalance (${Math.round(timeSinceRebalance / 3600)}h ago)`,
        urgency: 'low',
      };
    }
  }

  // Calculate price deviation from range center
  const rangeCenter = (currentRange.lowerPrice + currentRange.upperPrice) / 2;
  const rangeWidth = currentRange.upperPrice - currentRange.lowerPrice;
  const deviation = Math.abs(currentPrice - rangeCenter) / (rangeWidth / 2);

  if (deviation >= profile.rebalanceThreshold.priceDeviation) {
    let urgency: 'low' | 'medium' | 'high' = 'medium';

    if (deviation >= 0.9) urgency = 'high';
    else if (deviation <= 0.6) urgency = 'low';

    return {
      shouldRebalance: true,
      reason: `Price deviation ${(deviation * 100).toFixed(1)}% exceeds threshold ${(profile.rebalanceThreshold.priceDeviation * 100).toFixed(1)}%`,
      urgency,
    };
  }

  return {
    shouldRebalance: false,
    reason: `Price deviation ${(deviation * 100).toFixed(1)}% within acceptable range`,
    urgency: 'low',
  };
}

/**
 * Convert price to tick (simplified - in practice would use Uniswap v3 math)
 */
function priceToTick(price: number, tickSpacing: number): number {
  // Simplified tick calculation: tick = log(price) / log(1.0001)
  const tick = Math.log(price) / Math.log(1.0001);
  // Round to nearest valid tick based on tick spacing
  return Math.round(tick / tickSpacing) * tickSpacing;
}

/**
 * Convert tick to price (simplified - in practice would use Uniswap v3 math)
 */
function tickToPrice(tick: number): number {
  // Simplified price calculation: price = 1.0001^tick
  return Math.pow(1.0001, tick);
}

/**
 * Estimate expected APR based on range and pool conditions
 */
function estimateAPR(
  poolState: PoolState,
  rangeWidth: number,
  liquidityDistribution?: LiquidityDistribution,
  riskProfile?: RiskProfile
): number {
  // Simplified APR estimation model
  const baseFeeAPR = (poolState.fee / 10000) * 100; // Convert fee tier to percentage

  // Narrower ranges capture more fees per unit of liquidity
  const rangeMultiplier = Math.max(0.5, Math.min(3.0, 1 / rangeWidth));

  // Adjust for liquidity competition
  let competitionAdjustment = 1.0;
  if (liquidityDistribution) {
    // More competition = lower fees per LP
    competitionAdjustment = Math.max(0.3, 1 - liquidityDistribution.concentrationRatio * 0.5);
  }

  const estimatedAPR = baseFeeAPR * rangeMultiplier * competitionAdjustment;

  // Cap at reasonable maximums
  return Math.min(estimatedAPR, 200); // Max 200% APR
}

/**
 * Calculate risk score for a position
 */
function calculateRiskScore(
  rangeWidth: number,
  volatilityMetrics?: VolatilityMetrics,
  riskProfile?: RiskProfile
): number {
  let score = 50; // Base score

  // Range width impact (narrower = higher risk)
  if (rangeWidth < 0.05)
    score += 30; // Very narrow
  else if (rangeWidth < 0.1)
    score += 15; // Narrow
  else if (rangeWidth > 0.2) score -= 15; // Wide

  // Volatility impact
  if (volatilityMetrics) {
    const vol = volatilityMetrics.annualizedVolatility;
    if (vol > 1.0)
      score += 25; // Very high volatility
    else if (vol > 0.5)
      score += 15; // High volatility
    else if (vol < 0.2) score -= 10; // Low volatility

    if (volatilityMetrics.trend === 'increasing') score += 10;
    else if (volatilityMetrics.trend === 'decreasing') score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}
