import { z } from 'zod';
import { defineSkill } from 'arbitrum-vibekit-core';
import {
  getPoolDataTool,
  analyzePoolMetricsTool,
  calculateVolatilityTool,
} from '../tools/index.js';

// Input schema for the pool analytics skill
export const poolAnalyticsSkillInputSchema = z.object({
  instruction: z.string().describe('Natural language instruction for pool analytics operations'),
  poolAddress: z.string().describe('Pool address to analyze').optional(),
  poolPair: z.string().describe('Pool pair (e.g., ETH/USDC) to analyze').optional(),
  timeframe: z
    .enum(['1h', '4h', '24h', '7d', '30d'])
    .describe('Timeframe for analysis')
    .default('24h'),
  includeVolatility: z.boolean().describe('Include volatility analysis').default(true),
});

/**
 * Pool Analytics Skill
 *
 * Provides comprehensive analytics for Camelot v3 pools including:
 * - Pool data fetching (liquidity, price, volume)
 * - Volatility analysis
 * - Fee collection metrics
 * - Liquidity distribution analysis
 */
export const poolAnalyticsSkill = defineSkill({
  id: 'pool-analytics',
  name: 'Pool Analytics',
  description:
    'Analyze Camelot v3 pool metrics, liquidity distribution, volatility, and fee performance',
  tags: ['defi', 'analytics', 'camelot', 'liquidity', 'concentrated-liquidity'],
  examples: [
    'Analyze ETH/USDC pool on Camelot v3',
    'Get liquidity distribution for WETH/ARB pool',
    'Calculate volatility for the last 24 hours',
    'Show fee collection metrics for my positions',
    'Compare pool performance across different timeframes',
  ],
  inputSchema: poolAnalyticsSkillInputSchema,
  mcpServers: {
    'ember-onchain': {
      url: process.env.EMBER_MCP_SERVER_URL || 'https://api.emberai.xyz/mcp',
      alwaysAllow: [
        'getCapabilities',
        'getTokens',
        'getLiquidityPools',
        'getWalletLiquidityPositions',
      ],
      disabled: false,
    },
  },
  tools: [getPoolDataTool, analyzePoolMetricsTool, calculateVolatilityTool],
  // No manual handler - use LLM orchestration for flexible routing
});

export type PoolAnalyticsSkillInput = z.infer<typeof poolAnalyticsSkillInputSchema>;
