/**
 * Active Mode Task - Monitors positions and executes rebalances automatically
 */

import { BaseRebalanceTask } from './BaseRebalanceTask.js';
import { z } from 'zod';
import { getWalletAddressFromPrivateKey } from '../utils/walletUtils.js';
import type { RebalancerContext } from '../context/types.js';
import type { TransactionResult } from '../config/types.js';

export class ActiveModeTask extends BaseRebalanceTask {
  constructor(context: RebalancerContext) {
    super(context);
  }

  public getTaskName(): string {
    return 'ActiveModeTask';
  }

  protected async run(): Promise<void> {
    const evaluation = await this.fetchAndEvaluate();

    if (!evaluation) {
      console.log('ℹ️  No positions to evaluate');
      return;
    }

    if (evaluation.needsRebalance) {
      console.log('🔄 Rebalance needed, executing automatically...');
      await this.executeRebalance(evaluation);
    } else {
      console.log('✅ Position is healthy, no rebalance needed');
    }
  }

  /**
   * Execute automatic rebalance
   */
  private async executeRebalance(evaluation: any): Promise<void> {
    try {
      const positionId = this.context.monitoringState.currentPositions[0];

      if (!positionId) {
        throw new Error('No position ID available for rebalancing');
      }

      // Step 1: Withdraw current liquidity
      console.log('🔄 Step 1: Withdrawing current liquidity...');
      const withdrawResult = await this.withdrawLiquidity(positionId);

      if (!withdrawResult.success) {
        throw new Error(`Liquidity withdrawal failed: ${withdrawResult.error}`);
      }

      console.log('✅ Liquidity withdrawn successfully');

      // Step 2: Check if token swap is needed (simplified logic)
      const needsSwap = await this.checkIfSwapNeeded();

      if (needsSwap) {
        console.log('🔄 Step 2: Rebalancing token ratio...');
        await this.rebalanceTokenRatio();
      } else {
        console.log('✅ Token ratio is balanced, skipping swap');
      }

      // Step 3: Supply liquidity at new range
      console.log('🔄 Step 3: Supplying liquidity at new range...');
      const supplyResult = await this.supplyLiquidityAtNewRange(evaluation);

      if (!supplyResult.success) {
        throw new Error(`Liquidity supply failed: ${supplyResult.error}`);
      }

      console.log('✅ Rebalance completed successfully!');

      // Send success notification
      await this.sendRebalanceConfirmation(evaluation, supplyResult.transactionHash!);
    } catch (error) {
      console.error('❌ Rebalance execution failed:', error);
      await this.sendRebalanceFailure(error as Error);
      throw error;
    }
  }

  /**
   * Withdraw liquidity from current position
   */
  private async withdrawLiquidity(positionId: string): Promise<TransactionResult> {
    const response = await this.context.mcpClients['ember-onchain']!.request(
      {
        method: 'tools/call',
        params: {
          name: 'withdrawLiquidity',
          arguments: {
            positionId,
            collectFees: true,
          },
        },
      },
      z.any()
    );

    if (!(response as any).result?.content) {
      throw new Error('No response from withdraw liquidity');
    }

    return JSON.parse((response as any).result.content[0].text);
  }

  /**
   * Check if token swap is needed for optimal ratio
   */
  private async checkIfSwapNeeded(): Promise<boolean> {
    // Simplified check - in real implementation, calculate optimal token ratio
    // based on new range and current balances
    return Math.random() > 0.7; // 30% chance of needing swap for demo
  }

  /**
   * Rebalance token ratio via swap
   */
  private async rebalanceTokenRatio(): Promise<void> {
    // Get wallet balances
    const walletAddress = getWalletAddressFromPrivateKey(this.context.config.walletPrivateKey);

    const balancesResponse = await this.context.mcpClients['ember-onchain']!.request(
      {
        method: 'tools/call',
        params: {
          name: 'getWalletBalances',
          arguments: {
            walletAddress,
            tokens: [this.context.config.token0, this.context.config.token1],
          },
        },
      },
      z.any()
    );

    if (!(balancesResponse as any).result?.content) {
      throw new Error('Failed to get wallet balances');
    }

    const balances = JSON.parse((balancesResponse as any).result.content[0].text);

    // Simplified swap logic - swap 10% of larger balance
    const token0Balance = balances.find((b: any) => b.symbol === this.context.config.token0);
    const token1Balance = balances.find((b: any) => b.symbol === this.context.config.token1);

    if (token0Balance.usdValue > token1Balance.usdValue) {
      // Swap some token0 for token1
      const swapAmount = (parseFloat(token0Balance.balanceFormatted) * 0.1).toString();

      const swapResponse = await this.context.mcpClients['ember-onchain']!.request(
        {
          method: 'tools/call',
          params: {
            name: 'swapTokens',
            arguments: {
              tokenIn: this.context.config.token0,
              tokenOut: this.context.config.token1,
              amountIn: swapAmount,
            },
          },
        },
        z.any()
      );

      if (!(swapResponse as any).result?.content) {
        throw new Error('Token swap failed');
      }

      const swapResult = JSON.parse((swapResponse as any).result.content[0].text);
      if (!swapResult.success) {
        throw new Error(`Token swap failed: ${swapResult.error}`);
      }
    }
  }

  /**
   * Supply liquidity at the new optimal range
   */
  private async supplyLiquidityAtNewRange(evaluation: any): Promise<TransactionResult> {
    // Get current wallet balances to determine amounts
    const walletAddress = getWalletAddressFromPrivateKey(this.context.config.walletPrivateKey);

    const balancesResponse = await this.context.mcpClients['ember-onchain']!.request(
      {
        method: 'tools/call',
        params: {
          name: 'getWalletBalances',
          arguments: {
            walletAddress,
            tokens: [this.context.config.token0, this.context.config.token1],
          },
        },
      },
      z.any()
    );

    if (!(balancesResponse as any).result?.content) {
      throw new Error('Failed to get wallet balances');
    }

    const balances = JSON.parse((balancesResponse as any).result.content[0].text);
    const token0Balance = balances.find((b: any) => b.symbol === this.context.config.token0);
    const token1Balance = balances.find((b: any) => b.symbol === this.context.config.token1);

    // Use 95% of available balances (keep 5% for gas and slippage)
    const amount0Desired = (parseFloat(token0Balance.balance) * 0.95).toString();
    const amount1Desired = (parseFloat(token1Balance.balance) * 0.95).toString();

    const response = await this.context.mcpClients['ember-onchain']!.request(
      {
        method: 'tools/call',
        params: {
          name: 'supplyLiquidity',
          arguments: {
            poolAddress: this.context.config.poolId,
            tickLower: evaluation.suggestedRange.tickLower,
            tickUpper: evaluation.suggestedRange.tickUpper,
            amount0Desired,
            amount1Desired,
          },
        },
      },
      z.any()
    );

    if (!(response as any).result?.content) {
      throw new Error('No response from supply liquidity');
    }

    return JSON.parse((response as any).result.content[0].text);
  }

  /**
   * Send rebalance confirmation via Telegram
   */
  private async sendRebalanceConfirmation(evaluation: any, txHash: string): Promise<void> {
    if (!this.context.telegramBot || !this.context.config.telegramChatId) {
      console.log('✅ REBALANCE COMPLETED:');
      console.log(`   Transaction: ${txHash}`);
      console.log(
        `   New range: $${evaluation.suggestedRange.priceRange[0].toFixed(6)} - $${evaluation.suggestedRange.priceRange[1].toFixed(6)}`
      );
      return;
    }

    try {
      const message = `✅ *Rebalance Completed*
      
📊 *Pool:* ${this.context.config.token0}/${this.context.config.token1}
⏰ *Time:* ${new Date().toLocaleString()}
🔄 *Mode:* Active (Auto-executed)

🎯 *New Range:*
$${evaluation.suggestedRange.priceRange[0].toFixed(6)} - $${evaluation.suggestedRange.priceRange[1].toFixed(6)}

📈 *Expected Benefits:*
• APR improvement: +${evaluation.estimatedAprImprovement.toFixed(2)}%
• Risk level: ${evaluation.riskAssessment}

🔗 *Transaction:* \`${txHash}\`

✅ Your position has been automatically rebalanced for optimal returns!`;

      await this.context.telegramBot.sendMessage(this.context.config.telegramChatId, message, {
        parse_mode: 'Markdown',
      });

      console.log('✅ Rebalance confirmation sent via Telegram');
    } catch (error) {
      console.error('❌ Failed to send Telegram confirmation:', error);
    }
  }

  /**
   * Send rebalance failure notification
   */
  private async sendRebalanceFailure(error: Error): Promise<void> {
    if (!this.context.telegramBot || !this.context.config.telegramChatId) {
      return;
    }

    try {
      const message = `❌ *Rebalance Failed*
      
📊 *Pool:* ${this.context.config.token0}/${this.context.config.token1}
⏰ *Time:* ${new Date().toLocaleString()}
🔄 *Mode:* Active

⚠️ *Error:* ${error.message}

🔧 Please check the agent logs and wallet configuration.
💡 The monitoring will continue and retry on the next cycle.`;

      await this.context.telegramBot.sendMessage(this.context.config.telegramChatId, message, {
        parse_mode: 'Markdown',
      });
    } catch (telegramError) {
      console.error('❌ Failed to send failure notification via Telegram:', telegramError);
    }
  }

  protected async handleError(error: Error): Promise<void> {
    console.error('❌ ActiveModeTask error:', error.message);
    await this.sendRebalanceFailure(error);
  }
}
