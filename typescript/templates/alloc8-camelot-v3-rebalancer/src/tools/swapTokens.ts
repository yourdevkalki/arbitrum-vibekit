import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { Task, Message } from '@google-a2a/types';
import type { RebalancerContext } from '../context/types.js';
import type { TransactionResult } from '../config/types.js';

const swapTokensParametersSchema = z.object({
  tokenIn: z.string().describe('Token to swap from (symbol or address)'),
  tokenOut: z.string().describe('Token to swap to (symbol or address)'),
  amountIn: z.string().describe('Amount of input token to swap'),
  amountOutMinimum: z
    .string()
    .optional()
    .describe('Minimum amount of output token (slippage protection)'),
  deadline: z.number().optional().describe('Transaction deadline timestamp'),
});

type SwapTokensParams = z.infer<typeof swapTokensParametersSchema>;

/**
 * Swap tokens on Camelot DEX
 */
export const swapTokensTool: VibkitToolDefinition<
  typeof swapTokensParametersSchema,
  Task | Message,
  RebalancerContext
> = {
  name: 'swapTokens',
  description: 'Swap tokens on Camelot DEX with slippage protection',
  parameters: swapTokensParametersSchema,

  execute: async (params: SwapTokensParams, context: any) => {
    try {
      console.log(`🔄 Swapping ${params.amountIn} ${params.tokenIn} for ${params.tokenOut}`);

      // Calculate default deadline if not provided
      const deadline = params.deadline || Math.floor(Date.now() / 1000) + 1200; // 20 minutes

      // Call Ember MCP server to swap tokens
      const response = await context.mcpClients['ember-onchain'].request(
        {
          method: 'tools/call',
          params: {
            name: 'swapTokens',
            arguments: {
              tokenIn: params.tokenIn,
              tokenOut: params.tokenOut,
              amountIn: params.amountIn,
              amountOutMinimum: params.amountOutMinimum,
              deadline,
              protocol: 'camelot',
              privateKey: context.config.walletPrivateKey,
            },
          },
        },
        {}
      );

      if (!response.result || !response.result.content) {
        throw new Error('No response from MCP server');
      }

      const result: TransactionResult = JSON.parse(response.result.content[0].text);

      if (result.success) {
        console.log(`✅ Token swap completed successfully`);
        console.log(`   Transaction: ${result.transactionHash}`);
        console.log(`   Gas used: ${result.gasUsed}`);
      } else {
        console.error(`❌ Token swap failed: ${result.error}`);
      }

      return createSuccessTask(
        'swapTokens',
        [
          {
            artifactId: 'swapTokens-' + Date.now(),
            parts: [{ kind: 'text', text: JSON.stringify(result) }],
          },
        ],
        'Operation completed successfully'
      );
    } catch (error) {
      console.error('❌ Error swapping tokens:', error);
      return createErrorTask(
        'swapTokens',
        error instanceof Error ? error : new Error('Failed to swap tokens: ${error}')
      );
    }
  },
};
