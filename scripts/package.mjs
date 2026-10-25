import { cpSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);

export function stageRuntimePackage(directory) {
  for (const name of ['dist', 'package.json', 'LICENSE']) {
    cpSync(new URL(name, root), join(directory, name), { recursive: true });
  }

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
