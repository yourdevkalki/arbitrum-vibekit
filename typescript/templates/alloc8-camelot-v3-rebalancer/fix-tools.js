#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const toolsDir = 'src/tools';
const toolFiles = [
  'getLiquidityPools.ts',
  'getTokenMarketData.ts',
  'withdrawLiquidity.ts',
  'supplyLiquidity.ts',
  'swapTokens.ts',
  'getWalletBalances.ts',
];

// Fix patterns for all tools
const fixes = [
  // Change handler to execute
  {
    pattern: /handler: async \((.*?), context: RebalancerContext\) => {/g,
    replacement: 'execute: async ($1, context: any) => {',
  },

  // Fix return type in VibkitToolDefinition
  {
    pattern:
      /VibkitToolDefinition<\s*typeof \w+ParametersSchema,\s*(\w+\[\]|\w+),\s*RebalancerContext\s*>/g,
    replacement:
      'VibkitToolDefinition<typeof $1ParametersSchema, Task | Message, RebalancerContext>',
  },

  // Fix MCP client access
  {
    pattern: /context\.mcpClients\.ember\.request/g,
    replacement: "context.mcpClients['ember-onchain'].request",
  },

  // Fix createSuccessTask calls - add artifacts wrapper
  {
    pattern: /return createSuccessTask\('(\w+)', (.+?)\);/g,
    replacement: `return createSuccessTask('$1', [{ artifactId: '$1-' + Date.now(), parts: [{ kind: 'text', text: JSON.stringify($2) }] }], 'Operation completed successfully');`,
  },

  // Fix createErrorTask calls
  {
    pattern: /return createErrorTask\('(\w+)', `(.+?)`\);/g,
    replacement: `return createErrorTask('$1', error instanceof Error ? error : new Error('$2'));`,
  },

  // Fix createErrorTask calls with template literals
  {
    pattern: /return createErrorTask\('(\w+)', `(.+?)\$\{error\}`\);/g,
    replacement: `return createErrorTask('$1', error instanceof Error ? error : new Error('$2' + error));`,
  },
];

toolFiles.forEach(fileName => {
  const filePath = path.join(toolsDir, fileName);

  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${fileName} - file not found`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');

  fixes.forEach(fix => {
    content = content.replace(fix.pattern, fix.replacement);
  });

  fs.writeFileSync(filePath, content);
  console.log(`Fixed ${fileName}`);
});

console.log('Tool fixes complete!');
