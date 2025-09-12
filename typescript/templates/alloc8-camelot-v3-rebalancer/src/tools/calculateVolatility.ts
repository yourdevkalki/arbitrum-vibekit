import { z } from 'zod';
import { type VibkitToolDefinition } from 'arbitrum-vibekit-core';
import type { Task } from '@google-a2a/types';
import type { RebalancerContext } from '../context/types.js';
import { TaskState } from '@google-a2a/types';
import { calculateVolatility, type PriceData } from '../strategy/index.js';

const calculateVolatilityParametersSchema = z.object({
  poolPair: z.string().describe('Pool pair (e.g., ETH/USDC)'),
  timeframe: z.enum(['1h', '4h', '24h', '7d', '30d']).default('24h'),
  method: z
    .enum(['standard', 'garch', 'ewma'])
    .describe('Volatility calculation method')
    .default('standard'),
});

type CalculateVolatilityParams = z.infer<typeof calculateVolatilityParametersSchema>;

export const calculateVolatilityTool: VibkitToolDefinition<
  CalculateVolatilityParams,
  Task,
  RebalancerContext
> = {
  name: 'calculate-volatility',
  description: 'Calculate volatility metrics for optimal range determination',
  parameters: calculateVolatilityParametersSchema,
  execute: async (args, context) => {
    try {
      // In production, would fetch real price history from MCP server
      // For now, generate sample price data for demonstration
      const samplePriceData: PriceData[] = generateSamplePriceData(args.poolPair, args.timeframe);

      // Calculate volatility using the strategy engine
      const volatilityMetrics = calculateVolatility(samplePriceData, args.method, args.timeframe);

      const responseText = `📊 Volatility Analysis for ${args.poolPair}:

🔍 Method: ${volatilityMetrics.method.toUpperCase()}
📈 Annualized Volatility: ${(volatilityMetrics.annualizedVolatility * 100).toFixed(2)}%
📅 Daily Volatility: ${(volatilityMetrics.dailyVolatility * 100).toFixed(2)}%
📊 Trend: ${volatilityMetrics.trend.toUpperCase()}
🎯 Confidence: ${(volatilityMetrics.confidence * 100).toFixed(0)}%

💡 Range Recommendations:
${getVolatilityRangeRecommendation(volatilityMetrics)}

⚠️ Risk Assessment:
${getRiskAssessment(volatilityMetrics)}`;

      return {
        id: 'calculate-volatility',
        contextId: `volatility-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Completed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [{ kind: 'text', text: responseText }],
          },
        },
        artifacts: [
          {
            artifactId: `volatility-${Date.now()}`,
            name: 'volatility-data',
            parts: [{ kind: 'data', data: volatilityMetrics }],
          },
        ],
      };
    } catch (error) {
      console.error('[CalculateVolatility] Error:', error);
      return {
        id: 'calculate-volatility',
        contextId: `volatility-error-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [
              {
                kind: 'text',
                text: `Error calculating volatility: ${(error as Error).message}`,
              },
            ],
          },
        },
      };
    }
  },
};

/**
 * Generate sample price data for demonstration
 */
function generateSamplePriceData(poolPair: string, timeframe: string): PriceData[] {
  const dataPoints =
    timeframe === '1h' ? 60 : timeframe === '4h' ? 240 : timeframe === '24h' ? 1440 : 10080;
  const basePrice = 2000; // Example ETH price
  const data: PriceData[] = [];

  let currentPrice = basePrice;
  const now = Date.now();
  const interval =
    timeframe === '1h'
      ? 60000
      : timeframe === '4h'
        ? 240000
        : timeframe === '24h'
          ? 86400000
          : 604800000;

  for (let i = 0; i < Math.min(dataPoints, 100); i++) {
    // Simple random walk
    const change = (Math.random() - 0.5) * 0.02; // ±1% change
    currentPrice *= 1 + change;

    data.push({
      timestamp: now - i * interval,
      price: currentPrice,
      volume: Math.random() * 1000000,
    });
  }

  return data.reverse(); // Chronological order
}

/**
 * Get range recommendation based on volatility
 */
function getVolatilityRangeRecommendation(metrics: any): string {
  const vol = metrics.annualizedVolatility;

  if (vol > 1.0) {
    return '- Very high volatility detected - consider wide ranges (15-25%) or avoid concentrated positions';
  } else if (vol > 0.6) {
    return '- High volatility - recommended range width: 8-15%';
  } else if (vol > 0.3) {
    return '- Moderate volatility - recommended range width: 5-10%';
  } else {
    return '- Low volatility - can use narrow ranges (3-8%) for higher fee capture';
  }
}

/**
 * Get risk assessment based on volatility
 */
function getRiskAssessment(metrics: any): string {
  const vol = metrics.annualizedVolatility;
  const trend = metrics.trend;

  let assessment = '';

  if (vol > 0.8) {
    assessment += '- HIGH RISK: Significant impermanent loss potential\n';
  } else if (vol > 0.4) {
    assessment += '- MEDIUM RISK: Moderate impermanent loss risk\n';
  } else {
    assessment += '- LOW RISK: Minimal impermanent loss expected\n';
  }

  if (trend === 'increasing') {
    assessment += '- Volatility is increasing - consider widening ranges or reducing exposure';
  } else if (trend === 'decreasing') {
    assessment += '- Volatility is decreasing - opportunity to narrow ranges for better fees';
  } else {
    assessment += '- Volatility is stable - current strategy can be maintained';
  }

  return assessment;
}
