import { rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const tsc = fileURLToPath(new URL('node_modules/typescript/bin/tsc', root));

rmSync(new URL('.tmp/tests/', root), { recursive: true, force: true });

execFileSync(process.execPath, [tsc, '-p', 'tsconfig.json'], { cwd: root, stdio: 'inherit' });

execFileSync(process.execPath, [tsc, '-p', 'tsconfig.infra.json', '--outDir', '.tmp/tests'], {
  cwd: root,
  stdio: 'inherit',
});

execFileSync(
  process.execPath,
  [
    fileURLToPath(new URL('node_modules/vitest/vitest.mjs', root)),
    'run',
    '--config',
    'vitest.config.mjs',
    '--configLoader',
    'native',
    ...process.argv.slice(2),
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      NODE_ENV: 'test',
      AWS_EC2_METADATA_DISABLED: 'true',
      PATH: '/usr/local/bin:/usr/bin:/bin',
    },
  },
);
