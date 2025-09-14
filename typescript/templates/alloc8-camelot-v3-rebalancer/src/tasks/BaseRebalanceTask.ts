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
import { DiscoveryMode } from '../config/types.js';
import type { EnhancedPoolPosition } from '../utils/directPositionFetcher.js';
import { fetchActivePositions } from '../utils/directPositionFetcher.js';
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
  protected async fetchAndEvaluate(): Promise<RebalanceEvaluation[]> {
    try {
      // Get wallet address from private key
      const walletAddress = getWalletAddressFromPrivateKey(this.context.config.walletPrivateKey);

      console.log(`🔍 Fetching positions for wallet: ${walletAddress}`);

      let positions: EnhancedPoolPosition[] = [];

      if (this.context.config.discoveryMode === DiscoveryMode.SINGLE_POOL) {
        console.log(`🔍 Single pool mode - Pool address: ${this.context.config.poolId}`);
        console.log(
          `⚠️  Single pool mode not yet supported with direct GraphQL fetching. Using auto-discovery instead.`
        );
      }

      // Use direct GraphQL fetching for all modes
      console.log(`🔍 Fetching positions using direct GraphQL from Camelot v3 subgraph...`);

      try {
        positions = await fetchActivePositions(walletAddress);

        // If in single pool mode, filter positions by pool address
        if (
          this.context.config.discoveryMode === DiscoveryMode.SINGLE_POOL &&
          this.context.config.poolId
        ) {
          const filteredPositions = positions.filter(
            pos => pos.poolAddress.toLowerCase() === this.context.config.poolId!.toLowerCase()
          );
          console.log(
            `📍 Filtered to ${filteredPositions.length} positions for pool ${this.context.config.poolId}`
          );
          positions = filteredPositions;
        }

        console.log(`📍 Found ${positions.length} positions using direct GraphQL`);
      } catch (error) {
        console.error('❌ Error fetching positions with direct GraphQL:', error);
        throw error;
      }

      if (positions.length === 0) {
        console.log('ℹ️  No positions found for monitoring');
        return [];
      }

      console.log(`📍 Found ${positions.length} positions to evaluate`);

      // Update monitoring state with current position IDs
      this.context.monitoringState.currentPositions = positions.map(p => p.positionId);

      const evaluations: RebalanceEvaluation[] = [];

      // Evaluate each position
      for (const position of positions) {
        try {
          console.log(`\n🔍 Evaluating position ${position.positionId}...`);

          // Get pool data
          const poolResponse = await this.context.mcpClients['ember-onchain']!.request(
            {
              method: 'tools/call',
              params: {
                name: 'getLiquidityPools',
                arguments: {
                  poolAddress: position.poolAddress,
                  chainId: position.chainId,
                },
              },
            },
            z.any()
          );

          if (!(poolResponse as any).result?.content) {
            console.warn(`⚠️  Could not get pool data for position ${position.positionId}`);
            continue;
          }

          const pools: PoolState[] = JSON.parse((poolResponse as any).result.content[0].text);
          const poolState = pools[0];

          if (!poolState) {
            console.warn(`⚠️  Pool state not found for position ${position.positionId}`);
            continue;
          }

          // Get token market data - use symbols if available, otherwise addresses
          const token0Identifier = position.token0Symbol || position.token0;
          const token1Identifier = position.token1Symbol || position.token1;

          const marketDataResponse = await this.context.mcpClients['ember-onchain']!.request(
            {
              method: 'tools/call',
              params: {
                name: 'getTokenMarketData',
                arguments: {
                  tokens: [token0Identifier, token1Identifier],
                  chainId: position.chainId,
                },
              },
            },
            z.any()
          );

          if (!(marketDataResponse as any).result?.content) {
            console.warn(`⚠️  Could not get market data for position ${position.positionId}`);
            continue;
          }

          const marketData: TokenMarketData[] = JSON.parse(
            (marketDataResponse as any).result.content[0].text
          );
          const token0Data = marketData.find(
            t =>
              t.symbol === token0Identifier ||
              t.address.toLowerCase() === position.token0.toLowerCase()
          );
          const token1Data = marketData.find(
            t =>
              t.symbol === token1Identifier ||
              t.address.toLowerCase() === position.token1.toLowerCase()
          );

          if (!token0Data || !token1Data) {
            console.warn(`⚠️  Token market data not found for position ${position.positionId}`);
            continue;
          }

          // Evaluate the position
          const evaluation = evaluateRebalanceNeed(
            position,
            poolState,
            token0Data,
            token1Data,
            this.context.config.riskProfile
          );

          // Add position metadata to evaluation
          (evaluation as any).positionId = position.positionId;
          (evaluation as any).chainId = position.chainId;
          (evaluation as any).poolAddress = position.poolAddress;
          (evaluation as any).tokenPair =
            position.token0Symbol && position.token1Symbol
              ? `${position.token0Symbol}/${position.token1Symbol}`
              : `${position.token0.slice(0, 6)}.../${position.token1.slice(0, 6)}...`;

          evaluations.push(evaluation);

          console.log(`📊 Position ${position.positionId} evaluation:`);
          console.log(`   Token pair: ${(evaluation as any).tokenPair}`);
          console.log(`   Chain ID: ${position.chainId}`);
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
        } catch (positionError) {
          console.error(`❌ Error evaluating position ${position.positionId}:`, positionError);
          continue;
        }
      }

      console.log(`\n📊 Evaluation Summary:`);
      console.log(`   Total positions: ${positions.length}`);
      console.log(`   Successfully evaluated: ${evaluations.length}`);
      console.log(
        `   Positions needing rebalance: ${evaluations.filter(e => e.needsRebalance).length}`
      );

      return evaluations;
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
