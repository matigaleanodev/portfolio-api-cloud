import { stageRuntimePackage } from './package.mjs';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const directory = mkdtempSync(join(tmpdir(), 'portfolio-api-cloud-package-'));

try {
  stageRuntimePackage(directory);

  cpSync(new URL('test/block-network.mjs', root), join(directory, 'block-network.mjs'));
  cpSync(new URL('test/package-smoke.mjs', root), join(directory, 'package-smoke.mjs'));

  writeFileSync(
    join(directory, '.env'),
    'CORS_ORIGIN=https://dotenv.example.invalid\nPORTFOLIO_CLOUD_API_URL=https://dotenv.example.invalid\n',
  );

  execFileSync(process.execPath, ['--import', './block-network.mjs', './package-smoke.mjs'], {
    cwd: directory,
    stdio: 'inherit',
    env: { NODE_ENV: 'test', AWS_EC2_METADATA_DISABLED: 'true' },
  });
} finally {
  rmSync(directory, { recursive: true, force: true });
}
