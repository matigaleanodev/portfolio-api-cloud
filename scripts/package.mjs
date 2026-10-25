import { cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);

export function stageRuntimePackage(directory, scenario) {
  if (
    scenario !== undefined &&
    !['success', 'error', 'pending-body', 'ambiguous'].includes(scenario)
  )
    throw new Error('Invalid validation scenario');
  for (const name of ['dist', 'fallback', 'package.json', 'LICENSE']) {
    cpSync(
      new URL(name === 'dist' && scenario ? '.tmp/validation-dist' : name, root),
      join(directory, name),
      { recursive: true },
    );
  }

  if (!scenario && existsSync(join(directory, 'dist/validation')))
    throw new Error('Validation code in normal package');
  if (scenario)
    writeFileSync(
      join(directory, 'validation.json'),
      JSON.stringify({ version: 1, scenario }) + '\n',
    );

  const lock = JSON.parse(readFileSync(new URL('package-lock.json', root), 'utf8'));

  for (const [path, metadata] of Object.entries(lock.packages)) {
    if (!path.startsWith('node_modules/') || metadata.dev) {
      continue;
    }

    if (/^node_modules\/(?:@nestjs\/|express(?:\/|$))/.test(path)) {
      throw new Error(`Dependencia inesperada: ${path}`);
    }

    cpSync(new URL(path, root), join(directory, path), { recursive: true });
  }
}
