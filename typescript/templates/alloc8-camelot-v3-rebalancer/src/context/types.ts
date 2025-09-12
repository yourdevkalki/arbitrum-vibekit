import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { LanguageModel } from 'ai';

export interface TokenInfo {
  address: string;
  chainId: number;
  decimals: number;
  symbol: string;
  name: string;
}

export interface PoolInfo {
  address: string;
  token0: TokenInfo;
  token1: TokenInfo;
  fee: number;
  tickSpacing: number;
  liquidity: string;
  sqrtPriceX96: string;
  tick: number;
}

export interface PositionInfo {
  tokenId: string;
  poolAddress: string;
  token0: TokenInfo;
  token1: TokenInfo;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  amount0: string;
  amount1: string;
  feeGrowthInside0LastX128: string;
  feeGrowthInside1LastX128: string;
  tokensOwed0: string;
  tokensOwed1: string;
}

export interface RiskProfile {
  name: 'low' | 'medium' | 'high';
  volatilityThreshold: number;
  rebalanceThreshold: number;
  rangeMultiplier: number;
  maxSlippage: number;
}

export interface RebalancerConfig {
  userAddress: string;
  riskProfile: RiskProfile;
  operatingMode: 'active' | 'passive';
  monitoringInterval: number; // seconds
  pools: string[]; // pool addresses to monitor
  minLiquidityValue: string; // minimum USD value to rebalance
}

export interface RebalancerContext {
  config: {
    arbitrumRpcUrl: string;
    emberMcpServerUrl: string;
    quicknodeSubdomain?: string;
    quicknodeApiKey?: string;
  };
  mcpClients?: Record<string, Client>;
  llmModel: LanguageModel;
  tokenMap: Record<string, TokenInfo[]>;
  rebalancerConfig?: RebalancerConfig;
  positions: PositionInfo[];
  pools: PoolInfo[];
}
