import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { Task, Message } from '@google-a2a/types';
import type { RebalancerContext } from '../context/types.js';

const getWalletBalancesParametersSchema = z.object({
  walletAddress: z.string().describe('Wallet address to check balances for'),
  tokens: z
    .array(z.string())
    .optional()
    .describe('Specific tokens to check (symbols or addresses)'),
});

type GetWalletBalancesParams = z.infer<typeof getWalletBalancesParametersSchema>;

interface TokenBalance {
  symbol: string;
  address: string;
  balance: string;
  balanceFormatted: string;
  decimals: number;
  usdValue: number;
}

/**
 * Get wallet token balances
 */
export const getWalletBalancesTool: VibkitToolDefinition<
  typeof getWalletBalancesParametersSchema,
  Task | Message,
  RebalancerContext
> = {
  name: 'getWalletBalances',
  description: 'Get token balances for a wallet address',
  parameters: getWalletBalancesParametersSchema,

  execute: async (params: GetWalletBalancesParams, context: any) => {
    try {
      console.log(`🔍 Getting wallet balances for: ${params.walletAddress}`);

      // Call Ember MCP server to get wallet balances
      const response = await context.mcpClients['ember-onchain'].request(
        {
          method: 'tools/call',
          params: {
            name: 'getWalletBalances',
            arguments: {
              walletAddress: params.walletAddress,
              tokens: params.tokens,
              chain: 'arbitrum',
            },
          },
        },
        {}
      );

      if (!response.result || !response.result.content) {
        throw new Error('No response from MCP server');
      }

      const balances: TokenBalance[] = JSON.parse(response.result.content[0].text);

      console.log('✅ Retrieved wallet balances:');
      balances.forEach(balance => {
        console.log(
          `   ${balance.symbol}: ${balance.balanceFormatted} ($${balance.usdValue.toFixed(2)})`
        );
      });

      return createSuccessTask(
        'getWalletBalances',
        [
          {
            artifactId: 'getWalletBalances-' + Date.now(),
            parts: [{ kind: 'text', text: JSON.stringify(balances) }],
          },
        ],
        'Operation completed successfully'
      );
    } catch (error) {
      console.error('❌ Error getting wallet balances:', error);
      return createErrorTask(
        'getWalletBalances',
        error instanceof Error ? error : new Error('Failed to get wallet balances: ${error}')
      );
    }
  },
};
