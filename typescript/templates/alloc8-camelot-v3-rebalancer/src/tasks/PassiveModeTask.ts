/**
 * Passive Mode Task - Monitors positions and sends alerts via Telegram
 */

import { BaseRebalanceTask } from './BaseRebalanceTask.js';
import type { RebalancerContext } from '../context/types.js';

export class PassiveModeTask extends BaseRebalanceTask {
  constructor(context: RebalancerContext) {
    super(context);
  }

  public getTaskName(): string {
    return 'PassiveModeTask';
  }

  protected async run(): Promise<void> {
    const evaluation = await this.fetchAndEvaluate();

    if (!evaluation) {
      console.log('ℹ️  No positions to evaluate');
      return;
    }

    if (evaluation.needsRebalance) {
      await this.sendRebalanceAlert(evaluation);
    } else {
      console.log('✅ Position is healthy, no rebalance needed');
    }
  }

  /**
   * Send rebalance alert via Telegram
   */
  private async sendRebalanceAlert(evaluation: any): Promise<void> {
    if (!this.context.telegramBot || !this.context.config.telegramChatId) {
      console.log('⚠️  Telegram not configured, logging alert instead:');
      console.log('🚨 REBALANCE ALERT:');
      console.log(`   Pool: ${this.context.config.token0}/${this.context.config.token1}`);
      console.log(`   Reason: ${evaluation.reason}`);
      console.log(
        `   Current range: $${evaluation.currentRange.priceRange[0].toFixed(6)} - $${evaluation.currentRange.priceRange[1].toFixed(6)}`
      );
      console.log(
        `   Suggested range: $${evaluation.suggestedRange.priceRange[0].toFixed(6)} - $${evaluation.suggestedRange.priceRange[1].toFixed(6)}`
      );
      console.log(`   Est. APR improvement: +${evaluation.estimatedAprImprovement.toFixed(2)}%`);
      console.log(`   Est. gas cost: $${evaluation.estimatedGasCost}`);
      return;
    }

    try {
      const message = this.formatTelegramMessage(evaluation);

      await this.context.telegramBot.sendMessage(this.context.config.telegramChatId!, message, {
        parse_mode: 'Markdown',
      });

      console.log('✅ Rebalance alert sent via Telegram');
    } catch (error) {
      console.error('❌ Failed to send Telegram alert:', error);
      // Fallback to console logging
      console.log('🚨 REBALANCE ALERT (Telegram failed):');
      console.log(`   Pool: ${this.context.config.token0}/${this.context.config.token1}`);
      console.log(`   Reason: ${evaluation.reason}`);
    }
  }

  /**
   * Format message for Telegram
   */
  private formatTelegramMessage(evaluation: any): string {
    const timestamp = new Date().toLocaleString();

    return `🚨 *LP Rebalance Alert*
    
📊 *Pool:* ${this.context.config.token0}/${this.context.config.token1}
⏰ *Time:* ${timestamp}
🔍 *Mode:* Passive (Alert Only)

⚠️ *Reason:* ${evaluation.reason}

📈 *Current Range:*
$${evaluation.currentRange.priceRange[0].toFixed(6)} - $${evaluation.currentRange.priceRange[1].toFixed(6)}

🎯 *Suggested Range:*
$${evaluation.suggestedRange.priceRange[0].toFixed(6)} - $${evaluation.suggestedRange.priceRange[1].toFixed(6)}

💰 *Expected Benefits:*
• APR improvement: +${evaluation.estimatedAprImprovement.toFixed(2)}%
• Gas cost: ~$${evaluation.estimatedGasCost}
• Risk level: ${evaluation.riskAssessment}

💡 *Next Steps:*
Consider rebalancing your position to the suggested range for optimal returns.`;
  }

  protected async handleError(error: Error): Promise<void> {
    console.error('❌ PassiveModeTask error:', error.message);

    // Send error notification if Telegram is configured
    if (this.context.telegramBot && this.context.config.telegramChatId) {
      try {
        const errorMessage = `🚨 *Rebalancer Error*
        
⚠️ The LP rebalancing monitor encountered an error:
\`${error.message}\`

🔧 Please check the agent logs and configuration.
⏰ Time: ${new Date().toLocaleString()}`;

        await this.context.telegramBot.sendMessage(
          this.context.config.telegramChatId,
          errorMessage,
          { parse_mode: 'Markdown' }
        );
      } catch (telegramError) {
        console.error('❌ Failed to send error notification via Telegram:', telegramError);
      }
    }
  }
}
