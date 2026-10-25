export interface Configuration {
  readonly corsOrigins: boolean | readonly string[];
}

export function readConfiguration(env: Readonly<Record<string, string | undefined>>): Configuration {
  const value = env.CORS_ORIGIN?.trim();
  const origins = value?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [];
  const corsOrigins = value === '*' ? true : origins.length > 0 ? Object.freeze(origins) : false;
  return Object.freeze({ corsOrigins });
}
