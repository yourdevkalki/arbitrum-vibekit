import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { Task, Message } from '@google-a2a/types';
import type { RebalancerContext } from '../context/types.js';
import type { TransactionResult } from '../config/types.js';

const withdrawLiquidityParametersSchema = z.object({
  positionId: z.string().describe('Position ID to withdraw liquidity from'),
  amount: z.string().optional().describe('Amount of liquidity to withdraw (default: all)'),
  collectFees: z.boolean().optional().default(true).describe('Whether to collect accumulated fees'),
});

type WithdrawLiquidityParams = z.infer<typeof withdrawLiquidityParametersSchema>;

/**
 * Withdraw liquidity from a Camelot v3 position
 */
export const withdrawLiquidityTool: VibkitToolDefinition<
  typeof withdrawLiquidityParametersSchema,
  Task | Message,
  RebalancerContext
> = {
  name: 'withdrawLiquidity',
  description: 'Withdraw liquidity from a Camelot v3 concentrated liquidity position',
  parameters: withdrawLiquidityParametersSchema,

  execute: async (params: WithdrawLiquidityParams, context: any) => {
    try {
      console.log(`🔄 Withdrawing liquidity from position: ${params.positionId}`);

      // Call Ember MCP server to withdraw liquidity
      const response = await context.mcpClients['ember-onchain'].request(
        {
          method: 'tools/call',
          params: {
            name: 'withdrawLiquidity',
            arguments: {
              positionId: params.positionId,
              amount: params.amount,
              collectFees: params.collectFees,
              protocol: 'camelot-v3',
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
        console.log(`✅ Liquidity withdrawn successfully`);
        console.log(`   Transaction: ${result.transactionHash}`);
        console.log(`   Gas used: ${result.gasUsed}`);
      } else {
        console.error(`❌ Liquidity withdrawal failed: ${result.error}`);
      }

      return createSuccessTask(
        'withdrawLiquidity',
        [
          {
            artifactId: 'withdrawLiquidity-' + Date.now(),
            parts: [{ kind: 'text', text: JSON.stringify(result) }],
          },
        ],
        'Operation completed successfully'
      );
    } catch (error) {
      console.error('❌ Error withdrawing liquidity:', error);
      return createErrorTask(
        'withdrawLiquidity',
        error instanceof Error ? error : new Error('Failed to withdraw liquidity: ${error}')
      );
    }
  },
};
