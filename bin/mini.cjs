#!/usr/bin/env node
// CJS wrapper — spawns Node with the ESM dist/index.js
const { spawnSync } = require('child_process');
const { resolve }   = require('path');

// Strip the insecure TLS env var — it was likely set globally by npm/nvm
// and causes a noisy Node.js warning that pollutes the CLI output.
const env = { ...process.env };
delete env['NODE_TLS_REJECT_UNAUTHORIZED'];

const target = resolve(__dirname, '../dist/index.js');
const result = spawnSync(process.execPath, [target, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});
process.exit(result.status ?? 0);
