import { createApiHandler } from '../handlers/api.js';
import { createValidationProviders, loadScenario, validateEnvironment } from './providers.js';

validateEnvironment(process.env, 'api');
export const handler = createApiHandler(process.env, createValidationProviders(loadScenario()));
