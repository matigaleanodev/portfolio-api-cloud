import { fileURLToPath } from 'node:url';

/** Ruta del checkout desde el test compilado en `.tmp/tests/test/support/`. */
export const repositoryPath = (relative: string) =>
  fileURLToPath(new URL(`../../../../${relative}`, import.meta.url));
