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
  const required = ['RESEND_API_KEY', 'CONTACT_FROM_EMAIL', 'CONTACT_TO_EMAIL'] as const;
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length)
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  // El origen comprueba trim para presencia pero conserva los valores al enviar.
  return Object.freeze({
    apiKey: env.RESEND_API_KEY!,
    fromEmail: env.CONTACT_FROM_EMAIL!,
    toEmail: env.CONTACT_TO_EMAIL!,
  });
}

export interface SubscriptionConfiguration {
  readonly baseUrl: string;
}

export function readSubscriptionConfiguration(
  env: Readonly<Record<string, string | undefined>>,
): SubscriptionConfiguration {
  const value = env.PORTFOLIO_CLOUD_API_URL?.trim();
  if (!value) throw new Error('Missing required environment variable: PORTFOLIO_CLOUD_API_URL');
  return Object.freeze({ baseUrl: value.replace(/\/+$/, '') });
}
