import { fileURLToPath } from 'node:url';

/**
 * Utilidades de desarrollo fuera del build y de los tests. Se compilan con
 * `npx tsc -p packages/runtime/dev` y se ejecutan desde `.tmp/dev/dev/`.
 * Sin `--execute` ningún script contacta servicios: solo muestra lo que haría.
 */
export const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

export function parseFlags(allowed: readonly string[]): Set<string> {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => !allowed.includes(arg));
  if (unknown.length) throw new Error(`Unknown arguments: ${unknown.join(' ')}`);
  return new Set(args);
}

export function dryRun(description: string, payload: unknown): void {
  console.log(JSON.stringify({ dryRun: true, description, payload }, null, 2));
  console.log('Sin efectos. Repetir con --execute para usar la configuración real del ambiente.');
}

export function fail(): void {
  // Sin detalles del proveedor: pueden incluir claves con emails.
  console.error('Dev script failed; inspect configuration.');
  process.exitCode = 1;
}
