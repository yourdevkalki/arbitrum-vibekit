#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Files to fix
const filesToFix = ['src/tasks/ActiveModeTask.ts', 'src/tasks/BaseRebalanceTask.ts'];

function fixFile(filePath) {
  console.log(`Fixing ${filePath}...`);

  let content = fs.readFileSync(filePath, 'utf8');

  // Fix: Replace empty {} with z.any()
  content = content.replace(/,\s*{}\s*\)/g, ', z.any())');

  // Fix: Add z import if not present
  if (!content.includes('import { z }')) {
    content = content.replace(
      /import type \{([^}]+)\} from '@google-a2a\/types';/,
      "import { z } from 'zod';\nimport type {$1} from '@google-a2a/types';"
    );
  }

  // Fix: Add proper typing for response
  content = content.replace(
    /const (\w+) = await this\.context\.mcpClients\['ember-onchain'\]\.request\(/g,
    "const $1 = await this.context.mcpClients['ember-onchain']!.request("
  );

  // Fix: Add response type assertion
  content = content.replace(/if \(!(\w+)\.result\?\./g, 'if (!(($1 as any).result)?.');

  content = content.replace(/(\w+)\.result\.content/g, '(($1 as any).result).content');

  // Fix: Add position null check
  content = content.replace(
    /this\.context\.monitoringState\.currentPositions = \[position\.positionId\];/,
    'this.context.monitoringState.currentPositions = position ? [position.positionId] : [];'
  );

  content = content.replace(
    /return evaluateRebalanceNeed\(\s*position,/,
    'return position ? evaluateRebalanceNeed(\n        position,'
  );

  fs.writeFileSync(filePath, content);
  console.log(`Fixed ${filePath}`);
}

// Run fixes
filesToFix.forEach(fixFile);

console.log('All MCP call fixes applied!');
