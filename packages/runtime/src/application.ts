import type { ChatService } from './chat/chat.service.js';
import type { Configuration } from './config.js';
import type { ContactDto } from './contact.dto.js';
import { createPipeline } from './http/pipeline.js';
import { createQuotas, type QuotaFactory } from './http/quotas.js';
import { allOperations, type Services } from './http/router.js';
import { createQuota } from './quota.js';
import type { SubscriptionSender } from './subscriptions/facade.js';

/**
 * Cadena HTTP completa sin ingress ni configuración remota, con dependencias fijas.
 * Las seis operaciones comparten el mismo pipeline que las funciones administradas.
 */
export function createApplication(
  config: Configuration,
  sendContact?: (dto: ContactDto) => Promise<void>,
  sendSubscription?: SubscriptionSender,
  chat?: Pick<ChatService, 'reply'>,
  quotaFactory: QuotaFactory = createQuota,
) {
  const services: Services = {
    quota: createQuotas(quotaFactory),
    sendContact,
    sendSubscription,
    chat,
  };
  return createPipeline({
    config,
    operations: allOperations,
    prepare: async () => ({ services }),
  });
}
