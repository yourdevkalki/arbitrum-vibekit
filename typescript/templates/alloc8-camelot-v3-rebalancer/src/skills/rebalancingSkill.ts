import { z } from 'zod';
import { defineSkill } from 'arbitrum-vibekit-core';
import {
  getWalletLiquidityPositionsTool,
  getLiquidityPoolsTool,
  getTokenMarketDataTool,
  withdrawLiquidityTool,
  supplyLiquidityTool,
  swapTokensTool,
  getWalletBalancesTool,
} from '../tools/index.js';

// Input schema for the rebalancing skill
export const rebalancingSkillInputSchema = z.object({
  instruction: z.string().describe('Rebalancing instruction or query about LP positions'),
  walletAddress: z.string().optional().describe('Wallet address to analyze positions for'),
  poolAddress: z.string().optional().describe('Specific pool to focus on'),
});

/**
 * LP Rebalancing Skill
 *
 * Provides comprehensive liquidity position management for Camelot v3 pools.
 * Supports position analysis, rebalancing evaluation, and execution.
 */
export const rebalancingSkill = defineSkill({
  id: 'lp-rebalancing',
  name: 'LP Rebalancing',
  description:
    'Analyze and rebalance concentrated liquidity positions on Camelot v3 for optimal returns',
  tags: ['defi', 'liquidity', 'camelot', 'rebalancing', 'yield', 'v3'],
  examples: [
    'Analyze my current LP positions',
    'Check if my ETH/USDC position needs rebalancing',
    'Rebalance my position to optimal range',
    'Withdraw liquidity from position 123',
    'Supply liquidity to ETH/USDC pool',
    'Get market data for my tokens',
    'What are my current token balances?',
  ],
  inputSchema: rebalancingSkillInputSchema,
  mcpServers: {
    'ember-onchain': {
      url: process.env.EMBER_MCP_SERVER_URL || 'https://api.emberai.xyz/mcp',
      alwaysAllow: [
        'getCapabilities',
        'getWalletLiquidityPositions',
        'getLiquidityPools',
        'getTokenMarketData',
        'withdrawLiquidity',
        'supplyLiquidity',
        'swapTokens',
        'getWalletBalances',
      ],
      disabled: false,
    },
  },
  tools: [
    getWalletLiquidityPositionsTool,
    getLiquidityPoolsTool,
    getTokenMarketDataTool,
    withdrawLiquidityTool,
    supplyLiquidityTool,
    swapTokensTool,
    getWalletBalancesTool,
  ],
  // No manual handler - use LLM orchestration for flexible routing
});

export type RebalancingSkillInput = z.infer<typeof rebalancingSkillInputSchema>;
