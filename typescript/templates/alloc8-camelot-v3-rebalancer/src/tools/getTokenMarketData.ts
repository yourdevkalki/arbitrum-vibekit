import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { Task, Message } from '@google-a2a/types';
import type { RebalancerContext } from '../context/types.js';
import type { TokenMarketData } from '../config/types.js';

const getTokenMarketDataParametersSchema = z.object({
  tokens: z.array(z.string()).describe('Array of token symbols to get market data for'),
  includeVolatility: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to include volatility calculations'),
});

type GetTokenMarketDataParams = z.infer<typeof getTokenMarketDataParametersSchema>;

/**
 * Get token market data including prices, volume, and volatility
 */
export const getTokenMarketDataTool: VibkitToolDefinition<
  typeof getTokenMarketDataParametersSchema,
  Task | Message,
  RebalancerContext
> = {
  name: 'getTokenMarketData',
  description:
    'Retrieve live market data for tokens including price, volume, market cap, and volatility metrics',
  parameters: getTokenMarketDataParametersSchema,

  execute: async (params: GetTokenMarketDataParams, context: any) => {
    try {
      console.log(`🔍 Getting market data for tokens: ${params.tokens.join(', ')}`);

      // Call Ember MCP server to get token market data
      const response = await context.mcpClients['ember-onchain'].request(
        {
          method: 'tools/call',
          params: {
            name: 'getTokenMarketData',
            arguments: {
              tokens: params.tokens,
              includeVolatility: params.includeVolatility,
              chain: 'arbitrum',
            },
          },
        },
        {}
      );

      if (!response.result || !response.result.content) {
        throw new Error('No response from MCP server');
      }

      const marketData: TokenMarketData[] = JSON.parse(response.result.content[0].text);

      console.log('✅ Retrieved market data:');
      marketData.forEach(data => {
        console.log(
          `   ${data.symbol}: $${data.price.toFixed(6)} (${data.priceChange24h > 0 ? '+' : ''}${data.priceChange24h.toFixed(2)}%)`
        );
        console.log(`     Volume 24h: $${data.volume24h.toLocaleString()}`);
        console.log(`     Volatility: ${(data.volatility * 100).toFixed(2)}%`);
      });

      return createSuccessTask(
        'getTokenMarketData',
        [
          {
            artifactId: 'getTokenMarketData-' + Date.now(),
            parts: [{ kind: 'text', text: JSON.stringify(marketData) }],
          },
        ],
        'Operation completed successfully'
      );
    } catch (error) {
      console.error('❌ Error getting token market data:', error);
      return createErrorTask(
        'getTokenMarketData',
        error instanceof Error ? error : new Error('Failed to get market data: ${error}')
      );
    }
  },
};
