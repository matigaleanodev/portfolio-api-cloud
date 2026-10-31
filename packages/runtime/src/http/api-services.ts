import { readContactConfiguration, readSubscriptionConfiguration } from '../config.js';
import { createContactSender, createResendProvider } from '../contact.js';
import type { RuntimeEnvironment } from '../runtime-config.js';
import { createSharedQuota } from '../shared-control.js';
import { createSubscriptionSender } from '../subscriptions/facade.js';
import { createSubscriberStore } from '../subscriptions/store.js';
import type { CompositionContext } from './managed.js';
import { createQuotas } from './quotas.js';
import type { Services } from './router.js';

/** Contacto y suscripciones con las claves del parámetro api. */
export function createApiServices(
  values: RuntimeEnvironment,
  { controlStore, dependencies }: CompositionContext,
): Services {
  const contact = readContactConfiguration(values);
  const subscribers = dependencies.subscribers ?? ((config) => createSubscriberStore(config));
  return {
    quota: createQuotas(createSharedQuota(controlStore(), values.QUOTA_KEY_SECRET!)),
    sendContact: createContactSender(
      contact,
      dependencies.sendEmail ?? createResendProvider(contact),
    ),
    sendSubscription: createSubscriptionSender(subscribers(readSubscriptionConfiguration(values))),
  };
}
