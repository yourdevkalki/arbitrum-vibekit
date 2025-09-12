import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PassiveModeTask } from '../src/tasks/PassiveModeTask.js';
import { ActiveModeTask } from '../src/tasks/ActiveModeTask.js';
import type { RebalancerContext } from '../src/context/types.js';
import { OperatingMode, RiskProfile } from '../src/config/types.js';

// Mock MCP client
const mockMcpClient = {
  request: vi.fn(),
};

// Mock Telegram bot
const mockTelegramBot = {
  sendMessage: vi.fn(),
};

// Mock context
const mockContext: RebalancerContext = {
  config: {
    mode: OperatingMode.PASSIVE,
    riskProfile: RiskProfile.MEDIUM,
    poolId: '0x1234567890abcdef1234567890abcdef12345678',
    token0: 'ETH',
    token1: 'USDC',
    checkInterval: 3600000,
    priceDeviationThreshold: 0.05,
    utilizationThreshold: 0.8,
    walletPrivateKey: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    arbitrumRpcUrl: 'https://arb1.arbitrum.io/rpc',
    emberMcpServerUrl: 'https://api.emberai.xyz/mcp',
    telegramBotToken: 'test_token',
    telegramChatId: 'test_chat_id',
  },
  mcpClients: {
    ember: mockMcpClient as any,
  },
  telegramBot: mockTelegramBot as any,
  rpcProvider: {
    url: 'https://arb1.arbitrum.io/rpc',
  },
  monitoringState: {
    isActive: false,
    currentPositions: [],
    lastCheck: null,
    taskId: null,
  },
};

describe('A2A Tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.monitoringState.isActive = false;
    mockContext.monitoringState.taskId = null;
  });

  afterEach(() => {
    // Clean up any running tasks
    if (mockContext.monitoringState.isActive) {
      mockContext.monitoringState.isActive = false;
    }
  });

  describe('PassiveModeTask', () => {
    it('should create task with correct properties', () => {
      const task = new PassiveModeTask(mockContext);

      expect(task.id).toBeDefined();
      expect(task.contextId).toBeDefined();
      expect(task.getStatus().state).toBe('completed'); // Not running initially
    });

    it('should start and stop monitoring', () => {
      const task = new PassiveModeTask(mockContext);

      // Start monitoring
      task.start();
      expect(mockContext.monitoringState.isActive).toBe(true);
      expect(mockContext.monitoringState.taskId).toBe(task.id);
      expect(task.getStatus().state).toBe('working');

      // Stop monitoring
      task.stop();
      expect(mockContext.monitoringState.isActive).toBe(false);
      expect(mockContext.monitoringState.taskId).toBe(null);
      expect(task.getStatus().state).toBe('completed');
    });

    it('should create proper A2A task object', () => {
      const task = new PassiveModeTask(mockContext);
      const taskObj = task.toTask();

      expect(taskObj.kind).toBe('task');
      expect(taskObj.id).toBe(task.id);
      expect(taskObj.contextId).toBe(task.contextId);
      expect(taskObj.metadata?.taskType).toBe('PassiveModeTask');
      expect(taskObj.metadata?.config).toBe(mockContext.config);
    });

    it('should handle no positions gracefully', async () => {
      // Mock empty positions response
      mockMcpClient.request.mockResolvedValueOnce({
        result: {
          content: [{ text: '[]' }],
        },
      });

      const task = new PassiveModeTask(mockContext);

      // This should not throw
      await expect(task['fetchAndEvaluate']()).resolves.toBe(null);
    });

    it('should send telegram alert when rebalance needed', async () => {
      // Mock responses for a position that needs rebalancing
      mockMcpClient.request
        .mockResolvedValueOnce({
          result: {
            content: [
              {
                text: JSON.stringify([
                  {
                    positionId: '123',
                    poolAddress: '0x...',
                    token0: 'ETH',
                    token1: 'USDC',
                    tickLower: -1000,
                    tickUpper: 1000,
                    liquidity: '1000000',
                    amount0: '1000000000000000000',
                    amount1: '2000000000',
                    fees0: '100000000000000000',
                    fees1: '200000000',
                    isInRange: false, // Out of range - needs rebalance
                  },
                ]),
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          result: {
            content: [
              {
                text: JSON.stringify([
                  {
                    poolAddress: '0x...',
                    token0: 'ETH',
                    token1: 'USDC',
                    fee: 3000,
                    tick: 0,
                    price: '2000',
                    liquidity: '10000000',
                    sqrtPriceX96: '3543191142285914205922034323',
                    tvl: '20000000',
                    volume24h: '1000000',
                    feesEarned24h: '3000',
                  },
                ]),
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          result: {
            content: [
              {
                text: JSON.stringify([
                  {
                    symbol: 'ETH',
                    address: '0x...',
                    price: 2000,
                    priceChange24h: 3.5,
                    volume24h: 1000000,
                    marketCap: 240000000000,
                    volatility: 0.12,
                  },
                  {
                    symbol: 'USDC',
                    address: '0x...',
                    price: 1,
                    priceChange24h: 0.05,
                    volume24h: 500000,
                    marketCap: 50000000000,
                    volatility: 0.01,
                  },
                ]),
              },
            ],
          },
        });

      const task = new PassiveModeTask(mockContext);
      const evaluation = await task['fetchAndEvaluate']();

      expect(evaluation).toBeDefined();
      expect(evaluation?.needsRebalance).toBe(true);
      expect(evaluation?.reason).toContain('out of range');
    });
  });

  describe('ActiveModeTask', () => {
    it('should create task with correct properties', () => {
      const task = new ActiveModeTask(mockContext);

      expect(task.id).toBeDefined();
      expect(task.contextId).toBeDefined();
      expect(task.getStatus().state).toBe('completed'); // Not running initially
    });

    it('should handle active mode context', () => {
      const activeContext = {
        ...mockContext,
        config: {
          ...mockContext.config,
          mode: OperatingMode.ACTIVE,
        },
      };

      const task = new ActiveModeTask(activeContext);
      const taskObj = task.toTask();

      expect(taskObj.metadata?.taskType).toBe('ActiveModeTask');
      expect(taskObj.metadata?.config.mode).toBe(OperatingMode.ACTIVE);
    });

    it('should execute rebalance workflow', async () => {
      // Mock successful transaction responses
      mockMcpClient.request
        .mockResolvedValueOnce({
          result: {
            content: [
              {
                text: JSON.stringify({
                  success: true,
                  transactionHash: '0xabc123',
                  gasUsed: '100000',
                }),
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          result: {
            content: [
              {
                text: JSON.stringify([
                  { symbol: 'ETH', balanceFormatted: '1.0', usdValue: 2000 },
                  { symbol: 'USDC', balanceFormatted: '1000.0', usdValue: 1000 },
                ]),
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          result: {
            content: [
              {
                text: JSON.stringify({
                  success: true,
                  transactionHash: '0xdef456',
                  gasUsed: '150000',
                }),
              },
            ],
          },
        });

      const task = new ActiveModeTask(mockContext);
      mockContext.monitoringState.currentPositions = ['123'];

      const mockEvaluation = {
        needsRebalance: true,
        reason: 'Position out of range',
        suggestedRange: {
          tickLower: -500,
          tickUpper: 500,
          priceRange: [1800, 2200],
        },
        estimatedAprImprovement: 5.2,
        riskAssessment: 'Medium',
      };

      // This tests the private executeRebalance method indirectly
      await expect(task['executeRebalance'](mockEvaluation)).resolves.not.toThrow();

      expect(mockTelegramBot.sendMessage).toHaveBeenCalled();
    });
  });

  describe('Task Error Handling', () => {
    it('should handle MCP client errors gracefully', async () => {
      mockMcpClient.request.mockRejectedValue(new Error('MCP connection failed'));

      const task = new PassiveModeTask(mockContext);

      await expect(task['fetchAndEvaluate']()).rejects.toThrow('MCP connection failed');
    });

    it('should send error notifications via Telegram', async () => {
      const task = new PassiveModeTask(mockContext);
      const error = new Error('Test error');

      await task['handleError'](error);

      expect(mockTelegramBot.sendMessage).toHaveBeenCalledWith(
        'test_chat_id',
        expect.stringContaining('Test error'),
        { parse_mode: 'Markdown' }
      );
    });

    it('should handle Telegram failures gracefully', async () => {
      mockTelegramBot.sendMessage.mockRejectedValue(new Error('Telegram API error'));

      const task = new PassiveModeTask(mockContext);

      // Should not throw even if Telegram fails
      await expect(task['handleError'](new Error('Test error'))).resolves.not.toThrow();
    });
  });

  describe('Task Scheduling', () => {
    it('should prevent multiple tasks from running simultaneously', () => {
      const task1 = new PassiveModeTask(mockContext);
      const task2 = new PassiveModeTask(mockContext);

      task1.start();
      expect(mockContext.monitoringState.isActive).toBe(true);

      task2.start();
      // Second task should not interfere with first
      expect(mockContext.monitoringState.taskId).toBe(task1.id);

      task1.stop();
    });

    it('should update monitoring state correctly', () => {
      const task = new PassiveModeTask(mockContext);

      expect(mockContext.monitoringState.isActive).toBe(false);
      expect(mockContext.monitoringState.taskId).toBe(null);
      expect(mockContext.monitoringState.lastCheck).toBe(null);

      task.start();

      expect(mockContext.monitoringState.isActive).toBe(true);
      expect(mockContext.monitoringState.taskId).toBe(task.id);

      task.stop();

      expect(mockContext.monitoringState.isActive).toBe(false);
      expect(mockContext.monitoringState.taskId).toBe(null);
    });
  });
});
