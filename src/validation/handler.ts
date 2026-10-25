import { readFileSync } from 'node:fs';
import { createManagedHandler } from '../handler.js';
import { createValidationProviders, readScenario, validateEnvironment } from './providers.js';

validateEnvironment(process.env);
const fixture: unknown = JSON.parse(
  readFileSync(new URL('../../validation.json', import.meta.url), 'utf8'),
);
if (
  !fixture ||
  typeof fixture !== 'object' ||
  !('scenario' in fixture) ||
  !('version' in fixture) ||
  fixture.version !== 1
)
  throw new Error('Missing validation fixture');
// El escenario pertenece al asset revisado; ninguna entrada HTTP lo selecciona.
export const handler = createManagedHandler(
  process.env,
  createValidationProviders(readScenario(fixture.scenario)),
);
