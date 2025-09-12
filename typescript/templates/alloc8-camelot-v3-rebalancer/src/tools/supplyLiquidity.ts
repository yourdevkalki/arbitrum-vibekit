import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { Task, Message } from '@google-a2a/types';
import type { RebalancerContext } from '../context/types.js';
import type { TransactionResult } from '../config/types.js';

const supplyLiquidityParametersSchema = z.object({
  poolAddress: z.string().describe('Pool address to supply liquidity to'),
  tickLower: z.number().describe('Lower tick of the position range'),
  tickUpper: z.number().describe('Upper tick of the position range'),
  amount0Desired: z.string().describe('Desired amount of token0 to supply'),
  amount1Desired: z.string().describe('Desired amount of token1 to supply'),
  amount0Min: z.string().optional().describe('Minimum amount of token0 (slippage protection)'),
  amount1Min: z.string().optional().describe('Minimum amount of token1 (slippage protection)'),
  deadline: z.number().optional().describe('Transaction deadline timestamp'),
});

type SupplyLiquidityParams = z.infer<typeof supplyLiquidityParametersSchema>;

/**
 * Supply liquidity to a Camelot v3 pool
 */
export const supplyLiquidityTool: VibkitToolDefinition<
  typeof supplyLiquidityParametersSchema,
  Task | Message,
  RebalancerContext
> = {
  name: 'supplyLiquidity',
  description:
    'Supply liquidity to a Camelot v3 concentrated liquidity pool within specified price range',
  parameters: supplyLiquidityParametersSchema,

  execute: async (params: SupplyLiquidityParams, context: any) => {
    try {
      console.log(`🔄 Supplying liquidity to pool: ${params.poolAddress}`);
      console.log(`   Range: tick ${params.tickLower} to ${params.tickUpper}`);
      console.log(`   Amounts: ${params.amount0Desired} / ${params.amount1Desired}`);

      // Calculate default slippage protection if not provided
      const amount0Min =
        params.amount0Min || ((BigInt(params.amount0Desired) * 95n) / 100n).toString();
      const amount1Min =
        params.amount1Min || ((BigInt(params.amount1Desired) * 95n) / 100n).toString();
      const deadline = params.deadline || Math.floor(Date.now() / 1000) + 1200; // 20 minutes

      // Call Ember MCP server to supply liquidity
      const response = await context.mcpClients['ember-onchain'].request(
        {
          method: 'tools/call',
          params: {
            name: 'supplyLiquidity',
            arguments: {
              poolAddress: params.poolAddress,
              tickLower: params.tickLower,
              tickUpper: params.tickUpper,
              amount0Desired: params.amount0Desired,
              amount1Desired: params.amount1Desired,
              amount0Min,
              amount1Min,
              deadline,
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
        console.log(`✅ Liquidity supplied successfully`);
        console.log(`   Transaction: ${result.transactionHash}`);
        console.log(`   Gas used: ${result.gasUsed}`);
      } else {
        console.error(`❌ Liquidity supply failed: ${result.error}`);
      }

      return createSuccessTask(
        'supplyLiquidity',
        [
          {
            artifactId: 'supplyLiquidity-' + Date.now(),
            parts: [{ kind: 'text', text: JSON.stringify(result) }],
          },
        ],
        'Operation completed successfully'
      );
    } catch (error) {
      console.error('❌ Error supplying liquidity:', error);
      return createErrorTask(
        'supplyLiquidity',
        error instanceof Error ? error : new Error('Failed to supply liquidity: ${error}')
      );
    }
  },
};
