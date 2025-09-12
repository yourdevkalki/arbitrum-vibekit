/**
 * Risk Profile Configurations for Camelot v3 LP Rebalancing
 *
 * Defines concrete parameters for Low, Medium, and High risk strategies
 * based on the PRD specifications.
 */

export interface RiskProfile {
  name: string;
  rangeWidth: {
    min: number; // Minimum range width as percentage (e.g., 0.05 = 5%)
    max: number; // Maximum range width as percentage
    default: number; // Default range width
  };
  rebalanceThreshold: {
    priceDeviation: number; // Price deviation % to trigger rebalance (0-1)
    volatilityMultiplier: number; // Volatility sensitivity multiplier
    timeThreshold: number; // Minimum time between rebalances (seconds)
  };
  volatilityFactor: {
    weight: number; // How much volatility affects range calculation (0-1)
    lookbackPeriod: number; // Hours to look back for volatility calculation
    adjustmentSpeed: number; // How quickly to adjust to volatility changes (0-1)
  };
  feeOptimization: {
    targetUtilization: number; // Target liquidity utilization (0-1)
    feeAPRWeight: number; // Weight given to fee APR vs IL risk (0-1)
  };
}

/**
 * Low Risk Profile: Conservative, wide ranges, infrequent rebalancing
 */
export const LOW_RISK_PROFILE: RiskProfile = {
  name: 'low',
  rangeWidth: {
    min: 0.1, // 10% minimum range
    max: 0.25, // 25% maximum range
    default: 0.15, // 15% default range
  },
  rebalanceThreshold: {
    priceDeviation: 0.8, // Only rebalance when 80% outside range
    volatilityMultiplier: 0.5, // Low sensitivity to volatility
    timeThreshold: 86400, // 24 hours minimum between rebalances
  },
  volatilityFactor: {
    weight: 0.3, // Low weight on volatility adjustments
    lookbackPeriod: 168, // 7 days lookback
    adjustmentSpeed: 0.2, // Slow adjustment to volatility changes
  },
  feeOptimization: {
    targetUtilization: 0.6, // Target 60% liquidity utilization
    feeAPRWeight: 0.3, // Prioritize IL protection over fee generation
  },
};

/**
 * Medium Risk Profile: Balanced approach, moderate ranges and sensitivity
 */
export const MEDIUM_RISK_PROFILE: RiskProfile = {
  name: 'medium',
  rangeWidth: {
    min: 0.05, // 5% minimum range
    max: 0.15, // 15% maximum range
    default: 0.08, // 8% default range
  },
  rebalanceThreshold: {
    priceDeviation: 0.6, // Rebalance when 60% outside range
    volatilityMultiplier: 1.0, // Standard sensitivity to volatility
    timeThreshold: 21600, // 6 hours minimum between rebalances
  },
  volatilityFactor: {
    weight: 0.6, // Medium weight on volatility adjustments
    lookbackPeriod: 72, // 3 days lookback
    adjustmentSpeed: 0.5, // Moderate adjustment speed
  },
  feeOptimization: {
    targetUtilization: 0.75, // Target 75% liquidity utilization
    feeAPRWeight: 0.6, // Balanced fee generation vs IL protection
  },
};

/**
 * High Risk Profile: Aggressive, narrow ranges, frequent rebalancing
 */
export const HIGH_RISK_PROFILE: RiskProfile = {
  name: 'high',
  rangeWidth: {
    min: 0.02, // 2% minimum range
    max: 0.08, // 8% maximum range
    default: 0.04, // 4% default range
  },
  rebalanceThreshold: {
    priceDeviation: 0.4, // Rebalance when 40% outside range
    volatilityMultiplier: 1.5, // High sensitivity to volatility
    timeThreshold: 3600, // 1 hour minimum between rebalances
  },
  volatilityFactor: {
    weight: 0.8, // High weight on volatility adjustments
    lookbackPeriod: 24, // 24 hours lookback
    adjustmentSpeed: 0.8, // Fast adjustment to volatility changes
  },
  feeOptimization: {
    targetUtilization: 0.85, // Target 85% liquidity utilization
    feeAPRWeight: 0.8, // Prioritize fee generation over IL protection
  },
};

/**
 * Get risk profile by name
 */
export function getRiskProfile(profileName: string): RiskProfile {
  switch (profileName.toLowerCase()) {
    case 'low':
      return LOW_RISK_PROFILE;
    case 'medium':
      return MEDIUM_RISK_PROFILE;
    case 'high':
      return HIGH_RISK_PROFILE;
    default:
      console.warn(`Unknown risk profile: ${profileName}, defaulting to medium`);
      return MEDIUM_RISK_PROFILE;
  }
}

/**
 * Get all available risk profile names
 */
export function getAvailableRiskProfiles(): string[] {
  return ['low', 'medium', 'high'];
}
