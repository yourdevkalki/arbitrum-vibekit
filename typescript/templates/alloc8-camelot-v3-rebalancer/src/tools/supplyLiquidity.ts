import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { Task, Message } from '@google-a2a/types';
import type { RebalancerContext } from '../context/types.js';
import type { TransactionResult } from '../config/types.js';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  type Address,
  type Abi,
  type Hex,
  type Hash,
  decodeEventLog,
  zeroAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';

const supplyLiquidityParametersSchema = z.object({
  token0: z.string().describe('Token0 address'),
  token1: z.string().describe('Token1 address'),
  tickLower: z.number().describe('Lower tick of the position range'),
  tickUpper: z.number().describe('Upper tick of the position range'),
  amount0Desired: z.string().describe('Desired amount of token0 to supply'),
  amount1Desired: z.string().describe('Desired amount of token1 to supply'),
  amount0Min: z.string().optional().describe('Minimum amount of token0 (slippage protection)'),
  amount1Min: z.string().optional().describe('Minimum amount of token1 (slippage protection)'),
  slippageBps: z
    .number()
    .optional()
    .default(50)
    .describe('Slippage in basis points (default: 50 = 0.5%)'),
  sqrtPriceX96: z.string().optional().describe('Initial sqrt price for new pools'),
  recipient: z.string().optional().describe('Recipient address (defaults to wallet)'),
});

type SupplyLiquidityParams = z.infer<typeof supplyLiquidityParametersSchema>;

// Battle-tested ABI from test-camelot-pos.ts
const ALGEBRA_POSITION_MANAGER: Address = '0x00c7f3082833e796A5b3e4Bd59f6642FF44DCD15';

const erc20Abi = [
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const satisfies Abi;

const algebraPositionManagerAbi = [
  // create & initialize pool if necessary
  {
    name: 'createAndInitializePoolIfNecessary',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token0', type: 'address' },
      { name: 'token1', type: 'address' },
      { name: 'sqrtPriceX96', type: 'uint160' },
    ],
    outputs: [{ name: 'pool', type: 'address' }],
  },
  // mint
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'token0', type: 'address' },
          { name: 'token1', type: 'address' },
          { name: 'tickLower', type: 'int24' },
          { name: 'tickUpper', type: 'int24' },
          { name: 'amount0Desired', type: 'uint256' },
          { name: 'amount1Desired', type: 'uint256' },
          { name: 'amount0Min', type: 'uint256' },
          { name: 'amount1Min', type: 'uint256' },
          { name: 'recipient', type: 'address' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
    ],
    outputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'liquidity', type: 'uint128' },
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
  },
] as const satisfies Abi;

// Transfer event (ERC-721) to decode minted tokenId
const erc721TransferEvent = {
  type: 'event',
  name: 'Transfer',
  inputs: [
    { name: 'from', type: 'address', indexed: true },
    { name: 'to', type: 'address', indexed: true },
    { name: 'tokenId', type: 'uint256', indexed: true },
  ],
} as const;

/**
 * Ensure token allowance for position manager
 */
async function ensureAllowance(params: {
  publicClient: ReturnType<typeof createPublicClient>;
  walletClient: ReturnType<typeof createWalletClient>;
  owner: Address;
  token: Address;
  amount: bigint;
}): Promise<void> {
  const { publicClient, walletClient, owner, token, amount } = params;

  const allowance = (await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, ALGEBRA_POSITION_MANAGER],
  })) as bigint;

  if (allowance >= amount) return;

  const MAX_UINT256 = (1n << 256n) - 1n;

  const tx = await walletClient.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: 'approve',
    args: [ALGEBRA_POSITION_MANAGER, MAX_UINT256],
    account: walletClient.account!,
  });
  console.log(`📝 Approve ${token} tx:`, tx);

  await publicClient.waitForTransactionReceipt({ hash: tx });
}

/**
 * Calculate minimum amounts with slippage protection
 */
function toMin(amount: bigint, bps: number): bigint {
  return (amount * BigInt(10_000 - bps)) / 10_000n;
}

/**
 * Supply liquidity to a Camelot v3 pool using battle-tested logic
 */
export const supplyLiquidityTool: VibkitToolDefinition<
  typeof supplyLiquidityParametersSchema,
  Task | Message,
  RebalancerContext
> = {
  name: 'supplyLiquidity',
  description:
    'Supply liquidity to a Camelot v3 concentrated liquidity pool within specified price range',
  parameters: supplyLiquidityParametersSchema,

  execute: async (params: SupplyLiquidityParams, context: any) => {
    try {
      console.log(`🔄 Supplying liquidity to pool: ${params.token0}/${params.token1}`);
      console.log(`   Range: tick ${params.tickLower} to ${params.tickUpper}`);
      console.log(`   Amounts: ${params.amount0Desired} / ${params.amount1Desired}`);

      // Get wallet address from private key
      const { getWalletAddressFromPrivateKey } = await import('../utils/walletUtils.js');
      const walletAddress = getWalletAddressFromPrivateKey(context.config.walletPrivateKey);

      // Setup viem clients
      const publicClient = createPublicClient({
        chain: arbitrum,
        transport: http(context.config.arbitrumRpcUrl),
      });

      const privateKey = context.config.walletPrivateKey.startsWith('0x')
        ? (context.config.walletPrivateKey as `0x${string}`)
        : (`0x${context.config.walletPrivateKey}` as `0x${string}`);

      const account = privateKeyToAccount(privateKey);
      const walletClient = createWalletClient({
        account,
        chain: arbitrum,
        transport: http(context.config.arbitrumRpcUrl),
      });

      console.log(`🔑 Wallet address: ${account.address}`);

      // Token ordering check
      if (params.token0.toLowerCase() > params.token1.toLowerCase()) {
        throw new Error(
          'token0 must be lexicographically smaller than token1 (token0 < token1). Swap the params if needed.'
        );
      }

      // Get token decimals
      const [decimals0, decimals1] = await Promise.all([
        publicClient.readContract({
          address: params.token0 as Address,
          abi: erc20Abi,
          functionName: 'decimals',
        }),
        publicClient.readContract({
          address: params.token1 as Address,
          abi: erc20Abi,
          functionName: 'decimals',
        }),
      ]);

      // Parse amounts
      const amount0Desired = parseUnits(params.amount0Desired, decimals0);
      const amount1Desired = parseUnits(params.amount1Desired, decimals1);

      // Calculate minimum amounts with slippage protection
      const amount0Min = params.amount0Min
        ? parseUnits(params.amount0Min, decimals0)
        : toMin(amount0Desired, params.slippageBps);
      const amount1Min = params.amount1Min
        ? parseUnits(params.amount1Min, decimals1)
        : toMin(amount1Desired, params.slippageBps);

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
      const recipient: Address = (params.recipient ?? account.address) as Address;

      // Check balances
      const [balance0, balance1] = await Promise.all([
        publicClient.readContract({
          address: params.token0 as Address,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [account.address as Address],
        }),
        publicClient.readContract({
          address: params.token1 as Address,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [account.address as Address],
        }),
      ]);

      if (balance0 < amount0Desired) {
        throw new Error(
          `Insufficient ${params.token0} balance: have ${balance0}, need ${amount0Desired}`
        );
      }
      if (balance1 < amount1Desired) {
        throw new Error(
          `Insufficient ${params.token1} balance: have ${balance1}, need ${amount1Desired}`
        );
      }

      // Approve tokens
      console.log('🔄 Approving tokens...');
      await ensureAllowance({
        publicClient,
        walletClient,
        owner: account.address as Address,
        token: params.token0 as Address,
        amount: amount0Desired,
      });
      await ensureAllowance({
        publicClient,
        walletClient,
        owner: account.address as Address,
        token: params.token1 as Address,
        amount: amount1Desired,
      });

      // Create & initialize pool if needed
      if (params.sqrtPriceX96 && BigInt(params.sqrtPriceX96) > 0n) {
        console.log('🔄 Creating and initializing pool...');
        const initTx = await walletClient.writeContract({
          address: ALGEBRA_POSITION_MANAGER,
          abi: algebraPositionManagerAbi,
          functionName: 'createAndInitializePoolIfNecessary',
          args: [params.token0 as Address, params.token1 as Address, BigInt(params.sqrtPriceX96)],
          account,
        });
        console.log('🌊 Pool create+init tx:', initTx);
        await publicClient.waitForTransactionReceipt({ hash: initTx });
      }

      // Mint position
      console.log('🔄 Minting position...');
      const mintTxHash = await walletClient.writeContract({
        address: ALGEBRA_POSITION_MANAGER,
        abi: algebraPositionManagerAbi,
        functionName: 'mint',
        args: [
          {
            token0: params.token0 as Address,
            token1: params.token1 as Address,
            tickLower: params.tickLower,
            tickUpper: params.tickUpper,
            amount0Desired,
            amount1Desired,
            amount0Min,
            amount1Min,
            recipient,
            deadline,
          },
        ],
        account,
        value: 0n,
      });

      console.log('🆕 Mint position tx:', mintTxHash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash: mintTxHash });

      // Try to decode the ERC721 Transfer event to extract tokenId
      let mintedTokenId: bigint | undefined;
      try {
        for (const log of receipt.logs) {
          // Only logs from the NFPM
          if (log.address.toLowerCase() !== ALGEBRA_POSITION_MANAGER.toLowerCase()) continue;

          const decoded = decodeEventLog({
            abi: [erc721TransferEvent],
            data: log.data,
            topics: log.topics,
            strict: false,
          });

          if (decoded.eventName === 'Transfer') {
            const from = decoded.args[0] as Address;
            const to = decoded.args[1] as Address;
            const tokenId = decoded.args[2] as bigint;
            // Mint is from 0x0 to recipient
            if (
              from.toLowerCase() === zeroAddress &&
              to.toLowerCase() === recipient.toLowerCase()
            ) {
              mintedTokenId = tokenId;
              break;
            }
          }
        }
      } catch {
        // decoding is best-effort; ignore if it fails
      }

      // Prepare result
      const result: TransactionResult = {
        success: true,
        transactionHash: mintTxHash,
        gasUsed: receipt.gasUsed.toString(),
        error: undefined,
      };

      console.log(`🎉 Liquidity supply completed successfully!`);
      console.log(`   Transaction Hash: ${result.transactionHash}`);
      console.log(`   Gas Used: ${result.gasUsed}`);
      console.log(`   Position ID: ${mintedTokenId || 'unknown'}`);
      console.log(`   Block Number: ${receipt.blockNumber}`);

      return createSuccessTask(
        'supplyLiquidity',
        [
          {
            artifactId: 'supplyLiquidity-' + Date.now(),
            parts: [
              {
                kind: 'text',
                text: JSON.stringify({
                  ...result,
                  positionId: mintedTokenId?.toString(),
                  blockNumber: receipt.blockNumber.toString(),
                }),
              },
            ],
          },
        ],
        'Operation completed successfully'
      );
    } catch (error) {
      console.error('❌ Error supplying liquidity:', error);
      return createErrorTask(
        'supplyLiquidity',
        error instanceof Error ? error : new Error(`Failed to supply liquidity: ${error}`)
      );
    }
  },
};
