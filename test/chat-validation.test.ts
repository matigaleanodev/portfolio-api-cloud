import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateChat } from '../src/chat/chat.dto.js';
import { createApplication } from '../src/application.js';
import { readConfiguration } from '../src/config.js';
import { httpEvent } from './fixtures.js';

interface Reference {
  cases: {
    name: string;
    input: unknown;
    absent?: boolean;
    statusCode: number;
    dto?: unknown;
    body?: { message: string[]; error: string; statusCode: number };
  }[];
}
const reference = JSON.parse(readFileSync('test/chat-reference.json', 'utf8')) as Reference;
for (const scenario of reference.cases) {
  test(
    'Dado ' +
      scenario.name +
      ', cuando se valida chat, entonces conserva la referencia o la diferencia declarada',
    async () => {
      let expected = scenario;
      if (Array.isArray(scenario.input))
        expected = {
          ...scenario,
          statusCode: 400,
          body: { message: ['body must be an object'], error: 'Bad Request', statusCode: 400 },
        };
      if (scenario.name.startsWith('prototype'))
        expected = {
          ...scenario,
          statusCode: 400,
          body: {
            message: [
              scenario.name.endsWith('history')
                ? 'history.0.property prototype should not exist'
                : 'property prototype should not exist',
            ],
            error: 'Bad Request',
            statusCode: 400,
          },
        };
      let called = 0;
      const application = createApplication(readConfiguration({}), undefined, undefined, {
        reply: async (dto) => {
          called++;
          assert.deepEqual(JSON.parse(JSON.stringify(dto)), expected.dto);
          return { answer: 'Respuesta simulada', suggestedQuestions: [], source: 'ai' };
        },
      });
      // El parser rechaza null JSON antes del DTO; la referencia a ValidationPipe se comprueba directamente.
      const validation = validateChat(scenario.absent ? undefined : scenario.input);
      assert.deepEqual(
        validation.errors,
        expected.statusCode === 400 ? expected.body?.message : [],
      );
      const event = httpEvent('POST', '/api/chat');
      event.headers['content-type'] = 'application/json';
      if (!scenario.absent && scenario.input !== null) event.body = JSON.stringify(scenario.input);
      const response = await application(event);
      assert.equal(response.statusCode, expected.statusCode);
      if (expected.statusCode === 400)
        assert.deepEqual(JSON.parse(response.body ?? ''), expected.body);
      assert.equal(called, expected.statusCode === 201 ? 1 : 0);
      assert.equal(({} as Record<string, unknown>).polluted, undefined);
    },
  );
}
