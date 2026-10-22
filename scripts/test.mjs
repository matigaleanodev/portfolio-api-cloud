import { readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
rmSync(new URL('.tmp/tests/', root), { recursive: true, force: true });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc'], { cwd: root, stdio: 'inherit' });
const tests = readdirSync(new URL('.tmp/tests/test/', root))
  .filter((name) => name.endsWith('.test.js')).map((name) => `.tmp/tests/test/${name}`);
execFileSync(process.execPath, ['--import', './test/block-network.mjs', '--test', ...tests], {
  cwd: root,
  stdio: 'inherit',
  env: { NODE_ENV: 'test', AWS_EC2_METADATA_DISABLED: 'true' },
});
