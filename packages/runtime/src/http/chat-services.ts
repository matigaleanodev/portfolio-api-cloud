import { createChat } from '../chat/chat.providers.js';
import { aiConfigurationValid, type RuntimeEnvironment } from '../runtime-config.js';
import { createAiAdmission, createSharedQuota } from '../shared-control.js';
import type { CompositionContext } from './managed.js';
import { createQuotas } from './quotas.js';
import type { Services } from './router.js';

/**
 * Chat con las claves del parámetro chat: misma tabla, prefijos y HMAC de cuota que la función
 * chat, y la misma admisión/reserva monetaria previa a IA.
 */
export function createChatServices(
  values: RuntimeEnvironment,
  { controlStore, dependencies }: CompositionContext,
): Services {
  const ai = aiConfigurationValid(values);
  const admission = createAiAdmission(
    controlStore(),
    values.QUOTA_KEY_SECRET!,
    ai ? Number(values.AI_DAILY_BUDGET_MICROUSD) * 1000 : 0,
  );
  return {
    quota: createQuotas(createSharedQuota(controlStore(), values.QUOTA_KEY_SECRET!)),
    chat: createChat(
      {
        ...values,
        OPENAI_CHAT_MODEL: 'gpt-6-luna',
        OPENAI_API_KEY: ai ? values.OPENAI_API_KEY : undefined,
      },
      dependencies.request ?? fetch,
      process.cwd(),
      admission,
      true,
    ),
  };
}
