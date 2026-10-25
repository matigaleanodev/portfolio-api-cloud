import { beforeEach, test, vi, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ChatService } from '../src/chat/chat.service.js';
import { FaqService } from '../src/chat/faq.service.js';
import { KnowledgeService } from '../src/chat/knowledge.service.js';
import { OpenAiService } from '../src/chat/openai.service.js';
import type { ChatRequestDto, ChatResponseDto } from '../src/chat/chat.dto.js';
import type { EditorialKnowledgeArtifact } from '../src/chat/chat-knowledge.repository.js';
import * as config from '../src/chat/chat-content.config.js';
import * as faqs from '../src/chat/content/chat-faq.data.js';
import * as professional from '../src/chat/knowledge/professional-profile.js';
import * as profile from '../src/chat/knowledge/profile.knowledge.js';
import * as cloud from '../src/chat/knowledge/cloud.knowledge.js';
interface Reference {
  artifact: EditorialKnowledgeArtifact;
  content: Record<string, string>;
  cases: {
    label: string;
    dto: ChatRequestDto;
    enabled: boolean;
    response: ChatResponseDto;
    reads: number;
    requests: { url: string; body: unknown }[];
  }[];
}
const reference = JSON.parse(readFileSync('test/chat-domain-reference.json', 'utf8')) as Reference;
// La referencia histórica queda intacta; solo se declara la ubicación corregida.
const originalLocation = 'Full Stack Developer de Villa Gesell, Argentina.';
const currentLocation = 'Full Stack Developer de Posadas, Misiones, Argentina.';
function withCurrentLocation<T>(value: T): T {
  return JSON.parse(JSON.stringify(value).replaceAll(originalLocation, currentLocation)) as T;
}
beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
for (const scenario of reference.cases) {
  test(
    'Dado ' +
      scenario.label +
      ', cuando responde el dominio, entonces conserva el origen salvo la ubicación corregida',
    async () => {
      const requests: { url: string; body: unknown }[] = [];
      const request: typeof fetch = async (url, options) => {
        requests.push({ url: String(url), body: JSON.parse(options?.body as string) });
        return new Response(
          JSON.stringify({
            output: [
              {
                content: [
                  {
                    text: JSON.stringify({
                      answer: 'Respuesta simulada',
                      suggestedQuestions: [' Primera ', 'primera', 'Segunda', 'Tercera'],
                    }),
                  },
                ],
              },
            ],
          }),
        );
      };
      const repository = { getKnowledge: vi.fn().mockResolvedValue(reference.artifact) };
      const service = new ChatService(
        new FaqService(),
        new KnowledgeService(repository),
        new OpenAiService(scenario.enabled ? { OPENAI_API_KEY: 'fake' } : {}, request),
      );
      expect(await service.reply(scenario.dto)).toEqual(withCurrentLocation(scenario.response));
      expect(repository.getKnowledge).toHaveBeenCalledTimes(scenario.reads);
      expect(requests).toEqual(withCurrentLocation(scenario.requests));
    },
  );
}
const modules: Record<string, object> = {
  'chat-content.config': config,
  'content/chat-faq.data': faqs,
  'knowledge/professional-profile': professional,
  'knowledge/profile.knowledge': profile,
  'knowledge/cloud.knowledge': cloud,
};
for (const [name, module] of Object.entries(modules)) {
  test(
    'Dado el contenido de ' +
      name +
      ', cuando se calcula su hash, entonces conserva los valores del SHA auditado salvo la ubicación corregida',
    () => {
      const sorted = Object.fromEntries(
        Object.entries(module).sort(([left], [right]) => left.localeCompare(right)),
      );
      const normalized = JSON.stringify(sorted).replaceAll(currentLocation, originalLocation);
      const hash = createHash('sha256').update(normalized).digest('hex');
      expect(hash).toBe(reference.content[name]);
    },
  );
}
