import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('../packages/runtime/', import.meta.url)));
