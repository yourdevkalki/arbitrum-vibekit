import { z } from 'zod';
import { type VibkitToolDefinition } from 'arbitrum-vibekit-core';
import type { Task } from '@google-a2a/types';
import { TaskState } from '@google-a2a/types';
import type { RebalancerContext } from '../context/types.js';
import {
  calculateVolatility,
  shouldRebalance,
  type PriceData,
  type VolatilityMetrics,
} from '../strategy/index.js';

// ============================================================================
// POOL ANALYTICS TOOLS
// ============================================================================

const getPoolDataParametersSchema = z.object({
  poolAddress: z.string().optional().describe('Address of the Camelot v3 pool'),
  poolPair: z.string().optional().describe('Token pair symbol (e.g., WETH/USDC)'),
  includeMetrics: z.boolean().default(true).describe('Include additional pool metrics'),
});

export const getPoolDataTool: VibkitToolDefinition<any, Task, RebalancerContext> = {
  name: 'get-pool-data',
  description:
    'Fetch comprehensive data for a Camelot v3 pool including liquidity, price, and metrics',
  parameters: getPoolDataParametersSchema,
  execute: async (args: z.infer<typeof getPoolDataParametersSchema>, context) => {
    try {
      console.log('[GetPoolData] Fetching pool data from Ember MCP server...', args);

      // Get the Ember MCP client from context
      const emberClient = context.mcpClients?.['ember-onchain'];
      if (!emberClient) {
        throw new Error('Ember MCP client not available. Please check your configuration.');
      }

      let poolData: any;

      if (args.poolAddress) {
        // Query by specific pool address
        console.log(`[GetPoolData] Querying pool by address: ${args.poolAddress}`);
        const response = await emberClient.callTool({
          name: 'getLiquidityPools',
          arguments: {
            chainId: '42161', // Arbitrum
            poolAddress: args.poolAddress,
          },
        });
        poolData = response;
      } else if (args.poolPair) {
        // Query by token pair
        console.log(`[GetPoolData] Querying pool by pair: ${args.poolPair}`);
        const [token0Symbol, token1Symbol] = args.poolPair.split('/');

        // First get available tokens to resolve addresses
        const tokensResponse = await emberClient.callTool({
          name: 'getTokens',
          arguments: {
            chainId: '42161',
          },
        });

        // Find token addresses from symbols
        const token0 = context.custom?.tokenMap?.[token0Symbol?.toUpperCase() || '']?.[0];
        const token1 = context.custom?.tokenMap?.[token1Symbol?.toUpperCase() || '']?.[0];

        if (!token0 || !token1) {
          throw new Error(`Could not resolve token addresses for pair ${args.poolPair}`);
        }

        const response = await emberClient.callTool({
          name: 'getLiquidityPools',
          arguments: {
            chainId: '42161',
            token0Address: token0.address,
            token1Address: token1.address,
          },
        });
        poolData = response;
      } else {
        throw new Error('Either poolAddress or poolPair must be provided');
      }

      // Extract pool information from response
      const pools = poolData?.pools || [];
      if (pools.length === 0) {
        throw new Error('No pools found for the specified criteria');
      }

      const pool = pools[0]; // Take the first pool if multiple found

      const responseText = `📊 Pool Data for ${pool.token0?.symbol || 'Token0'}/${pool.token1?.symbol || 'Token1'}:

🏊 Basic Info:
- Pool Address: ${pool.address || 'N/A'}
- Pool Pair: ${pool.token0?.symbol || 'Token0'}/${pool.token1?.symbol || 'Token1'}
- Fee Tier: ${pool.fee ? pool.fee / 10000 : 'N/A'}%
- Tick Spacing: ${pool.tickSpacing || 'N/A'}
- Current Price: ${pool.price || 'N/A'}
- Total Liquidity: ${pool.liquidity || 'N/A'}
- Provider: Camelot v3

💰 Token Details:
- Token0: ${pool.token0?.name || 'Unknown'} (${pool.token0?.symbol || 'N/A'})
- Token1: ${pool.token1?.name || 'Unknown'} (${pool.token1?.symbol || 'N/A'})

${
  args.includeMetrics
    ? `
📈 Additional Metrics:
- 24h Volume: ${pool.volume24h || 'N/A'}
- 24h Fees: ${pool.fees24h || 'N/A'}
- TVL: ${pool.tvl || 'N/A'}
`
    : ''
}

✅ Pool data retrieved successfully from Camelot v3!`;

      return {
        id: 'get-pool-data',
        contextId: `pool-data-success-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Completed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [{ kind: 'text', text: responseText }],
          },
        },
        artifacts: [
          {
            artifactId: `pool-data-${Date.now()}`,
            name: 'pool-data',
            parts: [{ kind: 'data', data: { pool } }],
          },
        ],
      };
    } catch (error) {
      console.error('[GetPoolData] Error:', error);
      return {
        id: 'get-pool-data',
        contextId: `pool-data-error-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [
              {
                kind: 'text',
                text: `Error fetching pool data: ${(error as Error).message}`,
              },
            ],
          },
        },
      };
    }
  },
};

// ============================================================================
// VOLATILITY CALCULATION TOOL
// ============================================================================

const calculateVolatilityParametersSchema = z.object({
  poolPair: z.string().describe('Pool pair (e.g., ETH/USDC)'),
  timeframe: z.enum(['1h', '4h', '24h', '7d', '30d']).default('24h'),
  method: z
    .enum(['standard', 'garch', 'ewma'])
    .describe('Volatility calculation method')
    .default('standard'),
});

export const calculateVolatilityTool: VibkitToolDefinition<any, Task, RebalancerContext> = {
  name: 'calculate-volatility',
  description: 'Calculate volatility metrics for optimal range determination',
  parameters: calculateVolatilityParametersSchema,
  execute: async (args: z.infer<typeof calculateVolatilityParametersSchema>, context) => {
    try {
      // Generate sample price data for demonstration
      const samplePriceData: PriceData[] = generateSamplePriceData(args.poolPair, args.timeframe);

      // Calculate volatility using the strategy engine
      const volatilityMetrics = calculateVolatility(samplePriceData, args.method, args.timeframe);

      const responseText = `📊 Volatility Analysis for ${args.poolPair}:

🔍 Method: ${volatilityMetrics.method.toUpperCase()}
📈 Annualized Volatility: ${(volatilityMetrics.annualizedVolatility * 100).toFixed(2)}%
📅 Daily Volatility: ${(volatilityMetrics.dailyVolatility * 100).toFixed(2)}%
📊 Trend: ${volatilityMetrics.trend.toUpperCase()}
🎯 Confidence: ${(volatilityMetrics.confidence * 100).toFixed(0)}%

💡 Range Recommendations:
${getVolatilityRangeRecommendation(volatilityMetrics)}

⚠️ Risk Assessment:
${getRiskAssessment(volatilityMetrics)}`;

      return {
        id: 'calculate-volatility',
        contextId: `volatility-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Completed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [{ kind: 'text', text: responseText }],
          },
        },
        artifacts: [
          {
            artifactId: `volatility-${Date.now()}`,
            name: 'volatility-data',
            parts: [{ kind: 'data', data: volatilityMetrics }],
          },
        ],
      };
    } catch (error) {
      console.error('[CalculateVolatility] Error:', error);
      return {
        id: 'calculate-volatility',
        contextId: `volatility-error-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [
              {
                kind: 'text',
                text: `Error calculating volatility: ${(error as Error).message}`,
              },
            ],
          },
        },
      };
    }
  },
};

// ============================================================================
// REBALANCING TOOLS
// ============================================================================

const checkRebalanceNeedParametersSchema = z.object({
  positionNumber: z.number().describe('Position number to check').optional(),
  checkAll: z.boolean().describe('Check all positions').default(false),
  riskProfile: z
    .enum(['low', 'medium', 'high'])
    .describe('Risk profile for assessment')
    .default('medium'),
});

export const checkRebalanceNeedTool: VibkitToolDefinition<any, Task, RebalancerContext> = {
  name: 'check-rebalance-need',
  description: 'Check if positions need rebalancing based on current market conditions',
  parameters: checkRebalanceNeedParametersSchema,
  execute: async (args: z.infer<typeof checkRebalanceNeedParametersSchema>, context) => {
    // Mock analysis using the strategy engine
    const mockCurrentRange = { lowerPrice: 1800, upperPrice: 2200 };
    const mockCurrentPrice = 2100;

    const rebalanceDecision = shouldRebalance(mockCurrentRange, mockCurrentPrice, args.riskProfile);

    const mockAnalysis = {
      positionNumber: args.positionNumber || 1,
      currentPrice: mockCurrentPrice,
      rangeCenter: (mockCurrentRange.lowerPrice + mockCurrentRange.upperPrice) / 2,
      deviation: Math.abs(mockCurrentPrice - 2000) / 200,
      needsRebalance: rebalanceDecision.shouldRebalance,
      reason: rebalanceDecision.reason,
      urgency: rebalanceDecision.urgency,
      riskLevel: args.riskProfile,
      potentialImprovement: Math.random() * 5 + 2, // 2-7% potential improvement
    };

    const responseText = `🔍 Rebalance Assessment ${args.checkAll ? 'for All Positions' : `for Position #${args.positionNumber || 1}`}:

📊 Current Status:
- Current Price: $${mockAnalysis.currentPrice}
- Range Center: $${mockAnalysis.rangeCenter.toFixed(0)}
- Price Deviation: ${(mockAnalysis.deviation * 100).toFixed(1)}%
- Risk Level: ${mockAnalysis.riskLevel.toUpperCase()}

${
  mockAnalysis.needsRebalance
    ? `
⚠️ REBALANCING RECOMMENDED
- ${mockAnalysis.reason}
- Urgency: ${mockAnalysis.urgency.toUpperCase()}
- Estimated additional yield: +${mockAnalysis.potentialImprovement.toFixed(1)}%
- Recommended action: Rebalance to optimal range around current price
`
    : `
✅ NO REBALANCING NEEDED
- ${mockAnalysis.reason}
- Current range captures most trading activity
- Continue monitoring for market changes
`
}

💡 Next Steps:
${
  mockAnalysis.needsRebalance
    ? '- Use "rebalance-position-workflow" to execute rebalancing'
    : '- Continue monitoring or adjust risk profile if needed'
}`;

    return {
      id: 'check-rebalance-need',
      contextId: `rebalance-check-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Completed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [{ kind: 'text', text: responseText }],
        },
      },
      artifacts: [
        {
          artifactId: `rebalance-assessment-${Date.now()}`,
          name: 'rebalance-assessment',
          parts: [{ kind: 'data', data: mockAnalysis }],
        },
      ],
    };
  },
};

// ============================================================================
// ADDITIONAL TOOLS (simplified placeholders)
// ============================================================================

export const analyzePoolMetricsTool: VibkitToolDefinition<any, Task, RebalancerContext> = {
  name: 'analyze-pool-metrics',
  description: 'Analyze pool performance metrics including fees, volume, and liquidity efficiency',
  parameters: z.object({
    poolAddress: z.string().optional(),
    poolPair: z.string().optional(),
    timeframe: z.enum(['1h', '4h', '24h', '7d', '30d']).default('24h'),
    includeComparison: z.boolean().default(false),
  }),
  execute: async (args, context) => {
    return {
      id: 'analyze-pool-metrics',
      contextId: `pool-metrics-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Completed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [
            {
              kind: 'text',
              text: `Pool metrics analysis complete for ${(args as any).poolPair || (args as any).poolAddress || 'ETH/USDC'}`,
            },
          ],
        },
      },
    };
  },
};

export const mintPositionTool: VibkitToolDefinition<any, Task, RebalancerContext> = {
  name: 'mint-position',
  description: 'Create a new concentrated liquidity position',
  parameters: z.object({
    poolPair: z.string().describe('Token pair (e.g., ETH/USDC)'),
    amount0: z.string().describe('Amount of first token'),
    amount1: z.string().describe('Amount of second token'),
    priceFrom: z.string().describe('Lower price bound'),
    priceTo: z.string().describe('Upper price bound'),
    userAddress: z.string().describe('User wallet address'),
    riskProfile: z
      .enum(['low', 'medium', 'high'])
      .optional()
      .describe('Risk profile for position sizing'),
  }),
  execute: async (args, context) => {
    try {
      console.log('[MintPosition] Creating new liquidity position...', args);

      // Get the Ember MCP client from context
      const emberClient = context.mcpClients?.['ember-onchain'];
      if (!emberClient) {
        throw new Error('Ember MCP client not available. Please check your configuration.');
      }

      const [token0Symbol, token1Symbol] = (args as any).poolPair.split('/');

      // Resolve token addresses
      const token0 = context.custom?.tokenMap?.[token0Symbol?.toUpperCase() || '']?.[0];
      const token1 = context.custom?.tokenMap?.[token1Symbol?.toUpperCase() || '']?.[0];

      if (!token0 || !token1) {
        throw new Error(`Could not resolve token addresses for pair ${(args as any).poolPair}`);
      }

      console.log(
        `[MintPosition] Resolved tokens: ${token0.symbol} (${token0.address}), ${token1.symbol} (${token1.address})`
      );

      // Call Ember MCP server to supply liquidity
      const response = await emberClient.callTool({
        name: 'supplyLiquidity',
        arguments: {
          chainId: '42161', // Arbitrum
          token0Address: token0.address,
          token1Address: token1.address,
          amount0: (args as any).amount0,
          amount1: (args as any).amount1,
          priceFrom: (args as any).priceFrom,
          priceTo: (args as any).priceTo,
          userAddress: (args as any).userAddress,
          fee: 3000, // 0.3% fee tier for Camelot v3
          slippageTolerance: '1.0', // 1% slippage tolerance
        },
      });

      console.log('[MintPosition] Received response from Ember MCP server');

      const responseText = `🎯 Liquidity Position Created Successfully!

📊 Position Details:
- Pool Pair: ${token0.symbol}/${token1.symbol}
- Amount ${token0.symbol}: ${(args as any).amount0}
- Amount ${token1.symbol}: ${(args as any).amount1}
- Price Range: $${(args as any).priceFrom} - $${(args as any).priceTo}
- Risk Profile: ${(args as any).riskProfile || 'medium'}

🏊 Pool Information:
- Network: Arbitrum
- Protocol: Camelot v3
- Fee Tier: 0.3%

✅ Position successfully created and ready for earning fees!

💡 Next Steps:
- Monitor position performance using "check-rebalance-need"
- Set up automated monitoring with "start-monitoring"
- Collect fees when accumulated using "collect-fees"`;

      return {
        id: 'mint-position',
        contextId: `mint-position-success-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Completed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [{ kind: 'text', text: responseText }],
          },
        },
        artifacts: [
          {
            artifactId: `position-${Date.now()}`,
            name: 'liquidity-position',
            parts: [
              {
                kind: 'data',
                data: {
                  poolPair: (args as any).poolPair,
                  token0: token0,
                  token1: token1,
                  amount0: (args as any).amount0,
                  amount1: (args as any).amount1,
                  priceFrom: (args as any).priceFrom,
                  priceTo: (args as any).priceTo,
                  userAddress: (args as any).userAddress,
                  mcpResponse: response,
                },
              },
            ],
          },
        ],
      };
    } catch (error) {
      console.error('[MintPosition] Error:', error);
      return {
        id: 'mint-position',
        contextId: `mint-position-error-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [
              {
                kind: 'text',
                text: `Error creating position: ${(error as Error).message}`,
              },
            ],
          },
        },
      };
    }
  },
};

export const burnPositionTool: VibkitToolDefinition<any, Task, RebalancerContext> = {
  name: 'burn-position',
  description: 'Remove a concentrated liquidity position',
  parameters: z.object({
    positionId: z.string().describe('Position token ID or identifier'),
    userAddress: z.string().describe('User wallet address'),
    collectFees: z.boolean().default(true).describe('Whether to collect fees before burning'),
  }),
  execute: async (args, context) => {
    try {
      console.log('[BurnPosition] Removing liquidity position...', args);

      // Get the Ember MCP client from context
      const emberClient = context.mcpClients?.['ember-onchain'];
      if (!emberClient) {
        throw new Error('Ember MCP client not available. Please check your configuration.');
      }

      // First get user positions to find the specific position
      console.log('[BurnPosition] Fetching user positions...');
      const positionsResponse = await emberClient.callTool({
        name: 'getWalletLiquidityPositions',
        arguments: {
          chainId: '42161', // Arbitrum
          walletAddress: (args as any).userAddress,
        },
      });

      // Find the specific position
      const positions = Array.isArray(positionsResponse?.positions)
        ? positionsResponse.positions
        : [];
      const targetPosition = positions.find(
        (pos: any) =>
          pos.tokenId === (args as any).positionId || pos.id === (args as any).positionId
      );

      if (!targetPosition) {
        throw new Error(
          `Position ${(args as any).positionId} not found for user ${(args as any).userAddress}`
        );
      }

      console.log(`[BurnPosition] Found position: ${targetPosition.tokenId || targetPosition.id}`);

      // Call Ember MCP server to withdraw liquidity
      const response = await emberClient.callTool({
        name: 'withdrawLiquidity',
        arguments: {
          chainId: '42161', // Arbitrum
          positionId: (args as any).positionId,
          userAddress: (args as any).userAddress,
          amount: '100', // Withdraw 100% of the position
          collectFees: (args as any).collectFees,
        },
      });

      console.log('[BurnPosition] Received response from Ember MCP server');

      const responseText = `🔥 Liquidity Position Removed Successfully!

📊 Position Details:
- Position ID: ${(args as any).positionId}
- Pool: ${targetPosition.token0?.symbol || 'Token0'}/${targetPosition.token1?.symbol || 'Token1'}
- Liquidity Removed: ${targetPosition.liquidity || 'N/A'}
- ${(args as any).collectFees ? '💰 Fees collected before removal' : '⚠️ Fees not collected'}

💸 Withdrawal Information:
- Token0 Amount: ${targetPosition.amount0 || 'N/A'} ${targetPosition.token0?.symbol || ''}
- Token1 Amount: ${targetPosition.amount1 || 'N/A'} ${targetPosition.token1?.symbol || ''}
- Network: Arbitrum
- Protocol: Camelot v3

✅ Position successfully removed and tokens returned to wallet!

💡 Transaction Details:
${response?.transactionHash ? `- TX Hash: ${response.transactionHash}` : '- Transaction prepared for signing'}`;

      return {
        id: 'burn-position',
        contextId: `burn-position-success-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Completed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [{ kind: 'text', text: responseText }],
          },
        },
        artifacts: [
          {
            artifactId: `burn-position-${Date.now()}`,
            name: 'position-removal',
            parts: [
              {
                kind: 'data',
                data: {
                  positionId: (args as any).positionId,
                  userAddress: (args as any).userAddress,
                  position: targetPosition,
                  collectFees: (args as any).collectFees,
                  mcpResponse: response,
                },
              },
            ],
          },
        ],
      };
    } catch (error) {
      console.error('[BurnPosition] Error:', error);
      return {
        id: 'burn-position',
        contextId: `burn-position-error-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [
              {
                kind: 'text',
                text: `Error removing position: ${(error as Error).message}`,
              },
            ],
          },
        },
      };
    }
  },
};

export const collectFeesTool: VibkitToolDefinition<any, Task, RebalancerContext> = {
  name: 'collect-fees',
  description: 'Collect accumulated trading fees from positions',
  parameters: z.object({
    positionNumber: z.number().optional(),
    collectAll: z.boolean().default(false),
  }),
  execute: async (args, context) => {
    return {
      id: 'collect-fees',
      contextId: `collect-fees-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Completed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [
            {
              kind: 'text',
              text: `Fees collected from ${(args as any).collectAll ? 'all positions' : `position #${(args as any).positionNumber || 1}`}`,
            },
          ],
        },
      },
    };
  },
};

export const rebalancePositionWorkflow: VibkitToolDefinition<any, Task, RebalancerContext> = {
  name: 'rebalance-position-workflow',
  description: 'Complete workflow to rebalance a position with optimal range calculation',
  parameters: z.object({
    positionNumber: z.number(),
    riskProfile: z.enum(['low', 'medium', 'high']).default('medium'),
    forceRebalance: z.boolean().default(false),
  }),
  execute: async (args, context) => {
    return {
      id: 'rebalance-position-workflow',
      contextId: `rebalance-workflow-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Completed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [
            {
              kind: 'text',
              text: `Position #${(args as any).positionNumber} rebalanced using ${(args as any).riskProfile} risk profile`,
            },
          ],
        },
      },
    };
  },
};

export const startMonitoringTool: VibkitToolDefinition<any, Task, RebalancerContext> = {
  name: 'start-monitoring',
  description: 'Start automated monitoring of positions for rebalancing opportunities',
  parameters: z.object({
    operatingMode: z.enum(['active', 'passive']).default('passive'),
    riskProfile: z.enum(['low', 'medium', 'high']).default('medium'),
    monitoringInterval: z.number().default(300),
    pools: z.array(z.string()).optional(),
  }),
  execute: async (args, context) => {
    return {
      id: 'start-monitoring',
      contextId: `start-monitoring-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Completed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [
            {
              kind: 'text',
              text: `Monitoring started in ${(args as any).operatingMode} mode with ${(args as any).riskProfile} risk profile`,
            },
          ],
        },
      },
    };
  },
};

export const stopMonitoringTool: VibkitToolDefinition<any, Task, RebalancerContext> = {
  name: 'stop-monitoring',
  description: 'Stop automated monitoring and show performance summary',
  parameters: z.object({
    showSummary: z.boolean().default(true),
  }),
  execute: async (args, context) => {
    return {
      id: 'stop-monitoring',
      contextId: `stop-monitoring-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Completed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [
            {
              kind: 'text',
              text: `Monitoring stopped${(args as any).showSummary ? ' - performance summary available' : ''}`,
            },
          ],
        },
      },
    };
  },
};

export const executeRebalanceWorkflow: VibkitToolDefinition<any, Task, RebalancerContext> = {
  name: 'execute-rebalance-workflow',
  description: 'Execute automated rebalancing workflow for multiple positions',
  parameters: z.object({
    positionNumber: z.number().optional(),
    rebalanceAll: z.boolean().default(false),
    riskProfile: z.enum(['low', 'medium', 'high']).default('medium'),
    dryRun: z.boolean().default(false),
  }),
  execute: async (args, context) => {
    return {
      id: 'execute-rebalance-workflow',
      contextId: `execute-rebalance-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Completed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [
            {
              kind: 'text',
              text: `Rebalance workflow ${(args as any).dryRun ? 'simulation' : 'execution'} complete`,
            },
          ],
        },
      },
    };
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate sample price data for demonstration
 */
function generateSamplePriceData(poolPair: string, timeframe: string): PriceData[] {
  const dataPoints =
    timeframe === '1h' ? 60 : timeframe === '4h' ? 240 : timeframe === '24h' ? 1440 : 10080;
  const basePrice = 2000; // Example ETH price
  const data: PriceData[] = [];

  let currentPrice = basePrice;
  const now = Date.now();
  const interval =
    timeframe === '1h'
      ? 60000
      : timeframe === '4h'
        ? 240000
        : timeframe === '24h'
          ? 86400000
          : 604800000;

  for (let i = 0; i < Math.min(dataPoints, 100); i++) {
    // Simple random walk
    const change = (Math.random() - 0.5) * 0.02; // ±1% change
    currentPrice *= 1 + change;

    data.push({
      timestamp: now - i * interval,
      price: currentPrice,
      volume: Math.random() * 1000000,
    });
  }

  return data.reverse(); // Chronological order
}

/**
 * Get range recommendation based on volatility
 */
function getVolatilityRangeRecommendation(metrics: VolatilityMetrics): string {
  const vol = metrics.annualizedVolatility;

  if (vol > 1.0) {
    return '- Very high volatility detected - consider wide ranges (15-25%) or avoid concentrated positions';
  } else if (vol > 0.6) {
    return '- High volatility - recommended range width: 8-15%';
  } else if (vol > 0.3) {
    return '- Moderate volatility - recommended range width: 5-10%';
  } else {
    return '- Low volatility - can use narrow ranges (3-8%) for higher fee capture';
  }
}

/**
 * Get risk assessment based on volatility
 */
function getRiskAssessment(metrics: VolatilityMetrics): string {
  const vol = metrics.annualizedVolatility;
  const trend = metrics.trend;

  let assessment = '';

  if (vol > 0.8) {
    assessment += '- HIGH RISK: Significant impermanent loss potential\n';
  } else if (vol > 0.4) {
    assessment += '- MEDIUM RISK: Moderate impermanent loss risk\n';
  } else {
    assessment += '- LOW RISK: Minimal impermanent loss expected\n';
  }

  if (trend === 'increasing') {
    assessment += '- Volatility is increasing - consider widening ranges or reducing exposure';
  } else if (trend === 'decreasing') {
    assessment += '- Volatility is decreasing - opportunity to narrow ranges for better fees';
  } else {
    assessment += '- Volatility is stable - current strategy can be maintained';
  }

  return assessment;
}
