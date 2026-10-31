import { createChatServices } from '../http/chat-services.js';
import { createManagedHandler, type RuntimeDependencies } from '../http/managed.js';
import type { RuntimeEnvironment } from '../runtime-config.js';

/** Función chat: POST /api/chat y GET/HEAD /api/chat/starters; el resto responde 404. */
export const createChatHandler = (
  env: RuntimeEnvironment,
  dependencies: RuntimeDependencies = {},
) =>
  createManagedHandler(env, dependencies, {
    kind: 'chat',
    main: createChatServices,
    chat: createChatServices,
  });

export const handler = createChatHandler(process.env);
