import { describe, it, expect, beforeEach } from 'vitest';
import { agentConfig } from '../src/config.js';

describe('Camelot v3 LP Rebalancing Agent', () => {
  describe('Agent Configuration', () => {
    it('should have correct agent metadata', () => {
      expect(agentConfig.name).toContain('Camelot v3 LP Rebalancer');
      expect(agentConfig.version).toBe('1.0.0');
      expect(agentConfig.description).toContain('liquidity management');
    });

    it('should have all required skills', () => {
      expect(agentConfig.skills).toHaveLength(3);

      const skillIds = agentConfig.skills.map(skill => skill.id);
      expect(skillIds).toContain('pool-analytics');
      expect(skillIds).toContain('position-management');
      expect(skillIds).toContain('rebalancing-monitor');
    });

    it('should have proper capabilities configured', () => {
      expect(agentConfig.capabilities.streaming).toBe(true);
      expect(agentConfig.capabilities.pushNotifications).toBe(false);
      expect(agentConfig.capabilities.stateTransitionHistory).toBe(true);
    });
  });

  describe('Skills Configuration', () => {
    it('should have pool analytics skill with correct tools', () => {
      const poolAnalyticsSkill = agentConfig.skills.find(skill => skill.id === 'pool-analytics');
      expect(poolAnalyticsSkill).toBeDefined();
      expect(poolAnalyticsSkill?.name).toBe('Pool Analytics');
      expect(poolAnalyticsSkill?.tools).toHaveLength(3);
    });

    it('should have position management skill with correct tools', () => {
      const positionManagementSkill = agentConfig.skills.find(
        skill => skill.id === 'position-management'
      );
      expect(positionManagementSkill).toBeDefined();
      expect(positionManagementSkill?.name).toBe('Position Management');
      expect(positionManagementSkill?.tools).toHaveLength(4);
    });

    it('should have rebalancing monitor skill with correct tools', () => {
      const rebalancingMonitorSkill = agentConfig.skills.find(
        skill => skill.id === 'rebalancing-monitor'
      );
      expect(rebalancingMonitorSkill).toBeDefined();
      expect(rebalancingMonitorSkill?.name).toBe('Rebalancing Monitor');
      expect(rebalancingMonitorSkill?.tools).toHaveLength(4);
    });
  });

  describe('Skill Examples', () => {
    it('should have meaningful examples for each skill', () => {
      agentConfig.skills.forEach(skill => {
        expect(skill.examples).toBeDefined();
        expect(skill.examples.length).toBeGreaterThan(0);

        // Check that examples are descriptive
        skill.examples.forEach(example => {
          expect(example.length).toBeGreaterThan(10);
          expect(typeof example).toBe('string');
        });
      });
    });
  });

  describe('Skill Tags', () => {
    it('should have appropriate tags for DeFi and Camelot operations', () => {
      agentConfig.skills.forEach(skill => {
        expect(skill.tags).toBeDefined();
        expect(skill.tags.length).toBeGreaterThan(0);

        // Should include DeFi-related tags
        const tagString = skill.tags.join(' ');
        expect(tagString).toMatch(/(defi|camelot|liquidity|concentrated-liquidity)/i);
      });
    });
  });
});
