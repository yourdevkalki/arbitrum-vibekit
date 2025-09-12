import { z } from 'zod';
import { defineSkill } from 'arbitrum-vibekit-core';
import {
  mintPositionTool,
  burnPositionTool,
  collectFeesTool,
  rebalancePositionWorkflow,
} from '../tools/index.js';

// Input schema for the position management skill
export const positionManagementSkillInputSchema = z.object({
  instruction: z
    .string()
    .describe('Natural language instruction for position management operations'),
  userAddress: z.string().describe('User wallet address for position management').optional(),
  poolAddress: z.string().describe('Pool address for the position').optional(),
  poolPair: z.string().describe('Pool pair (e.g., ETH/USDC) for the position').optional(),
  positionId: z.string().describe('Position token ID for existing position operations').optional(),
  amount0: z.string().describe('Amount of token0 to use').optional(),
  amount1: z.string().describe('Amount of token1 to use').optional(),
  tickLower: z.number().describe('Lower tick for the position range').optional(),
  tickUpper: z.number().describe('Upper tick for the position range').optional(),
  riskProfile: z
    .enum(['low', 'medium', 'high'])
    .describe('Risk profile for position sizing')
    .optional(),
});

/**
 * Position Management Skill
 *
 * Provides comprehensive position management for Camelot v3 concentrated liquidity:
 * - Mint new positions with optimal ranges
 * - Burn existing positions
 * - Collect accumulated fees
 * - Rebalance positions based on market conditions
 */
export const positionManagementSkill = defineSkill({
  id: 'position-management',
  name: 'Position Management',
  description:
    'Manage Camelot v3 liquidity positions including minting, burning, fee collection, and automated rebalancing',
  tags: ['defi', 'liquidity', 'camelot', 'concentrated-liquidity', 'position-management'],
  examples: [
    'Mint a new ETH/USDC position with medium risk profile',
    'Burn position #12345 and collect fees',
    'Rebalance my WETH/ARB position based on current volatility',
    'Collect fees from all my positions',
    'Create a low-risk position in the USDC/DAI pool',
  ],
  inputSchema: positionManagementSkillInputSchema,
  mcpServers: {
    'ember-onchain': {
      url: process.env.EMBER_MCP_SERVER_URL || 'https://api.emberai.xyz/mcp',
      alwaysAllow: [
        'getCapabilities',
        'getTokens',
        'supplyLiquidity',
        'withdrawLiquidity',
        'getWalletLiquidityPositions',
        'getLiquidityPools',
      ],
      disabled: false,
    },
  },
  tools: [mintPositionTool, burnPositionTool, collectFeesTool, rebalancePositionWorkflow],
  // No manual handler - use LLM orchestration for complex position management
});

export type PositionManagementSkillInput = z.infer<typeof positionManagementSkillInputSchema>;
