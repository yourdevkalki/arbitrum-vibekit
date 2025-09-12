/**
 * Strategy Module Exports
 *
 * Central export point for all strategy-related functionality
 */

// Risk Profiles
export {
  type RiskProfile,
  LOW_RISK_PROFILE,
  MEDIUM_RISK_PROFILE,
  HIGH_RISK_PROFILE,
  getRiskProfile,
  getAvailableRiskProfiles,
} from './riskProfiles.js';

// Volatility Calculation
export {
  type PriceData,
  type VolatilityMetrics,
  calculateVolatility,
  calculateStandardVolatility,
  calculateEWMAVolatility,
  calculateGARCHVolatility,
  getVolatilityAdjustedRange,
} from './volatilityCalculator.js';

// Range Calculation
export {
  type PoolState,
  type LiquidityDistribution,
  type OptimalRange,
  type RangeCalculationInput,
  calculateOptimalRange,
  shouldRebalance,
} from './rangeCalculator.js';
