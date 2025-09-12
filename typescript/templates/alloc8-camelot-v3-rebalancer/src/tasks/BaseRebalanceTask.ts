/**
 * Base class for rebalancing tasks
 */

import { z } from 'zod';
import type { Task, TaskStatus } from '@google-a2a/types';
import { TaskState } from '@google-a2a/types';
import { nanoid } from 'nanoid';
import { getWalletAddressFromPrivateKey } from '../utils/walletUtils.js';
import type { RebalancerContext } from '../context/types.js';
import type {
  RebalanceEvaluation,
  PoolPosition,
  PoolState,
  TokenMarketData,
} from '../config/types.js';
import { evaluateRebalanceNeed } from '../strategy/rangeCalculator.js';

export abstract class BaseRebalanceTask {
  public readonly id: string;
  public readonly contextId: string;
  protected context: RebalancerContext;
  protected isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(context: RebalancerContext) {
    this.id = nanoid();
    this.contextId = nanoid();
    this.context = context;
  }

  /**
   * Abstract method to get the task name
   */
  public abstract getTaskName(): string;

  /**
   * Start the task with periodic execution
   */
  public start(): void {
    if (this.isRunning) {
      console.log('⚠️  Task already running');
      return;
    }

    this.isRunning = true;
    this.context.monitoringState.isActive = true;
    this.context.monitoringState.taskId = this.id;

    console.log(`🚀 Starting ${this.getTaskName()} (ID: ${this.id})`);
    console.log(`   Check interval: ${this.context.config.checkInterval / 1000}s`);

    // Run immediately
    this.executeTask();

    // Schedule periodic execution
    this.intervalId = setInterval(() => {
      this.executeTask();
    }, this.context.config.checkInterval);
  }

  /**
   * Stop the task
   */
  public stop(): void {
    if (!this.isRunning) {
      console.log('⚠️  Task not running');
      return;
    }

    this.isRunning = false;
    this.context.monitoringState.isActive = false;
    this.context.monitoringState.taskId = null;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log(`🛑 Stopped ${this.getTaskName()}`);
  }

  /**
   * Get task status
   */
  public getStatus(): TaskStatus {
    return {
      state: this.isRunning ? TaskState.Working : TaskState.Completed,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Create A2A Task object
   */
  public toTask(): Task {
    return {
      id: this.id,
      contextId: this.contextId,
      status: this.getStatus(),
      kind: 'task',
      history: [],
      artifacts: [],
      metadata: {
        taskType: this.getTaskName(),
        config: this.context.config,
        monitoringState: this.context.monitoringState,
      },
    };
  }

  /**
   * Execute the task logic
   */
  private async executeTask(): Promise<void> {
    try {
      console.log(`🔄 Executing ${this.getTaskName()} check...`);
      this.context.monitoringState.lastCheck = new Date();

      await this.run();
    } catch (error) {
      console.error(`❌ Error in ${this.getTaskName()}:`, error);
      await this.handleError(error as Error);
    }
  }

  /**
   * Fetch and evaluate current positions
   */
  protected async fetchAndEvaluate(): Promise<RebalanceEvaluation | null> {
    try {
      // Get wallet address from private key
      const walletAddress = getWalletAddressFromPrivateKey(this.context.config.walletPrivateKey);

      console.log(`🔍 Fetching positions for wallet: ${walletAddress}`);
      console.log(`🔍 Pool address: ${this.context.config.poolId}`);

      // Fetch current positions
      const positionsResponse = await this.context.mcpClients['ember-onchain']!.request(
        {
          method: 'tools/call',
          params: {
            name: 'getWalletLiquidityPositions',
            arguments: {
              walletAddress,
              poolAddress: this.context.config.poolId,
              protocol: 'camelot-v3', // Add missing protocol parameter
            },
          },
        },
        z.any()
      );

      console.log('🔍 MCP Response:', JSON.stringify(positionsResponse, null, 2));

      if (!(positionsResponse as any).result?.content) {
        console.error('❌ Invalid response structure:', positionsResponse);
        throw new Error('No positions data received');
      }

      const positions: PoolPosition[] = JSON.parse(
        (positionsResponse as any).result.content[0].text
      );

      if (positions.length === 0) {
        console.log('ℹ️  No positions found for monitoring');
        return null;
      }

      // Get pool data
      const poolResponse = await this.context.mcpClients['ember-onchain']!.request(
        {
          method: 'tools/call',
          params: {
            name: 'getLiquidityPools',
            arguments: {
              poolAddress: this.context.config.poolId,
            },
          },
        },
        z.any()
      );

      if (!(poolResponse as any).result?.content) {
        throw new Error('No pool data received');
      }

      const pools: PoolState[] = JSON.parse((poolResponse as any).result.content[0].text);
      const poolState = pools[0];

      if (!poolState) {
        throw new Error('Pool not found');
      }

      // Get token market data
      const marketDataResponse = await this.context.mcpClients['ember-onchain']!.request(
        {
          method: 'tools/call',
          params: {
            name: 'getTokenMarketData',
            arguments: {
              tokens: [this.context.config.token0, this.context.config.token1],
            },
          },
        },
        z.any()
      );

      if (!(marketDataResponse as any).result?.content) {
        throw new Error('No market data received');
      }

      const marketData: TokenMarketData[] = JSON.parse(
        (marketDataResponse as any).result.content[0].text
      );
      const token0Data = marketData.find(t => t.symbol === this.context.config.token0);
      const token1Data = marketData.find(t => t.symbol === this.context.config.token1);

      if (!token0Data || !token1Data) {
        throw new Error('Token market data not found');
      }

      // Evaluate first position (simplified - could handle multiple positions)
      const position = positions[0];
      this.context.monitoringState.currentPositions = position ? [position.positionId] : [];

      if (!position) {
        console.log('⚠️  No positions found to evaluate');
        return null;
      }

      const evaluation = evaluateRebalanceNeed(
        position,
        poolState,
        token0Data,
        token1Data,
        this.context.config.riskProfile
      );

      console.log(`📊 Position evaluation:`);
      console.log(`   Needs rebalance: ${evaluation.needsRebalance ? '✅ YES' : '❌ NO'}`);
      console.log(`   Reason: ${evaluation.reason}`);
      console.log(
        `   Current range: $${evaluation.currentRange.priceRange[0].toFixed(6)} - $${evaluation.currentRange.priceRange[1].toFixed(6)}`
      );

      if (evaluation.needsRebalance) {
        console.log(
          `   Suggested range: $${evaluation.suggestedRange.priceRange[0].toFixed(6)} - $${evaluation.suggestedRange.priceRange[1].toFixed(6)}`
        );
        console.log(`   APR improvement: +${evaluation.estimatedAprImprovement.toFixed(2)}%`);
      }

      return evaluation;
    } catch (error) {
      console.error('❌ Error in fetchAndEvaluate:', error);
      throw error;
    }
  }

  /**
   * Abstract methods to be implemented by subclasses
   */
  protected abstract run(): Promise<void>;
  protected abstract handleError(error: Error): Promise<void>;
}
