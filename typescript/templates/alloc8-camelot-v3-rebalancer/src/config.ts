import type { AgentConfig } from 'arbitrum-vibekit-core';
import { poolAnalyticsSkill } from './skills/poolAnalytics.js';
import { positionManagementSkill } from './skills/positionManagement.js';
import { rebalancingMonitorSkill } from './skills/rebalancingMonitor.js';

export const agentConfig: AgentConfig = {
  name: process.env.AGENT_NAME || 'Camelot v3 LP Rebalancer',
  version: process.env.AGENT_VERSION || '1.0.0',
  description:
    process.env.AGENT_DESCRIPTION ||
    'Automated liquidity management agent for Camelot v3 concentrated liquidity pools with risk-based rebalancing strategies',
  skills: [poolAnalyticsSkill, positionManagementSkill, rebalancingMonitorSkill],
  url: process.env.AGENT_URL || 'localhost',
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
  },
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json'],
};
