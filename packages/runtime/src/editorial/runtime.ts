import type { FunctionContract } from '@portfolio-api-cloud/contracts/functions';
import {
  createParameterReader,
  createRuntimeConfiguration,
  type ParameterReader,
  type RuntimeEnvironment,
} from '../runtime-config.js';

export type SensitiveConfiguration = RuntimeEnvironment;

/**
 * Claves sensibles de la función desde su parámetro SSM (`RUNTIME_PARAMETER_NAME`), con la cache
 * y validación del loader compartido. Solo se pasa la referencia: la configuración no sensible se
 * lee aparte para no mezclarla con la validación de chat/api.
 */
export function createSensitiveConfiguration(
  contract: FunctionContract,
  env: RuntimeEnvironment = process.env,
  read?: ParameterReader,
): () => Promise<SensitiveConfiguration> {
  let load: (() => Promise<SensitiveConfiguration>) | undefined;
  return () => {
    load ??= createRuntimeConfiguration(
      { RUNTIME_PARAMETER_NAME: env.RUNTIME_PARAMETER_NAME },
      read ?? createParameterReader(),
      contract,
    );
    return load();
  };
}

/** Reutiliza dependencias mientras el snapshot de configuración sensible no cambie. */
export function memoizeBySnapshot<T>(
  load: () => Promise<SensitiveConfiguration>,
  build: (sensitive: SensitiveConfiguration) => T,
): () => Promise<T> {
  let cached: { sensitive: SensitiveConfiguration; value: T } | undefined;
  return async () => {
    const sensitive = await load();
    if (cached?.sensitive !== sensitive) cached = { sensitive, value: build(sensitive) };
    return cached.value;
  };
}
