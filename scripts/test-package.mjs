import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const directory = mkdtempSync(join(tmpdir(), 'portfolio-api-cloud-package-'));
try {
  cpSync(new URL('dist/', root), join(directory, 'dist'), { recursive: true });
  cpSync(new URL('package.json', root), join(directory, 'package.json'));
  cpSync(new URL('test/block-network.mjs', root), join(directory, 'block-network.mjs'));
  cpSync(new URL('test/package-smoke.mjs', root), join(directory, 'package-smoke.mjs'));
  writeFileSync(join(directory, '.env'), 'CORS_ORIGIN=https://dotenv.example.invalid\n');
  execFileSync(process.execPath, ['--import', './block-network.mjs', './package-smoke.mjs'], {
    cwd: directory, stdio: 'inherit', env: { NODE_ENV: 'test', AWS_EC2_METADATA_DISABLED: 'true' },
  });
} finally {
  rmSync(directory, { recursive: true, force: true });
}
