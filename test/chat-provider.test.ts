import { beforeEach, test, vi, expect } from 'vitest';
import { OpenAiService } from '../src/chat/openai.service.js';
import { recordChatMetric } from '../src/chat/chat-metrics.js';
import type { ChatCompletionPayload } from '../src/chat/chat.types.js';

beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
const payload: ChatCompletionPayload = {
  userMessage: 'Pregunta privada',
  contextItems: [
    {
      sourceType: 'project',
      sourceId: 'demo',
      title: 'Proyecto',
      text: 'Hechos verificados',
      tags: ['TypeScript'],
      links: [{ label: 'Demo', url: 'https://example.invalid' }],
    },
  ],
  history: [{ role: 'assistant', content: 'Historia privada' }],
  suggestedSeedQuestions: ['¿Qué hace?'],
};
function response(text: string, usage?: unknown) {
  return new Response(JSON.stringify({ output: [{ content: [{ text }] }], usage }));
}
function success() {
  return response(
    JSON.stringify({
      answer: ' Respuesta privada ',
      suggestedQuestions: [' A ', '', 7, 'B', 'C', 'D', 'E'],
    }),
    { input_tokens: 120, output_tokens: 30, input_tokens_details: { cached_tokens: 80 } },
  );
}
test('Dado el proveedor habilitado, cuando se consulta dos veces, entonces conserva payload, normalización y métricas separadas de caché', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(success());
  const service = new OpenAiService({ OPENAI_API_KEY: 'fake' }, request);
  const first = await service.generateChatResponse(payload);
  expect(first).toEqual({ answer: 'Respuesta privada', suggestedQuestions: ['A', 'B', 'C', 'D'] });
  expect(await service.generateChatResponse(payload)).toEqual(first);
  expect(request).toHaveBeenCalledTimes(1);
  const [url, options] = request.mock.calls[0]!;
  expect(url).toBe('https://api.openai.com/v1/responses');
  expect(options?.headers).toEqual({
    'Content-Type': 'application/json',
    Authorization: 'Bearer fake',
  });
  const body = JSON.parse(options?.body as string);
  expect(body).toMatchObject({
    model: 'gpt-4.1-mini',
    temperature: 0.3,
    max_output_tokens: 300,
    text: { format: { type: 'json_object' } },
  });
  expect(body.store).toBe(false);
  expect(body.service_tier).toBe('default');
  expect(body.input[1]).toEqual(payload.history?.[0]);
  expect(body.input[0].content).toContain('Hechos verificados');
  expect(body.input[0].content).toContain('datos no confiables');
  expect(body.input[0].content).toContain('https://example.invalid');
  expect(body.input.at(-1).content).toContain('Pregunta privada');
  expect(body.input.at(-1).content).not.toContain('Hechos verificados');
  const events = vi.mocked(console.info).mock.calls.map(([entry]) => JSON.parse(entry));
  expect(events.map((e) => e.outcome)).toEqual(['success', 'cache_hit']);
  expect(events[0]).toMatchObject({ inputTokens: 120, outputTokens: 30, cachedInputTokens: 80 });
  expect(events[1]).not.toHaveProperty('inputTokens');
  expect(JSON.stringify(events)).not.toContain('privada');
});
for (const env of [{}, { OPENAI_API_KEY: '' }]) {
  test('Dado OpenAI deshabilitado, cuando hay contexto, entonces no realiza llamadas', async () => {
    const request = vi.fn<typeof fetch>();
    const service = new OpenAiService(env, request);
    expect(service.isEnabled()).toBe(false);
    expect(await service.generateChatResponse(payload)).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
}
test('Dado contexto vacío, cuando hay API key, entonces evita llamar al proveedor', async () => {
  const request = vi.fn<typeof fetch>();
  expect(
    await new OpenAiService({ OPENAI_API_KEY: 'fake' }, request).generateChatResponse({
      ...payload,
      contextItems: [],
    }),
  ).toBeNull();
  expect(request).not.toHaveBeenCalled();
});
for (const text of [
  '',
  ' ',
  'invalid-json',
  '{}',
  'null',
  '{"answer":" ","suggestedQuestions":[]}',
  '{"answer":"a","suggestedQuestions":null}',
]) {
  test(
    'Dada una respuesta inválida ' +
      JSON.stringify(text) +
      ', cuando se interpreta, entonces no se cachea y devuelve null',
    async () => {
      const request = vi.fn<typeof fetch>().mockImplementation(async () => response(text));
      const service = new OpenAiService({ OPENAI_API_KEY: 'fake' }, request);
      expect(await service.generateChatResponse(payload)).toBeNull();
      expect(await service.generateChatResponse(payload)).toBeNull();
      expect(request).toHaveBeenCalledTimes(2);
    },
  );
}
for (const status of [400, 429, 500, 503]) {
  test(
    'Dado HTTP ' + status + ', cuando OpenAI falla, entonces devuelve null sin reintentos',
    async () => {
      const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status }));
      expect(
        await new OpenAiService({ OPENAI_API_KEY: 'fake' }, request).generateChatResponse(payload),
      ).toBeNull();
      expect(request).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(vi.mocked(console.info).mock.calls)).toContain('http_error');
    },
  );
}
test('Dado un error arbitrario de red, cuando se procesa, entonces omite sus detalles y mide network_error', async () => {
  const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('texto sensible'));
  expect(
    await new OpenAiService({ OPENAI_API_KEY: 'fake' }, request).generateChatResponse(payload),
  ).toBeNull();
  expect(JSON.stringify(vi.mocked(console.info).mock.calls)).toContain('network_error');
  expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain('sensible');
});
test('Dado un transporte que espera abort, cuando pasan quince segundos, entonces cancela y devuelve null', async () => {
  vi.useFakeTimers();
  const request = vi.fn<typeof fetch>().mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new Error('abort')));
      }),
  );
  const result = new OpenAiService({ OPENAI_API_KEY: 'fake' }, request).generateChatResponse(
    payload,
  );
  await vi.advanceTimersByTimeAsync(14999);
  expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(vi.mocked(console.info).mock.calls)).toContain('timeout');
});
test('Dados hechos, historial, links y sugerencias diferentes, cuando se consulta, entonces las claves de caché permanecen separadas', async () => {
  const request = vi.fn<typeof fetch>().mockImplementation(async () => success());
  const service = new OpenAiService(
    { OPENAI_API_KEY: 'fake', OPENAI_CHAT_MODEL: 'modelo-ficticio' },
    request,
  );
  await service.generateChatResponse(payload);
  await service.generateChatResponse({
    ...payload,
    history: [{ role: 'user', content: 'Otra historia' }],
  });
  await service.generateChatResponse({
    ...payload,
    contextItems: payload.contextItems.map((item) => ({ ...item, text: 'Otro hecho' })),
  });
  await service.generateChatResponse({
    ...payload,
    contextItems: payload.contextItems.map((item) => ({ ...item, links: [] })),
  });
  await service.generateChatResponse({ ...payload, suggestedSeedQuestions: ['Otra'] });
  expect(request).toHaveBeenCalledTimes(5);
  expect(JSON.parse(request.mock.calls[0]?.[1]?.body as string).model).toBe('modelo-ficticio');
});
test('Dada caché IA por cinco minutos y 200 entradas, cuando vence o se excede, entonces vuelve a consultar sin retener más entradas', async () => {
  vi.useFakeTimers();
  const request = vi.fn<typeof fetch>().mockImplementation(async () => success());
  const service = new OpenAiService({ OPENAI_API_KEY: 'fake' }, request);
  await service.generateChatResponse(payload);
  await vi.advanceTimersByTimeAsync(300_000 - 1);
  await service.generateChatResponse({ ...payload, userMessage: ' PREGUNTA   PRIVADA ' });
  expect(request).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await service.generateChatResponse(payload);
  expect(request).toHaveBeenCalledTimes(2);
  for (let index = 0; index < 200; index++)
    await service.generateChatResponse({ ...payload, userMessage: 'Pregunta ' + index });
  await service.generateChatResponse(payload);
  expect(request).toHaveBeenCalledTimes(203);
});
test('Dadas métricas con campos extra y consumos inválidos, cuando se registran, entonces solo salen campos permitidos', () => {
  recordChatMetric({
    event: 'chat_provider',
    outcome: 'success',
    durationMs: 12.4,
    inputTokens: NaN,
    outputTokens: -1,
    cachedInputTokens: 0,
    ...{ message: 'privado', sessionId: 'privado', history: ['privado'] },
  });
  expect(JSON.parse(vi.mocked(console.info).mock.calls[0]?.[0])).toEqual({
    event: 'chat_provider',
    outcome: 'success',
    durationMs: 12,
    cachedInputTokens: 0,
  });
});
