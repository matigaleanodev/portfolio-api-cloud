import { createChatHandler } from '../handlers/chat.js';
import { createValidationProviders, loadScenario, validateEnvironment } from './providers.js';

validateEnvironment(process.env, 'chat');
export const handler = createChatHandler(process.env, createValidationProviders(loadScenario()));
