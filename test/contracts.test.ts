import { expect, test } from 'vitest';
import { matchesRoute, routes } from '@portfolio-api-cloud/contracts/routes';
import { aiRequestLimit, quotas } from '@portfolio-api-cloud/contracts/quotas';
import { functions } from '@portfolio-api-cloud/contracts/functions';
import {
  environmentKeys,
  isRuntimeParameterName,
  parameterKeys,
  runtimeParameterNames,
  secretKeys,
} from '@portfolio-api-cloud/contracts/configuration';
import { storageKeys } from '@portfolio-api-cloud/contracts/storage';

test('Dado el catálogo de rutas, cuando se inspecciona, entonces publica las seis operaciones con su id, grupo y variantes compatibles', () => {
  expect(Object.keys(routes)).toEqual([
    'health',
    'contact',
    'subscribe',
    'unsubscribe',
    'chatStarters',
    'chat',
  ]);
  for (const [id, route] of Object.entries(routes)) {
    expect(route.id).toBe(id);
    expect(route.path).toMatch(/^\/api\//);
    expect(route.group).toBe(id.startsWith('chat') ? 'chat' : 'api');
    for (const method of route.methods) {
      for (const path of [route.path, `${route.path}/`, route.path.toUpperCase()])
        expect(matchesRoute(route, method, path)).toBe(true);
      for (const path of [`${route.path}//`, `${route.path}/x`, `/v1${route.path}`])
        expect(matchesRoute(route, method, path)).toBe(false);
    }
    expect(matchesRoute(route, 'PUT', route.path)).toBe(false);
  }
  expect(matchesRoute(routes.chat, 'POST', '/api/chat/starters')).toBe(false);
});

test('Dadas las cuotas, cuando se comparan con las operaciones, entonces cubren todo menos health con límites y prefijos vigentes', () => {
  expect(Object.keys(quotas).sort()).toEqual(
    Object.keys(routes)
      .filter((id) => id !== 'health')
      .sort(),
  );
  expect(quotas).toEqual({
    contact: { limit: 5, windowSeconds: 3600, prefix: 'contact' },
    subscribe: { limit: 10, windowSeconds: 3600, prefix: 'subscribe' },
    unsubscribe: { limit: 10, windowSeconds: 3600, prefix: 'unsubscribe' },
    chatStarters: { limit: 20, windowSeconds: 60, prefix: 'starters' },
    chat: { limit: 20, windowSeconds: 60, prefix: 'chat' },
  });
  expect(new Set(Object.values(quotas).map((quota) => quota.prefix)).size).toBe(5);
  expect(aiRequestLimit).toBe(5);
});

test('Dado el catálogo de funciones, cuando se revisa, entonces es coherente en nombres, artifacts y claves por función', () => {
  const entries = Object.values(functions);
  expect(entries).toHaveLength(6);
  expect(new Set(entries.map((entry) => entry.logicalId)).size).toBe(6);
  expect(new Set(entries.map((entry) => entry.functionName)).size).toBe(6);
  expect(functions.api).toMatchObject({
    logicalId: 'Handler',
    functionName: 'portfolio-api-cloud-test',
    handler: 'dist/handlers/api.handler',
    artifact: 'api',
    memorySize: 512,
    timeoutSeconds: 28,
    architecture: 'arm64',
  });
  expect(functions.generateOg.architecture).toBe('x86_64');
  // Las funciones HTTP terminan antes del timeout de 29 s de la integración.
  for (const entry of [functions.api, functions.chat])
    expect(entry.timeoutSeconds).toBeLessThan(29);
  const used = new Set<string>();
  for (const entry of entries) {
    expect(entry.functionName).toMatch(/^portfolio-api-cloud-test(?:-[a-z-]+)?$/);
    expect(entry.handler).toMatch(/^dist\/[a-z/-]+\.handler$/);
    expect(entry.timeoutSeconds).toBeGreaterThan(0);
    for (const key of [...entry.requiredSecrets, ...entry.optionalSecrets]) {
      expect(secretKeys).toContain(key);
      used.add(key);
    }
    expect(
      entry.requiredSecrets.filter((key) =>
        (entry.optionalSecrets as readonly string[]).includes(key),
      ),
    ).toEqual([]);
  }
  expect([...used].sort()).toEqual([...secretKeys].sort());
  // Las claves de chat no son requisito de api: su ausencia no tumba contacto ni health.
  expect(functions.api.requiredSecrets).not.toContain('OPENAI_API_KEY');
  expect(functions.api.requiredSecrets).not.toContain('R2_KNOWLEDGE_ACCESS_KEY_ID');
});

test('Dada la configuración, cuando se separan claves, entonces secreto y ambiente no comparten nombres', () => {
  expect(secretKeys.filter((key) => (environmentKeys as readonly string[]).includes(key))).toEqual(
    [],
  );
  expect(new Set(secretKeys).size).toBe(secretKeys.length);
  expect(new Set(environmentKeys).size).toBe(environmentKeys.length);
});

test('Dados los parámetros SSM, cuando se evalúan los nombres, entonces solo admite la lista exacta segmentada', () => {
  expect(runtimeParameterNames).toEqual({
    api: '/portfolio/prod/api',
    chat: '/portfolio/prod/chat',
    editorial: '/portfolio/prod/editorial',
    notifications: '/portfolio/prod/notifications',
    validationApi: '/portfolio/validation/api',
    validationChat: '/portfolio/validation/chat',
  });
  for (const name of Object.values(runtimeParameterNames))
    expect(isRuntimeParameterName(name)).toBe(true);
  for (const name of [
    '/portfolio/prod/app-properties',
    '/portfolio/prod/api/',
    'portfolio/prod/api',
    '/PORTFOLIO/prod/api',
    'arn:aws:ssm:us-east-1:650387442642:parameter/portfolio/prod/api',
    '',
    undefined,
  ])
    expect(isRuntimeParameterName(name)).toBe(false);
  expect(environmentKeys).toContain('RUNTIME_PARAMETER_NAME');
  expect(environmentKeys).toContain('CHAT_PARAMETER_NAME');
  expect(environmentKeys).not.toContain('RUNTIME_SECRET_ARN' as never);
  expect(environmentKeys).not.toContain('PORTFOLIO_CLOUD_API_URL' as never);
});

test('Dadas las claves por parámetro, cuando se comparan con el catálogo, entonces cubren todas sin credenciales ajenas', () => {
  expect([...new Set(Object.values(parameterKeys).flat())].sort()).toEqual([...secretKeys].sort());
  expect(parameterKeys.api).not.toContain('OPENAI_API_KEY');
  expect(parameterKeys.chat).not.toContain('RESEND_CONTACT_API_KEY');
  expect(parameterKeys.editorial.every((key) => key.startsWith('R2_MEDIA_'))).toBe(true);
});

test('Dadas claves R2, cuando se consultan, entonces conservan las rutas publicadas por portfolio-cloud', () => {
  expect(storageKeys).toEqual({
    chatKnowledge: 'artifacts/chat/knowledge.json',
    processedPostsState: 'state/posts.json',
    ogPrefix: 'og/',
    subscribersPrefix: 'subscribers/',
    subscriberSuffix: '.json',
  });
});
