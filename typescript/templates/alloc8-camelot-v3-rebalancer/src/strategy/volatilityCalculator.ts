/**
 * Volatility calculator for determining optimal range width
 */

import type { TokenMarketData, PoolState } from '../config/types.js';

export interface VolatilityMetrics {
  historicalVolatility: number;
  impliedVolatility: number;
  combinedVolatility: number;
  confidenceScore: number;
}

/**
 * Calculate volatility metrics for a token pair
 */
export function calculateVolatility(
  token0Data: TokenMarketData,
  token1Data: TokenMarketData,
  poolData: PoolState
): VolatilityMetrics {
  // Historical volatility from 24h price changes
  const token0Vol = Math.abs(token0Data.priceChange24h) / 100;
  const token1Vol = Math.abs(token1Data.priceChange24h) / 100;

  // Combined historical volatility (correlation assumed to be 0.5)
  const historicalVolatility = Math.sqrt(
    token0Vol ** 2 + token1Vol ** 2 - 2 * 0.5 * token0Vol * token1Vol
  );

  // Implied volatility from pool metrics
  const volumeToTvlRatio = parseFloat(poolData.volume24h) / parseFloat(poolData.tvl);
  const impliedVolatility = Math.min(volumeToTvlRatio * 0.1, 1.0); // Cap at 100%

  // Combined volatility (weighted average)
  const combinedVolatility = historicalVolatility * 0.7 + impliedVolatility * 0.3;

  // Confidence score based on data quality
  const volumeScore = Math.min(parseFloat(poolData.volume24h) / 100000, 1.0); // Higher volume = higher confidence
  const tvlScore = Math.min(parseFloat(poolData.tvl) / 1000000, 1.0); // Higher TVL = higher confidence
  const confidenceScore = (volumeScore + tvlScore) / 2;

  return {
    historicalVolatility,
    impliedVolatility,
    combinedVolatility,
    confidenceScore,
  };
}

/**
 * Calculate optimal range width based on volatility
 */
export function calculateOptimalRangeWidth(
  volatilityMetrics: VolatilityMetrics,
  riskMultiplier: number
): number {
  // Base range width (percentage from current price)
  const baseWidth = volatilityMetrics.combinedVolatility * riskMultiplier;

  // Adjust based on confidence score
  const confidenceAdjustment = 1 + (1 - volatilityMetrics.confidenceScore) * 0.5;

  // Final range width (minimum 1%, maximum 50%)
  return Math.max(0.01, Math.min(0.5, baseWidth * confidenceAdjustment));
}

/**
 * Convert price range to tick range
 */
export function priceRangeToTicks(
  currentPrice: number,
  rangeWidth: number,
  tickSpacing: number = 60
): { tickLower: number; tickUpper: number } {
  // Calculate price bounds
  const priceLower = currentPrice * (1 - rangeWidth);
  const priceUpper = currentPrice * (1 + rangeWidth);

  // Convert to ticks (using Uniswap v3 formula)
  const tickLower = Math.floor(Math.log(priceLower) / Math.log(1.0001));
  const tickUpper = Math.ceil(Math.log(priceUpper) / Math.log(1.0001));

  // Round to tick spacing
  const roundedTickLower = Math.floor(tickLower / tickSpacing) * tickSpacing;
  const roundedTickUpper = Math.ceil(tickUpper / tickSpacing) * tickSpacing;

  return {
    tickLower: roundedTickLower,
    tickUpper: roundedTickUpper,
  };
}

/**
 * Convert tick range to price range
 */
export function tickRangeToPrice(
  tickLower: number,
  tickUpper: number
): { priceLower: number; priceUpper: number } {
  const priceLower = Math.pow(1.0001, tickLower);
  const priceUpper = Math.pow(1.0001, tickUpper);

  return {
    priceLower,
    priceUpper,
  };
}
