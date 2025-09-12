/**
 * Volatility Calculator for Concentrated Liquidity Range Optimization
 *
 * Implements multiple volatility calculation methods:
 * - Standard deviation (historical volatility)
 * - EWMA (Exponentially Weighted Moving Average)
 * - GARCH (Generalized Autoregressive Conditional Heteroskedasticity)
 */

export interface PriceData {
  timestamp: number;
  price: number;
  volume?: number;
}

export interface VolatilityMetrics {
  annualizedVolatility: number; // Annualized volatility (0-1, e.g., 0.5 = 50%)
  dailyVolatility: number; // Daily volatility
  trend: 'increasing' | 'decreasing' | 'stable'; // Volatility trend
  confidence: number; // Confidence in the calculation (0-1)
  method: 'standard' | 'ewma' | 'garch';
}

/**
 * Calculate standard historical volatility
 */
export function calculateStandardVolatility(
  prices: PriceData[],
  timeframe: string = '24h'
): VolatilityMetrics {
  if (prices.length < 2) {
    return {
      annualizedVolatility: 0.5, // Default to 50% if no data
      dailyVolatility: 0.05,
      trend: 'stable',
      confidence: 0,
      method: 'standard',
    };
  }

  // Calculate log returns
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const currentPrice = prices[i];
    const previousPrice = prices[i - 1];
    if (currentPrice && previousPrice && currentPrice.price > 0 && previousPrice.price > 0) {
      const logReturn = Math.log(currentPrice.price / previousPrice.price);
      returns.push(logReturn);
    }
  }

  if (returns.length === 0) {
    return {
      annualizedVolatility: 0.5,
      dailyVolatility: 0.05,
      trend: 'stable',
      confidence: 0,
      method: 'standard',
    };
  }

  // Calculate mean return
  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

  // Calculate variance
  const variance =
    returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1);

  // Calculate daily volatility
  const dailyVolatility = Math.sqrt(variance);

  // Annualize (assuming ~365 trading days)
  const annualizedVolatility = dailyVolatility * Math.sqrt(365);

  // Determine trend by comparing recent vs older volatility
  const halfPoint = Math.floor(returns.length / 2);
  const recentReturns = returns.slice(halfPoint);
  const olderReturns = returns.slice(0, halfPoint);

  const recentVar =
    recentReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / recentReturns.length;
  const olderVar =
    olderReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / olderReturns.length;

  let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
  if (recentVar > olderVar * 1.1) trend = 'increasing';
  else if (recentVar < olderVar * 0.9) trend = 'decreasing';

  // Confidence based on data points
  const confidence = Math.min(returns.length / 100, 1); // Full confidence with 100+ data points

  return {
    annualizedVolatility,
    dailyVolatility,
    trend,
    confidence,
    method: 'standard',
  };
}

/**
 * Calculate EWMA (Exponentially Weighted Moving Average) volatility
 */
export function calculateEWMAVolatility(
  prices: PriceData[],
  lambda: number = 0.94 // Decay factor, higher = more weight on recent data
): VolatilityMetrics {
  if (prices.length < 2) {
    return calculateStandardVolatility(prices);
  }

  // Calculate log returns
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const currentPrice = prices[i];
    const previousPrice = prices[i - 1];
    if (currentPrice && previousPrice && currentPrice.price > 0 && previousPrice.price > 0) {
      const logReturn = Math.log(currentPrice.price / previousPrice.price);
      returns.push(logReturn);
    }
  }

  if (returns.length === 0) {
    return calculateStandardVolatility(prices);
  }

  // Calculate EWMA variance
  let ewmaVariance = Math.pow(returns[0]!, 2); // Initialize with first return squared

  for (let i = 1; i < returns.length; i++) {
    const currentReturn = returns[i];
    if (currentReturn !== undefined) {
      ewmaVariance = lambda * ewmaVariance + (1 - lambda) * Math.pow(currentReturn, 2);
    }
  }

  const dailyVolatility = Math.sqrt(ewmaVariance);
  const annualizedVolatility = dailyVolatility * Math.sqrt(365);

  // Trend calculation using recent EWMA values
  const recentPoints = Math.min(10, returns.length);
  let recentEWMA = ewmaVariance;

  const recentReturns = returns.slice(-recentPoints);
  for (const ret of recentReturns) {
    if (ret !== undefined) {
      recentEWMA = lambda * recentEWMA + (1 - lambda) * Math.pow(ret, 2);
    }
  }

  let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
  if (recentEWMA > ewmaVariance * 1.1) trend = 'increasing';
  else if (recentEWMA < ewmaVariance * 0.9) trend = 'decreasing';

  const confidence = Math.min(returns.length / 50, 1); // EWMA needs fewer points

  return {
    annualizedVolatility,
    dailyVolatility,
    trend,
    confidence,
    method: 'ewma',
  };
}

/**
 * Simple GARCH(1,1) volatility calculation
 */
export function calculateGARCHVolatility(
  prices: PriceData[],
  alpha: number = 0.1, // Weight on recent squared returns
  beta: number = 0.85 // Weight on previous variance
): VolatilityMetrics {
  if (prices.length < 10) {
    return calculateEWMAVolatility(prices);
  }

  // Calculate log returns
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const currentPrice = prices[i];
    const previousPrice = prices[i - 1];
    if (currentPrice && previousPrice && currentPrice.price > 0 && previousPrice.price > 0) {
      const logReturn = Math.log(currentPrice.price / previousPrice.price);
      returns.push(logReturn);
    }
  }

  if (returns.length < 10) {
    return calculateEWMAVolatility(prices);
  }

  // Initialize with sample variance
  const initialReturns = returns.slice(0, 10);
  const mean = initialReturns.reduce((s, x) => s + x, 0) / initialReturns.length;
  const initialVariance = initialReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / 9;

  // GARCH(1,1): σ²(t) = ω + α*ε²(t-1) + β*σ²(t-1)
  const omega = initialVariance * (1 - alpha - beta); // Long-run variance
  let variance = initialVariance;
  const variances: number[] = [variance];

  for (let i = 1; i < returns.length; i++) {
    const previousReturn = returns[i - 1];
    if (previousReturn !== undefined) {
      variance = omega + alpha * Math.pow(previousReturn, 2) + beta * variance;
      variances.push(variance);
    }
  }

  const currentVariance = variances[variances.length - 1];
  if (!currentVariance || currentVariance <= 0) {
    return calculateEWMAVolatility(prices);
  }

  const dailyVolatility = Math.sqrt(currentVariance);
  const annualizedVolatility = dailyVolatility * Math.sqrt(365);

  // Trend based on recent variance evolution
  const recentVariances = variances.slice(-10);
  const olderVariances = variances.slice(-20, -10);

  const recentAvg = recentVariances.reduce((sum, v) => sum + v, 0) / recentVariances.length;
  const olderAvg = olderVariances.reduce((sum, v) => sum + v, 0) / olderVariances.length;

  let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
  if (recentAvg > olderAvg * 1.1) trend = 'increasing';
  else if (recentAvg < olderAvg * 0.9) trend = 'decreasing';

  const confidence = Math.min(returns.length / 100, 1);

  return {
    annualizedVolatility,
    dailyVolatility,
    trend,
    confidence,
    method: 'garch',
  };
}

/**
 * Calculate volatility using specified method
 */
export function calculateVolatility(
  prices: PriceData[],
  method: 'standard' | 'ewma' | 'garch' = 'standard',
  timeframe: string = '24h'
): VolatilityMetrics {
  switch (method) {
    case 'ewma':
      return calculateEWMAVolatility(prices);
    case 'garch':
      return calculateGARCHVolatility(prices);
    default:
      return calculateStandardVolatility(prices, timeframe);
  }
}

/**
 * Get volatility-adjusted range width
 */
export function getVolatilityAdjustedRange(
  baseRange: number,
  volatilityMetrics: VolatilityMetrics,
  volatilityWeight: number = 0.5
): number {
  const { annualizedVolatility, trend } = volatilityMetrics;

  // Base adjustment based on volatility level
  let adjustment = 1.0;

  if (annualizedVolatility > 1.0) {
    // Very high volatility - widen range significantly
    adjustment = 1.0 + (annualizedVolatility - 1.0) * volatilityWeight * 2;
  } else if (annualizedVolatility > 0.5) {
    // High volatility - widen range moderately
    adjustment = 1.0 + (annualizedVolatility - 0.5) * volatilityWeight;
  } else if (annualizedVolatility < 0.2) {
    // Low volatility - can narrow range slightly
    adjustment = 1.0 - (0.2 - annualizedVolatility) * volatilityWeight * 0.5;
  }

  // Trend adjustment
  if (trend === 'increasing') {
    adjustment *= 1.1; // Widen range if volatility is increasing
  } else if (trend === 'decreasing') {
    adjustment *= 0.95; // Can narrow range if volatility is decreasing
  }

  // Apply confidence factor
  const confidenceAdjustment = 0.5 + volatilityMetrics.confidence * 0.5;
  adjustment = 1.0 + (adjustment - 1.0) * confidenceAdjustment;

  return Math.max(baseRange * adjustment, baseRange * 0.5); // Don't go below 50% of base range
}
