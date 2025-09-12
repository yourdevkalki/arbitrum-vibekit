import { z } from 'zod';
import { defineSkill } from 'arbitrum-vibekit-core';
import {
  startMonitoringTool,
  stopMonitoringTool,
  checkRebalanceNeedTool,
  executeRebalanceWorkflow,
} from '../tools/index.js';

// Input schema for the rebalancing monitor skill
export const rebalancingMonitorSkillInputSchema = z.object({
  instruction: z
    .string()
    .describe('Natural language instruction for monitoring and rebalancing operations'),
  userAddress: z.string().describe('User wallet address for monitoring').optional(),
  operatingMode: z
    .enum(['active', 'passive'])
    .describe('Operating mode - active executes rebalances, passive sends alerts')
    .default('passive'),
  riskProfile: z
    .enum(['low', 'medium', 'high'])
    .describe('Risk profile for rebalancing strategy')
    .default('medium'),
  monitoringInterval: z.number().describe('Monitoring interval in seconds').default(300).optional(),
  pools: z.array(z.string()).describe('Pool addresses or pairs to monitor').optional(),
  rebalanceThreshold: z
    .number()
    .describe('Threshold percentage for triggering rebalance (0-100)')
    .optional(),
  minLiquidityValue: z
    .string()
    .describe('Minimum USD value to consider for rebalancing')
    .optional(),
});

/**
 * Rebalancing Monitor Skill
 *
 * Provides automated monitoring and rebalancing for Camelot v3 positions:
 * - Continuous monitoring of position drift
 * - Risk-based rebalancing strategies
 * - Active mode: automatic execution
 * - Passive mode: alerts and recommendations
 */
export const rebalancingMonitorSkill = defineSkill({
  id: 'rebalancing-monitor',
  name: 'Rebalancing Monitor',
  description:
    'Monitor Camelot v3 positions for optimal rebalancing opportunities with automated execution or alerting',
  tags: ['defi', 'automation', 'monitoring', 'rebalancing', 'camelot', 'concentrated-liquidity'],
  examples: [
    'Start monitoring my ETH/USDC position in active mode',
    'Set up passive monitoring for all my positions with high risk profile',
    'Check if my WETH/ARB position needs rebalancing',
    'Execute rebalance for position #12345 based on current volatility',
    'Stop monitoring and show performance summary',
  ],
  inputSchema: rebalancingMonitorSkillInputSchema,
  mcpServers: {
    'ember-onchain': {
      url: process.env.EMBER_MCP_SERVER_URL || 'https://api.emberai.xyz/mcp',
      alwaysAllow: [
        'getCapabilities',
        'getTokens',
        'getLiquidityPools',
        'getWalletLiquidityPositions',
        'supplyLiquidity',
        'withdrawLiquidity',
        'getTokenMarketData',
      ],
      disabled: false,
    },
  },
  tools: [
    startMonitoringTool,
    stopMonitoringTool,
    checkRebalanceNeedTool,
    executeRebalanceWorkflow,
  ],
  // No manual handler - use LLM orchestration for intelligent monitoring decisions
});

export type RebalancingMonitorSkillInput = z.infer<typeof rebalancingMonitorSkillInputSchema>;
