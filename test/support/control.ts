import type {
  AiReservation,
  ControlStore,
  Counter,
} from '../../packages/runtime/src/shared-control.js';
import { createSubscriberStore } from '../../packages/runtime/src/subscriptions/store.js';
import type { SubscriptionConfiguration } from '../../packages/runtime/src/config.js';
export class SimulatedControlStore implements ControlStore {
  readonly records = new Map<string, Counter>();
  readonly reservations: AiReservation[] = [];
  unavailable = false;
  rejectReservations = false;
  async get(key: string) {
    if (this.unavailable) throw new Error('Storage unavailable: sensitive detail');
    const value = this.records.get(key);
    return value ? { ...value } : null;
  }
  async replace(key: string, previous: Counter | null, next: Counter) {
    if (this.unavailable) throw new Error('Storage unavailable');
    if ((this.records.get(key)?.version ?? null) !== (previous?.version ?? null)) return false;
    this.records.set(key, { ...next });
    return true;
  }
  async reserveAi(reservation: AiReservation) {
    if (this.unavailable) throw new Error('Storage unavailable');
    if (this.rejectReservations) return false;
    const updates = reservation.keys.map((key, index) => {
      const used = (this.records.get(key)?.used ?? 0) + (index === 2 ? reservation.cost : 1);
      return { key, used, limit: index === 2 ? reservation.budget : 5 };
    });
    if (updates.some(({ used, limit }) => used > limit)) return false;
    for (const { key, used } of updates)
      this.records.set(key, {
        used,
        version: String(used),
        expiresAt: reservation.expiresAt,
        blocked: false,
      });
    this.reservations.push(reservation);
    return true;
  }
}
/**
 * Claves sensibles simuladas. Los tests usan el mismo JSON para los parámetros api y chat:
 * las claves compartidas (cuota, origen) coinciden como en producción.
 */
export const runtimeSecret = (): Record<string, string> => ({
  RESEND_CONTACT_API_KEY: 'fake',
  QUOTA_KEY_SECRET: 's'.repeat(32),
  OPENAI_API_KEY: 'fake',
  R2_SUBSCRIBERS_ACCESS_KEY_ID: 'fake',
  R2_SUBSCRIBERS_SECRET_ACCESS_KEY: 'fake',
});
/** Configuración no sensible declarada por CDK como variables de entorno. */
export const runtimeConfiguration = () => ({
  CONTACT_FROM_EMAIL: 'from@example.invalid',
  CONTACT_TO_EMAIL: 'to@example.invalid',
  SUBSCRIBERS_R2_ENDPOINT: 'https://r2.example.invalid',
  SUBSCRIBERS_R2_BUCKET: 'subscribers',
  AI_DAILY_BUDGET_MICROUSD: '1000000',
  AI_PRICING_VALID_UNTIL: new Date(Date.now() + 86400_000).toISOString(),
});
export const productionParameter = '/portfolio/prod/api';
export const managedEnvironment = {
  TRUSTED_API_ID: 'local',
  QUOTA_TABLE_NAME: 'test-control',
  RUNTIME_PARAMETER_NAME: productionParameter,
  CHAT_PARAMETER_NAME: '/portfolio/prod/chat',
  CORS_ORIGIN: 'https://frontend.example.invalid',
  ...runtimeConfiguration(),
};
/** Entorno de la función chat: lee solo su parámetro. */
export const chatEnvironment = {
  TRUSTED_API_ID: 'local',
  QUOTA_TABLE_NAME: 'test-control',
  RUNTIME_PARAMETER_NAME: '/portfolio/prod/chat',
  CORS_ORIGIN: 'https://frontend.example.invalid',
  AI_DAILY_BUDGET_MICROUSD: '1000000',
  AI_PRICING_VALID_UNTIL: new Date(Date.now() + 86400_000).toISOString(),
};

/**
 * Doble del cliente S3 en el límite del store de suscriptores: objetos en memoria por bucket/clave,
 * sin red. `failure` simula un error del servicio y `pending` deja la operación sin respuesta
 * hasta el abort.
 */
export class SimulatedObjectStorage {
  readonly objects = new Map<string, string>();
  readonly commands: { name: string; input: Record<string, unknown> }[] = [];
  failure: Error | undefined;
  pending = false;
  async send(command: object, options?: { abortSignal?: AbortSignal }): Promise<unknown> {
    const { name } = command.constructor;
    const input = (command as { input: Record<string, unknown> }).input;
    this.commands.push({ name, input });
    if (this.pending)
      return new Promise((_resolve, reject) => {
        const signal = options?.abortSignal;
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    if (this.failure) throw this.failure;
    const key = `${String(input.Bucket)}/${String(input.Key)}`;
    if (name === 'HeadObjectCommand') {
      if (!this.objects.has(key)) throw Object.assign(new Error('missing'), { name: 'NotFound' });
      return {};
    }
    if (name === 'PutObjectCommand') this.objects.set(key, String(input.Body));
    else if (name === 'DeleteObjectCommand') this.objects.delete(key);
    else throw new Error(`Unexpected command ${name}`);
    return {};
  }
}

/** Dependencia `subscribers` del handler administrado con el store real sobre el doble S3. */
export const simulatedSubscribers = (storage = new SimulatedObjectStorage()) => ({
  storage,
  subscribers: (config: SubscriptionConfiguration) => createSubscriberStore(config, storage),
});
