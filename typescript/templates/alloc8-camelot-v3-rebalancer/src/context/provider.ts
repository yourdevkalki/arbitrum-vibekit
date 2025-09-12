import type { RebalancerContext, TokenInfo } from './types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import pRetry from 'p-retry';

/**
 * Load token map from Ember MCP server
 */
async function loadTokenMap(mcpClient: Client): Promise<Record<string, TokenInfo[]>> {
  const MCP_TOOL_TIMEOUT_MS = parseInt(process.env.MCP_TOOL_TIMEOUT_MS || '120000', 10);

  const fetchTokens = async () => {
    console.log('[Context] Loading token map from Ember MCP server...');

    // Try to get tokens directly using getTokens tool
    const response = await mcpClient.callTool(
      {
        name: 'getTokens',
        arguments: { chainId: '42161' }, // Arbitrum chain ID
      },
      undefined,
      { timeout: MCP_TOOL_TIMEOUT_MS }
    );

    // console.log('[Context] Raw response from getTokens:', JSON.stringify(response, null, 2));

    if (response && typeof response === 'object') {
      // Try different possible response structures
      let tokens: any[] = [];

      if ('content' in response && Array.isArray((response as any).content)) {
        // Response has content array with text containing JSON
        const content = (response as any).content;
        for (const item of content) {
          if (item.type === 'text' && item.text) {
            try {
              const parsed = JSON.parse(item.text);
              if (parsed.tokens && Array.isArray(parsed.tokens)) {
                tokens = parsed.tokens;
                break;
              } else if (Array.isArray(parsed)) {
                tokens = parsed;
                break;
              }
            } catch (e) {
              // Continue trying other formats
            }
          }
        }
      } else if ('tokens' in response && Array.isArray((response as any).tokens)) {
        // Direct tokens array
        tokens = (response as any).tokens;
      } else if (Array.isArray(response)) {
        // Response is directly an array
        tokens = response;
      }

      if (tokens.length > 0) {
        const tokenMap: Record<string, TokenInfo[]> = {};
        let loadedCount = 0;

        for (const token of tokens) {
          // Handle both direct token format and tokenUid format
          let address: string;
          let chainId: number;
          let symbol: string;
          let name: string;
          let decimals: number;

          if (token.tokenUid) {
            // Ember format with tokenUid
            address = token.tokenUid.address;
            chainId = parseInt(token.tokenUid.chainId, 10);
            symbol = token.symbol || '';
            name = token.name || token.symbol || '';
            decimals = token.decimals || 18;
          } else {
            // Direct format
            address = token.address;
            chainId = parseInt(token.chainId || '42161', 10);
            symbol = token.symbol || '';
            name = token.name || token.symbol || '';
            decimals = token.decimals || 18;
          }

          // Only add tokens with valid symbols and addresses
          if (symbol && address) {
            const symbolUpper = symbol.toUpperCase();
            if (!tokenMap[symbolUpper]) {
              tokenMap[symbolUpper] = [];
            }
            tokenMap[symbolUpper].push({
              chainId,
              address,
              decimals,
              symbol,
              name,
            });
            loadedCount++;
          }
        }

        console.log(`[Context] Loaded ${loadedCount} tokens from Ember MCP`);
        return tokenMap;
      }
    }

    throw new Error('No valid token data found in Ember MCP response');
  };

  try {
    return await pRetry(fetchTokens, {
      retries: 3,
      onFailedAttempt: error => {
        console.warn(
          `[Context] Attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`
        );
      },
    });
  } catch (error) {
    console.error(
      '[Context] Error loading token map from Ember MCP after multiple retries:',
      error
    );
    console.warn('[Context] Using fallback token map due to MCP error');

    // Fallback token map for common tokens
    return {
      ETH: [
        {
          address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
          chainId: 42161,
          decimals: 18,
          symbol: 'ETH',
          name: 'Ethereum',
        },
      ],
      WETH: [
        {
          address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
          chainId: 42161,
          decimals: 18,
          symbol: 'WETH',
          name: 'Wrapped Ethereum',
        },
      ],
      USDC: [
        {
          address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
          chainId: 42161,
          decimals: 6,
          symbol: 'USDC',
          name: 'USD Coin',
        },
      ],
      ARB: [
        {
          address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
          chainId: 42161,
          decimals: 18,
          symbol: 'ARB',
          name: 'Arbitrum',
        },
      ],
    };
  }
}

export const contextProvider = async (deps: any): Promise<RebalancerContext> => {
  console.log('[Context] Initializing Camelot v3 Rebalancer context...');

  const { mcpClients, llmModel } = deps;

  // Find the Ember MCP client
  const emberMcpClient =
    Object.entries(mcpClients || {}).find(
      ([name]) => name.includes('ember') || name.includes('mcp-tool-server')
    )?.[1] || null;

  let tokenMap: Record<string, TokenInfo[]> = {};
  let mcpConnected = false;

  if (emberMcpClient) {
    console.log('[Context] Found Ember MCP client, loading token map...');
    tokenMap = await loadTokenMap(emberMcpClient as any);
    mcpConnected = true;
  } else {
    console.warn('[Context] No Ember MCP client found - using fallback token map');
    console.warn('[Context] Expected MCP client name containing "ember" or "mcp-tool-server"');
    console.warn('[Context] Available MCP clients:', Object.keys(mcpClients || {}));

    // Use fallback token map
    tokenMap = {
      ETH: [
        {
          address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
          chainId: 42161,
          decimals: 18,
          symbol: 'ETH',
          name: 'Ethereum',
        },
      ],
      WETH: [
        {
          address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
          chainId: 42161,
          decimals: 18,
          symbol: 'WETH',
          name: 'Wrapped Ethereum',
        },
      ],
      USDC: [
        {
          address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
          chainId: 42161,
          decimals: 6,
          symbol: 'USDC',
          name: 'USD Coin',
        },
      ],
      ARB: [
        {
          address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
          chainId: 42161,
          decimals: 18,
          symbol: 'ARB',
          name: 'Arbitrum',
        },
      ],
    };
  }

  // Parse configuration from environment
  const arbitrumRpcUrl = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
  const emberMcpServerUrl = process.env.EMBER_MCP_SERVER_URL || 'https://api.emberai.xyz/mcp';

  // Count available tokens
  const tokenCount = Object.values(tokenMap).reduce((count, tokens) => count + tokens.length, 0);

  const context: RebalancerContext = {
    config: {
      arbitrumRpcUrl,
      emberMcpServerUrl,
      quicknodeSubdomain: process.env.QUICKNODE_SUBDOMAIN,
      quicknodeApiKey: process.env.QUICKNODE_API_KEY,
    },
    mcpClients,
    llmModel,
    tokenMap,
    positions: [],
    pools: [],
  };

  // Log context summary
  console.log('[Context] Camelot v3 Rebalancer context loaded successfully:');
  console.log(`  - MCP Connected: ${mcpConnected ? '✅' : '❌'}`);
  console.log(`  - Token Map: ${Object.keys(tokenMap).length} symbols, ${tokenCount} tokens`);
  console.log(`  - RPC URL: ${arbitrumRpcUrl}`);
  console.log(`  - Ember MCP Server: ${emberMcpServerUrl}`);

  if (Object.keys(tokenMap).length > 0) {
    const sampleTokens = Object.keys(tokenMap).slice(0, 5);
    console.log(
      `  - Sample tokens: ${sampleTokens.join(', ')}${Object.keys(tokenMap).length > 5 ? '...' : ''}`
    );
  }

  return context;
};
