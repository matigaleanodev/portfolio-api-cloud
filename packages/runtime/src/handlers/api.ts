import { createApiServices } from '../http/api-services.js';
import { createChatServices } from '../http/chat-services.js';
import { createManagedHandler, type RuntimeDependencies } from '../http/managed.js';
import type { RuntimeEnvironment } from '../runtime-config.js';

/** Función api: health, contacto, suscripciones, OPTIONS, 404 y variantes no canónicas de chat. */
export const createApiHandler = (env: RuntimeEnvironment, dependencies: RuntimeDependencies = {}) =>
  createManagedHandler(env, dependencies, {
    kind: 'api',
    main: createApiServices,
    chat: createChatServices,
  });

export const handler = createApiHandler(process.env);
