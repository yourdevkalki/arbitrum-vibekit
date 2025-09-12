import { z } from 'zod';

/**
 * Risk profile configuration
 */
export enum RiskProfile {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/**
 * Operating mode for the agent
 */
export enum OperatingMode {
  PASSIVE = 'passive',
  ACTIVE = 'active',
}

/**
 * Configuration schema for the rebalancing agent
 */
export const AgentConfigSchema = z.object({
  // Operating mode
  mode: z.nativeEnum(OperatingMode).default(OperatingMode.PASSIVE),

  // Risk profile
  riskProfile: z.nativeEnum(RiskProfile).default(RiskProfile.MEDIUM),

  // Pool configuration
  poolId: z.string().describe('Camelot v3 pool ID'),
  token0: z.string().describe('First token symbol (e.g., ETH)'),
  token1: z.string().describe('Second token symbol (e.g., USDC)'),

  // Monitoring configuration
  checkInterval: z
    .number()
    .min(60000)
    .default(3600000)
    .describe('Check interval in milliseconds (default: 1 hour)'),

  // Rebalance triggers
  priceDeviationThreshold: z
    .number()
    .min(0.01)
    .max(1)
    .default(0.05)
    .describe('Price deviation threshold (5% default)'),
  utilizationThreshold: z
    .number()
    .min(0.1)
    .max(1)
    .default(0.8)
    .describe('Liquidity utilization threshold (80% default)'),

  // Wallet configuration
  walletPrivateKey: z.string().describe('Wallet private key for transactions'),

  // Telegram configuration
  telegramBotToken: z.string().optional().describe('Telegram bot token for notifications'),
  telegramChatId: z.string().optional().describe('Telegram chat ID for notifications'),

  // RPC configuration
  arbitrumRpcUrl: z.string().url().default('https://arb1.arbitrum.io/rpc'),

  // MCP server configuration
  emberMcpServerUrl: z.string().url().default('https://api.emberai.xyz/mcp'),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * Risk profile settings
 */
export interface RiskProfileSettings {
  // Range width multiplier (higher = wider ranges)
  rangeWidthMultiplier: number;

  // Rebalance frequency (lower = more frequent)
  rebalanceThreshold: number;

  // Maximum slippage tolerance
  maxSlippage: number;

  // Minimum position size in USD
  minPositionSize: number;
}

/**
 * Predefined risk profile configurations
 */
export const RISK_PROFILES: Record<RiskProfile, RiskProfileSettings> = {
  [RiskProfile.LOW]: {
    rangeWidthMultiplier: 2.0,
    rebalanceThreshold: 0.15, // 15%
    maxSlippage: 0.005, // 0.5%
    minPositionSize: 1000,
  },
  [RiskProfile.MEDIUM]: {
    rangeWidthMultiplier: 1.5,
    rebalanceThreshold: 0.1, // 10%
    maxSlippage: 0.01, // 1%
    minPositionSize: 500,
  },
  [RiskProfile.HIGH]: {
    rangeWidthMultiplier: 1.0,
    rebalanceThreshold: 0.05, // 5%
    maxSlippage: 0.02, // 2%
    minPositionSize: 100,
  },
};

/**
 * Pool position data
 */
export interface PoolPosition {
  positionId: string;
  poolAddress: string;
  token0: string;
  token1: string;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  amount0: string;
  amount1: string;
  fees0: string;
  fees1: string;
  isInRange: boolean;
}

/**
 * Pool state data
 */
export interface PoolState {
  poolAddress: string;
  token0: string;
  token1: string;
  fee: number;
  tick: number;
  price: string;
  liquidity: string;
  sqrtPriceX96: string;
  tvl: string;
  volume24h: string;
  feesEarned24h: string;
}

/**
 * Token market data
 */
export interface TokenMarketData {
  symbol: string;
  address: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  volatility: number;
}

/**
 * Rebalance evaluation result
 */
export interface RebalanceEvaluation {
  needsRebalance: boolean;
  reason: string;
  currentRange: {
    tickLower: number;
    tickUpper: number;
    priceRange: [number, number];
  };
  suggestedRange: {
    tickLower: number;
    tickUpper: number;
    priceRange: [number, number];
  };
  estimatedAprImprovement: number;
  estimatedGasCost: string;
  riskAssessment: string;
}

/**
 * Transaction result
 */
export interface TransactionResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  gasUsed?: string;
  gasPrice?: string;
}
