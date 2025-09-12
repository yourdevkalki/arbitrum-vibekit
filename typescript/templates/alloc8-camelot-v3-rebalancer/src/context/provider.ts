import type { RebalancerContext, TokenInfo } from './types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export const contextProvider = async (deps: any): Promise<RebalancerContext> => {
  const tokenMap: Record<string, TokenInfo[]> = {};

  // Simple token map for demo - in production would fetch from MCP server
  // This avoids complex MCP setup for the template
  tokenMap['ETH'] = [
    {
      address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      chainId: 42161,
      decimals: 18,
      symbol: 'ETH',
      name: 'Ethereum',
    },
  ];

  tokenMap['USDC'] = [
    {
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      chainId: 42161,
      decimals: 6,
      symbol: 'USDC',
      name: 'USD Coin',
    },
  ];

  return {
    config: {
      arbitrumRpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
      emberMcpServerUrl: process.env.EMBER_MCP_SERVER_URL || 'https://api.emberai.xyz/mcp',
      quicknodeSubdomain: process.env.QUICKNODE_SUBDOMAIN,
      quicknodeApiKey: process.env.QUICKNODE_API_KEY,
    },
    mcpClients: deps.mcpClients,
    llmModel: deps.llmModel,
    tokenMap,
    positions: [],
    pools: [],
  };
};
