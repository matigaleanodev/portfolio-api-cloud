import { r2Region } from '@portfolio-api-cloud/contracts/storage';

export interface Configuration {
  readonly corsOrigins: boolean | readonly string[];
}

export function readConfiguration(
  env: Readonly<Record<string, string | undefined>>,
): Configuration {
  const value = env.CORS_ORIGIN?.trim();
  const origins =
    value
      ?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];
  const corsOrigins = value === '*' ? true : origins.length > 0 ? Object.freeze(origins) : false;
  return Object.freeze({ corsOrigins });
}

export interface ContactConfiguration {
  readonly apiKey: string;
  readonly fromEmail: string;
  readonly toEmail: string;
}

export function readContactConfiguration(
  env: Readonly<Record<string, string | undefined>>,
): ContactConfiguration {
  const required = ['RESEND_CONTACT_API_KEY', 'CONTACT_FROM_EMAIL', 'CONTACT_TO_EMAIL'] as const;
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length)
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  // El origen comprueba trim para presencia pero conserva los valores al enviar.
  return Object.freeze({
    apiKey: env.RESEND_CONTACT_API_KEY!,
    fromEmail: env.CONTACT_FROM_EMAIL!,
    toEmail: env.CONTACT_TO_EMAIL!,
  });
}

/** Bucket R2 privado de suscriptores y credenciales propias (separadas del conocimiento). */
export interface SubscriptionConfiguration {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export function readSubscriptionConfiguration(
  env: Readonly<Record<string, string | undefined>>,
): SubscriptionConfiguration {
  const required = [
    'SUBSCRIBERS_R2_ENDPOINT',
    'SUBSCRIBERS_R2_BUCKET',
    'R2_SUBSCRIBERS_ACCESS_KEY_ID',
    'R2_SUBSCRIBERS_SECRET_ACCESS_KEY',
  ] as const;
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`Missing subscription configuration: ${missing.join(', ')}`);
  const endpoint = new URL(env.SUBSCRIBERS_R2_ENDPOINT!.trim());
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password)
    throw new Error('Invalid subscribers endpoint');
  const bucket = env.SUBSCRIBERS_R2_BUCKET!.trim();
  // Igual que portfolio-cloud: los suscriptores nunca comparten el bucket público.
  if (bucket === env.R2_BUCKET?.trim()) throw new Error('Subscribers bucket must be private');
  return Object.freeze({
    endpoint: endpoint.href.replace(/\/$/, ''),
    region: env.R2_REGION?.trim() || r2Region,
    bucket,
    accessKeyId: env.R2_SUBSCRIBERS_ACCESS_KEY_ID!.trim(),
    secretAccessKey: env.R2_SUBSCRIBERS_SECRET_ACCESS_KEY!.trim(),
  });
}
