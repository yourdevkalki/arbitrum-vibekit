import { describe, it, expect, beforeEach, vi } from 'vitest';
import { agentConfig } from '../src/index.js';
import { loadAgentConfig } from '../src/config/index.js';
import {
  calculateVolatility,
  calculateOptimalRangeWidth,
} from '../src/strategy/volatilityCalculator.js';
import { evaluateRebalanceNeed } from '../src/strategy/rangeCalculator.js';
import { RiskProfile, OperatingMode } from '../src/config/types.js';
import type { TokenMarketData, PoolState, PoolPosition } from '../src/config/types.js';

// Mock environment variables
vi.mock('dotenv/config', () => ({}));

describe('Camelot v3 LP Rebalancing Agent', () => {
  beforeEach(() => {
    // Reset environment variables
    vi.stubEnv('POOL_ID', '0x1234567890abcdef1234567890abcdef12345678');
    vi.stubEnv('TOKEN_0', 'ETH');
    vi.stubEnv('TOKEN_1', 'USDC');
    vi.stubEnv(
      'WALLET_PRIVATE_KEY',
      '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
    );
    vi.stubEnv('REBALANCER_MODE', 'passive');
    vi.stubEnv('RISK_PROFILE', 'medium');
  });

  describe('Agent Configuration', () => {
    it('should have correct agent metadata', () => {
      expect(agentConfig.name).toContain('Camelot');
      expect(agentConfig.version).toBe('1.0.0');
      expect(agentConfig.skills).toHaveLength(2);
      expect(agentConfig.capabilities.streaming).toBe(true);
      expect(agentConfig.capabilities.pushNotifications).toBe(true);
    });

    it('should load configuration from environment', () => {
      const config = loadAgentConfig();

      expect(config.mode).toBe(OperatingMode.PASSIVE);
      expect(config.riskProfile).toBe(RiskProfile.MEDIUM);
      expect(config.poolId).toBe('0x1234567890abcdef1234567890abcdef12345678');
      expect(config.token0).toBe('ETH');
      expect(config.token1).toBe('USDC');
      expect(config.checkInterval).toBe(3600000); // 1 hour default
    });

    it('should validate required configuration', () => {
      vi.stubEnv('POOL_ID', '');

      expect(() => loadAgentConfig()).toThrow('Invalid agent configuration');
    });
  });

  describe('Skills', () => {
    it('should have rebalancing skill', () => {
      const rebalancingSkill = agentConfig.skills.find(s => s.id === 'lp-rebalancing');

      expect(rebalancingSkill).toBeDefined();
      expect(rebalancingSkill?.name).toBe('LP Rebalancing');
      expect(rebalancingSkill?.tools).toHaveLength(7);
      expect(rebalancingSkill?.tags).toContain('defi');
      expect(rebalancingSkill?.tags).toContain('camelot');
    });

    it('should have monitoring skill', () => {
      const monitoringSkill = agentConfig.skills.find(s => s.id === 'monitoring-control');

      expect(monitoringSkill).toBeDefined();
      expect(monitoringSkill?.name).toBe('Monitoring Control');
      expect(monitoringSkill?.tools).toHaveLength(3);
      expect(monitoringSkill?.tags).toContain('monitoring');
      expect(monitoringSkill?.tags).toContain('automation');
    });
  });

  describe('Volatility Calculator', () => {
    const mockToken0Data: TokenMarketData = {
      symbol: 'ETH',
      address: '0x...',
      price: 2000,
      priceChange24h: 5.2,
      volume24h: 1000000,
      marketCap: 240000000000,
      volatility: 0.15,
    };

    const mockToken1Data: TokenMarketData = {
      symbol: 'USDC',
      address: '0x...',
      price: 1,
      priceChange24h: 0.1,
      volume24h: 500000,
      marketCap: 50000000000,
      volatility: 0.02,
    };

    const mockPoolData: PoolState = {
      poolAddress: '0x...',
      token0: 'ETH',
      token1: 'USDC',
      fee: 3000,
      tick: 0,
      price: '2000',
      liquidity: '1000000',
      sqrtPriceX96: '3543191142285914205922034323',
      tvl: '2000000',
      volume24h: '100000',
      feesEarned24h: '300',
    };

    it('should calculate volatility metrics', () => {
      const volatility = calculateVolatility(mockToken0Data, mockToken1Data, mockPoolData);

      expect(volatility.historicalVolatility).toBeGreaterThan(0);
      expect(volatility.impliedVolatility).toBeGreaterThan(0);
      expect(volatility.combinedVolatility).toBeGreaterThan(0);
      expect(volatility.confidenceScore).toBeGreaterThan(0);
      expect(volatility.confidenceScore).toBeLessThanOrEqual(1);
    });

    it('should calculate optimal range width', () => {
      const volatility = calculateVolatility(mockToken0Data, mockToken1Data, mockPoolData);
      const rangeWidth = calculateOptimalRangeWidth(volatility, 1.5); // Medium risk multiplier

      expect(rangeWidth).toBeGreaterThan(0.01); // Minimum 1%
      expect(rangeWidth).toBeLessThan(0.5); // Maximum 50%
    });
  });

  describe('Rebalance Evaluation', () => {
    const mockPosition: PoolPosition = {
      positionId: '123',
      poolAddress: '0x...',
      token0: 'ETH',
      token1: 'USDC',
      tickLower: -1000,
      tickUpper: 1000,
      liquidity: '1000000',
      amount0: '1000000000000000000', // 1 ETH
      amount1: '2000000000', // 2000 USDC
      fees0: '100000000000000000', // 0.1 ETH
      fees1: '200000000', // 200 USDC
      isInRange: true,
    };

    const mockPoolState: PoolState = {
      poolAddress: '0x...',
      token0: 'ETH',
      token1: 'USDC',
      fee: 3000,
      tick: 0,
      price: '2000',
      liquidity: '10000000',
      sqrtPriceX96: '3543191142285914205922034323',
      tvl: '20000000',
      volume24h: '1000000',
      feesEarned24h: '3000',
    };

    const mockToken0Data: TokenMarketData = {
      symbol: 'ETH',
      address: '0x...',
      price: 2000,
      priceChange24h: 3.5,
      volume24h: 1000000,
      marketCap: 240000000000,
      volatility: 0.12,
    };

    const mockToken1Data: TokenMarketData = {
      symbol: 'USDC',
      address: '0x...',
      price: 1,
      priceChange24h: 0.05,
      volume24h: 500000,
      marketCap: 50000000000,
      volatility: 0.01,
    };

    it('should evaluate healthy position', () => {
      const evaluation = evaluateRebalanceNeed(
        mockPosition,
        mockPoolState,
        mockToken0Data,
        mockToken1Data,
        RiskProfile.MEDIUM
      );

      expect(evaluation.needsRebalance).toBe(false);
      expect(evaluation.reason).toContain('healthy');
      expect(evaluation.estimatedAprImprovement).toBeGreaterThanOrEqual(0);
    });

    it('should detect out-of-range position', () => {
      const outOfRangePosition = { ...mockPosition, isInRange: false };

      const evaluation = evaluateRebalanceNeed(
        outOfRangePosition,
        mockPoolState,
        mockToken0Data,
        mockToken1Data,
        RiskProfile.MEDIUM
      );

      expect(evaluation.needsRebalance).toBe(true);
      expect(evaluation.reason).toContain('out of range');
    });

    it('should provide rebalance suggestions', () => {
      const evaluation = evaluateRebalanceNeed(
        mockPosition,
        mockPoolState,
        mockToken0Data,
        mockToken1Data,
        RiskProfile.HIGH
      );

      expect(evaluation.currentRange.tickLower).toBe(mockPosition.tickLower);
      expect(evaluation.currentRange.tickUpper).toBe(mockPosition.tickUpper);
      expect(evaluation.suggestedRange.tickLower).toBeDefined();
      expect(evaluation.suggestedRange.tickUpper).toBeDefined();
      expect(evaluation.estimatedGasCost).toBeDefined();
      expect(evaluation.riskAssessment).toMatch(/Low|Medium|High/);
    });
  });

  describe('Risk Profiles', () => {
    it('should have different settings for each risk profile', () => {
      const { RISK_PROFILES } = await import('../src/config/types.js');

      expect(RISK_PROFILES[RiskProfile.LOW].rangeWidthMultiplier).toBeGreaterThan(
        RISK_PROFILES[RiskProfile.HIGH].rangeWidthMultiplier
      );

      expect(RISK_PROFILES[RiskProfile.LOW].rebalanceThreshold).toBeGreaterThan(
        RISK_PROFILES[RiskProfile.HIGH].rebalanceThreshold
      );

      expect(RISK_PROFILES[RiskProfile.LOW].maxSlippage).toBeLessThan(
        RISK_PROFILES[RiskProfile.HIGH].maxSlippage
      );
    });
  });
});
