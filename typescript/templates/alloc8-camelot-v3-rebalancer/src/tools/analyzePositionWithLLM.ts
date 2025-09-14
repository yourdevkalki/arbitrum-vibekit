import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { Task, Message } from '@google-a2a/types';
import type { RebalancerContext } from '../context/types.js';

const analyzePositionWithLLMParametersSchema = z.object({
  positionId: z.string().describe('Position ID to analyze'),
  poolAddress: z.string().describe('Pool address'),
  currentRange: z
    .object({
      lower: z.number().describe('Current lower tick'),
      upper: z.number().describe('Current upper tick'),
    })
    .describe('Current position range'),
  kpis: z
    .object({
      liquidity_metrics: z.record(z.any()).describe('Liquidity distribution metrics'),
      price_metrics: z.record(z.any()).describe('Price and volatility metrics'),
      volume_fee_metrics: z.record(z.any()).describe('Volume and fee metrics'),
    })
    .describe('Pool KPIs data'),
  riskProfile: z
    .enum(['conservative', 'medium', 'aggressive'])
    .describe('Risk profile for rebalancing'),
});

type AnalyzePositionWithLLMParams = z.infer<typeof analyzePositionWithLLMParametersSchema>;

/**
 * Generate fallback analysis when LLM is not available
 */
function generateFallbackAnalysis(params: AnalyzePositionWithLLMParams, kpis: any) {
  const { positionId, poolAddress, currentRange, riskProfile } = params;
  const { price_metrics, liquidity_metrics } = kpis;

  // Simple heuristic-based analysis
  const liquidityUtilization = price_metrics?.liquidity_utilization_pct || 0;
  const priceChange = price_metrics?.hourly_price_change_pct || 0;
  const volatility = price_metrics?.token0_hourly_volatility || 0;
  const impermanentLoss = price_metrics?.impermanent_loss_est_pct || 0;

  // Determine position health
  let positionHealth = 'fair';
  if (liquidityUtilization > 80 && volatility < 0.05) {
    positionHealth = 'excellent';
  } else if (liquidityUtilization > 50 && volatility < 0.1) {
    positionHealth = 'good';
  } else if (liquidityUtilization < 20 || volatility > 0.2) {
    positionHealth = 'poor';
  }

  // Determine market conditions
  let marketConditions = 'neutral';
  if (volatility < 0.05 && Math.abs(priceChange) < 2) {
    marketConditions = 'favorable';
  } else if (volatility > 0.15 || Math.abs(priceChange) > 10) {
    marketConditions = 'unfavorable';
  }

  // Determine risk level
  let riskLevel = 'medium';
  if (volatility < 0.05 && impermanentLoss < 5) {
    riskLevel = 'low';
  } else if (volatility > 0.15 || impermanentLoss > 15) {
    riskLevel = 'high';
  }

  // Generate recommendation based on heuristics
  let action = 'maintain';
  let confidence = 0.5;
  let newRange = {
    lower_tick: currentRange.lower,
    upper_tick: currentRange.upper,
    range_width_pct: 0,
  };

  if (positionHealth === 'poor' || liquidityUtilization < 20) {
    action = 'rebalance';
    confidence = 0.7;

    // Calculate new range based on risk profile
    const rangeWidth = currentRange.upper - currentRange.lower;
    const center = (currentRange.upper + currentRange.lower) / 2;

    let newWidth = rangeWidth;
    if (riskProfile === 'conservative') {
      newWidth = rangeWidth * 0.8; // Narrower range
    } else if (riskProfile === 'aggressive') {
      newWidth = rangeWidth * 1.2; // Wider range
    }

    const newLower = Math.round(center - newWidth / 2);
    const newUpper = Math.round(center + newWidth / 2);

    newRange = {
      lower_tick: newLower,
      upper_tick: newUpper,
      range_width_pct: Math.abs(newWidth / center) * 100,
    };
  }

  return {
    position_id: positionId,
    pool_address: poolAddress,
    analyzed_at: new Date().toISOString(),
    risk_profile: riskProfile,
    analysis: {
      position_health: positionHealth,
      market_conditions: marketConditions,
      risk_level: riskLevel,
      key_insights: [
        `Liquidity utilization: ${liquidityUtilization.toFixed(1)}%`,
        `Price volatility: ${(volatility * 100).toFixed(2)}%`,
        `Impermanent loss risk: ${impermanentLoss.toFixed(1)}%`,
      ],
    },
    recommendation: {
      action,
      confidence,
      reasoning: `Based on liquidity utilization (${liquidityUtilization.toFixed(1)}%) and volatility (${(volatility * 100).toFixed(2)}%), ${action} is recommended.`,
      new_range: newRange,
      expected_outcomes: {
        fee_earnings_potential: liquidityUtilization > 50 ? 'high' : 'medium',
        impermanent_loss_risk: impermanentLoss > 10 ? 'high' : 'medium',
        liquidity_utilization: liquidityUtilization > 70 ? 'high' : 'medium',
      },
    },
    monitoring_suggestions: {
      check_frequency_hours: riskLevel === 'high' ? 2 : 6,
      rebalance_triggers: ['liquidity utilization < 20%', 'volatility > 15%'],
      alert_conditions: ['position out of range for >4 hours'],
    },
  };
}

/**
 * Analyze position with LLM and recommend optimal ranges
 */
export const analyzePositionWithLLMTool: VibkitToolDefinition<
  typeof analyzePositionWithLLMParametersSchema,
  Task | Message,
  RebalancerContext
> = {
  name: 'analyzePositionWithLLM',
  description:
    'Analyze LP position using LLM to recommend optimal rebalancing ranges based on market conditions and KPIs',
  parameters: analyzePositionWithLLMParametersSchema,

  execute: async (params: AnalyzePositionWithLLMParams, context: any) => {
    try {
      console.log(`🤖 Analyzing position ${params.positionId} with LLM...`);

      // Prepare analysis prompt for LLM
      const analysisPrompt = `
You are an expert DeFi liquidity provider analyst specializing in Camelot v3 concentrated liquidity positions. 

Analyze the following position and recommend optimal rebalancing ranges based on the provided KPIs and market conditions.

## Position Details:
- Position ID: ${params.positionId}
- Pool Address: ${params.poolAddress}
- Current Range: [${params.currentRange.lower}, ${params.currentRange.upper}] ticks
- Risk Profile: ${params.riskProfile}

## Pool KPIs:

### Liquidity Metrics:
${JSON.stringify(params.kpis.liquidity_metrics, null, 2)}

### Price & Volatility Metrics:
${JSON.stringify(params.kpis.price_metrics, null, 2)}

### Volume & Fee Metrics:
${JSON.stringify(params.kpis.volume_fee_metrics, null, 2)}

## Analysis Framework:

1. **Current Position Health**: Assess if the position is in range and earning fees
2. **Market Conditions**: Analyze volatility, liquidity distribution, and trading activity
3. **Risk Assessment**: Consider impermanent loss potential and concentration risk
4. **Optimal Range Recommendation**: Suggest new tick range based on:
   - Current price position
   - Volatility patterns
   - Liquidity concentration
   - Risk profile preferences

## Risk Profile Guidelines:
- **Conservative**: Narrower ranges (2-5% around current price), lower impermanent loss risk
- **Medium**: Balanced ranges (5-10% around current price), moderate risk/reward
- **Aggressive**: Wider ranges (10-20% around current price), higher fee potential but more risk

## Response Format:
Provide a JSON response with the following structure:
{
  "analysis": {
    "position_health": "excellent|good|fair|poor",
    "market_conditions": "favorable|neutral|unfavorable",
    "risk_level": "low|medium|high",
    "key_insights": ["insight1", "insight2", "insight3"]
  },
  "recommendation": {
    "action": "rebalance|maintain|withdraw",
    "confidence": 0.0-1.0,
    "reasoning": "Detailed explanation of recommendation",
    "new_range": {
      "lower_tick": number,
      "upper_tick": number,
      "range_width_pct": number
    },
    "expected_outcomes": {
      "fee_earnings_potential": "high|medium|low",
      "impermanent_loss_risk": "low|medium|high",
      "liquidity_utilization": "high|medium|low"
    }
  },
  "monitoring_suggestions": {
    "check_frequency_hours": number,
    "rebalance_triggers": ["trigger1", "trigger2"],
    "alert_conditions": ["condition1", "condition2"]
  }
}

Focus on data-driven insights and provide specific, actionable recommendations.
`;

      // Check if LLM is available
      if (!context.llm || !context.llm.generateText) {
        console.warn('⚠️  LLM not available, using fallback analysis');
        const fallbackAnalysis = generateFallbackAnalysis(params, params.kpis);
        return createSuccessTask(
          'analyzePositionWithLLM',
          [
            {
              artifactId: 'llm-analysis-fallback-' + Date.now(),
              parts: [{ kind: 'text', text: JSON.stringify(fallbackAnalysis, null, 2) }],
            },
          ],
          'Position analysis completed with fallback method'
        );
      }

      // Use the LLM to analyze the position
      const llmResponse = await context.llm.generateText({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert DeFi liquidity provider analyst. Provide detailed, data-driven analysis and recommendations in the exact JSON format requested.',
          },
          {
            role: 'user',
            content: analysisPrompt,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent analysis
        maxTokens: 2000,
      });

      // Parse LLM response
      let analysisResult;
      try {
        // Extract JSON from LLM response
        const jsonMatch = llmResponse.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in LLM response');
        }
      } catch (parseError) {
        console.warn('Failed to parse LLM response as JSON, using fallback analysis');
        analysisResult = {
          analysis: {
            position_health: 'fair',
            market_conditions: 'neutral',
            risk_level: 'medium',
            key_insights: ['LLM response parsing failed, using fallback analysis'],
          },
          recommendation: {
            action: 'maintain',
            confidence: 0.5,
            reasoning: 'Unable to parse LLM analysis, maintaining current position',
            new_range: params.currentRange,
            expected_outcomes: {
              fee_earnings_potential: 'medium',
              impermanent_loss_risk: 'medium',
              liquidity_utilization: 'medium',
            },
          },
          monitoring_suggestions: {
            check_frequency_hours: 6,
            rebalance_triggers: ['price moves out of range', 'volatility increases'],
            alert_conditions: ['position out of range for >2 hours'],
          },
        };
      }

      // Add metadata
      const result = {
        position_id: params.positionId,
        pool_address: params.poolAddress,
        analyzed_at: new Date().toISOString(),
        risk_profile: params.riskProfile,
        ...analysisResult,
      };

      console.log(`✅ LLM analysis completed for position ${params.positionId}`);
      console.log(`   - Action: ${result.recommendation.action}`);
      console.log(`   - Confidence: ${(result.recommendation.confidence * 100).toFixed(1)}%`);
      console.log(
        `   - New range: [${result.recommendation.new_range.lower_tick}, ${result.recommendation.new_range.upper_tick}]`
      );

      return createSuccessTask(
        'analyzePositionWithLLM',
        [
          {
            artifactId: 'llm-analysis-' + Date.now(),
            parts: [{ kind: 'text', text: JSON.stringify(result, null, 2) }],
          },
        ],
        'Position analysis completed successfully'
      );
    } catch (error) {
      console.error('❌ Error analyzing position with LLM:', error);
      return createErrorTask(
        'analyzePositionWithLLM',
        error instanceof Error ? error : new Error(`Failed to analyze position: ${error}`)
      );
    }
  },
};
