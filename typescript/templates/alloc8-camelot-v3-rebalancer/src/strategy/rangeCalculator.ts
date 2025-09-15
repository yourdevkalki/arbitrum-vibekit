/**
 * Range calculator for optimal liquidity positioning
 */

import type {
  PoolPosition,
  PoolState,
  TokenMarketData,
  RiskProfile,
  RiskProfileSettings,
  RebalanceEvaluation,
} from '../config/types.js';
import type { EnhancedPoolPosition } from '../utils/directPositionFetcher.js';
import { RISK_PROFILES } from '../config/types.js';
import {
  calculateVolatility,
  calculateOptimalRangeWidth,
  priceRangeToTicks,
  tickRangeToPrice,
} from './volatilityCalculator.js';

/**
 * Calculate optimal range for a liquidity position
 */
export function calculateOptimalRange(
  poolState: PoolState,
  token0Data: TokenMarketData,
  token1Data: TokenMarketData,
  riskProfile: RiskProfile
): { tickLower: number; tickUpper: number; priceRange: [number, number] } {
  const riskSettings = RISK_PROFILES[riskProfile];

  // Calculate volatility metrics
  const volatilityMetrics = calculateVolatility(token0Data, token1Data, poolState);

  // Calculate optimal range width
  const rangeWidth = calculateOptimalRangeWidth(
    volatilityMetrics,
    riskSettings.rangeWidthMultiplier
  );

  // Get current price
  const currentPrice = parseFloat(poolState.price);

  // Convert to tick range
  const { tickLower, tickUpper } = priceRangeToTicks(currentPrice, rangeWidth);

  // Convert back to price range for verification
  const { priceLower, priceUpper } = tickRangeToPrice(tickLower, tickUpper);

  return {
    tickLower,
    tickUpper,
    priceRange: [priceLower, priceUpper],
  };
}

/**
 * Evaluate if a position needs rebalancing
 */
export function evaluateRebalanceNeed(
  position: EnhancedPoolPosition,
  poolState: PoolState,
  token0Data: TokenMarketData,
  token1Data: TokenMarketData,
  riskProfile: RiskProfile
): RebalanceEvaluation {
  const riskSettings = RISK_PROFILES[riskProfile];
  const currentPrice = parseFloat(poolState.price);

  // Get current position range
  const currentRange = tickRangeToPrice(position.tickLower, position.tickUpper);

  // Calculate optimal range
  const optimalRange = calculateOptimalRange(poolState, token0Data, token1Data, riskProfile);

  // Check if position is out of range
  const isOutOfRange = !position.isInRange;

  // Check price deviation from center of range
  const rangeMidpoint = (currentRange.priceLower + currentRange.priceUpper) / 2;
  const priceDeviation = Math.abs(currentPrice - rangeMidpoint) / rangeMidpoint;

  // Check liquidity utilization
  const rangeWidth = (currentRange.priceUpper - currentRange.priceLower) / rangeMidpoint;
  const utilizationScore = position.isInRange ? 1 - priceDeviation / (rangeWidth / 2) : 0;

  // Determine if rebalance is needed
  let needsRebalance = false;
  let reason = '';

  if (isOutOfRange) {
    needsRebalance = true;
    reason = 'Position is out of range';
  } else if (priceDeviation > riskSettings.rebalanceThreshold) {
    needsRebalance = true;
    reason = `Price deviation (${(priceDeviation * 100).toFixed(1)}%) exceeds threshold (${(riskSettings.rebalanceThreshold * 100).toFixed(1)}%)`;
  } else if (utilizationScore < 0.3) {
    needsRebalance = true;
    reason = `Low liquidity utilization (${(utilizationScore * 100).toFixed(1)}%)`;
  }

  // Estimate APR improvement
  const currentUtilization = Math.max(0.1, utilizationScore);
  const optimalUtilization = 0.8; // Assume optimal utilization
  const aprImprovement = (optimalUtilization / currentUtilization - 1) * 100;

  // Estimate gas cost (rough approximation)
  const gasPrice = 0.1; // $0.10 for rebalance on Arbitrum
  const estimatedGasCost = gasPrice.toString();

  // Risk assessment
  let riskAssessment = 'Low';
  if (priceDeviation > 0.2) riskAssessment = 'High';
  else if (priceDeviation > 0.1) riskAssessment = 'Medium';

  return {
    positionId: position.positionId,
    poolAddress: position.poolAddress,
    currentPrice: parseFloat(poolState.price),
    priceDeviation,
    needsRebalance,
    currentRange: {
      lower: position.tickLower,
      upper: position.tickUpper,
    },
    isInRange: position.isInRange,
    liquidity: position.liquidity,
    fees: {
      token0: position.fees0,
      token1: position.fees1,
    },
    // Add token information for withdrawal operations
    token0: position.token0,
    token1: position.token1,
    token0Symbol: position.token0Symbol || 'UNKNOWN',
    token1Symbol: position.token1Symbol || 'UNKNOWN',
    timestamp: new Date(),
  };
}

/**
 * Calculate position health score (0-100)
 */
export function calculatePositionHealth(
  position: PoolPosition,
  poolState: PoolState,
  riskProfile: RiskProfile
): number {
  const currentPrice = parseFloat(poolState.price);
  const currentRange = tickRangeToPrice(position.tickLower, position.tickUpper);

  // Base score for being in range
  let score = position.isInRange ? 50 : 0;

  if (position.isInRange) {
    // Calculate how centered the price is in the range
    const rangeMidpoint = (currentRange.priceLower + currentRange.priceUpper) / 2;
    const rangeWidth = currentRange.priceUpper - currentRange.priceLower;
    const distanceFromCenter = Math.abs(currentPrice - rangeMidpoint);
    const centerScore = Math.max(0, 50 - (distanceFromCenter / rangeWidth) * 100);

    score += centerScore;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate expected fees for a given range
 */
export function calculateExpectedFees(
  poolState: PoolState,
  tickLower: number,
  tickUpper: number,
  liquidityAmount: string
): number {
  // Simplified fee calculation based on volume and range coverage
  const volume24h = parseFloat(poolState.volume24h);
  const tvl = parseFloat(poolState.tvl);
  const fee = poolState.fee / 1000000; // Convert from basis points

  // Estimate range coverage (what percentage of trades occur in this range)
  const currentTick = poolState.tick;
  const tickRange = tickUpper - tickLower;
  const rangeCoverage = Math.min(1, 200 / tickRange); // Assume optimal range covers ~200 ticks

  // Position's share of liquidity
  const positionLiquidity = parseFloat(liquidityAmount);
  const poolLiquidity = parseFloat(poolState.liquidity);
  const liquidityShare = positionLiquidity / poolLiquidity;

  // Expected daily fees
  const dailyFees = volume24h * fee * rangeCoverage * liquidityShare;

  return dailyFees;
}
