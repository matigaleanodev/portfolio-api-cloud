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
// La referencia histórica queda intacta; se declaran únicamente ubicación y contacto actuales.
const originalLocation = 'Full Stack Developer de Villa Gesell, Argentina.';
const currentLocation = 'Full Stack Developer de Posadas, Misiones, Argentina.';
const originalFaqContact =
  'Podés contactarme desde el formulario del portfolio en matiasgaleano.dev o mediante los enlaces profesionales publicados en el sitio.';
const originalProfileContact =
  'El contacto principal se realiza desde el formulario del portfolio en matiasgaleano.dev.';
const currentContact = professional.PROFESSIONAL_PROFILE.contact;
function withCurrentContent<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value)
      .replaceAll(originalLocation, currentLocation)
      .replaceAll(originalFaqContact, currentContact)
      .replaceAll(originalProfileContact, currentContact),
  ) as T;
}
beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
for (const scenario of reference.cases) {
  test(
    'Dado ' +
      scenario.label +
      ', cuando responde el dominio, entonces declara ubicación, contacto, FAQ directa y reserva de IA frente al origen',
    async () => {
      const requests: { url: string; body: unknown }[] = [];
      const request: typeof fetch = async (url, options) => {
        requests.push({ url: String(url), body: JSON.parse(options?.body as string) });
        return new Response(
          JSON.stringify({
            status: 'completed',
            model: 'gpt-6-luna',
            output: [
              {
                type: 'message',
                content: [
                  {
                    type: 'output_text',
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
      const faq = await new FaqService().findBestMatch(scenario.dto.message);
      const expected = withCurrentContent(scenario.response);
      if (faq?.id) {
        expect(await service.reply(scenario.dto)).toEqual({
          answer: faq.answer,
          suggestedQuestions: new FaqService().buildFollowUpSuggestions(faq).slice(0, 2),
          source: 'faq',
        });
        expect(repository.getKnowledge).not.toHaveBeenCalled();
        expect(requests).toEqual([]);
      } else {
        if (
          expected.source === 'fallback' &&
          !['trivia', 'matemática', 'implementación ajena'].includes(scenario.label)
        ) {
          expected.answer = `Para seguir con una consulta más específica, ${currentContact.charAt(0).toLowerCase()}${currentContact.slice(1)}`;
        }
        expect(await service.reply(scenario.dto)).toEqual(expected);
        expect(repository.getKnowledge).toHaveBeenCalledTimes(scenario.reads);
        expect(requests).toEqual(
          withCurrentContent(scenario.requests).map((entry) => {
            const previous = entry.body as { input: Array<{ role: string; content: string }> };
            return {
              ...entry,
              body: Object.fromEntries(
                Object.entries({
                  ...(entry.body as object),
                  model: 'gpt-6-luna',
                  reasoning: { effort: 'none' },
                  max_output_tokens: 600,
                  input: previous.input.map((item) =>
                    item.role === 'system'
                      ? {
                          ...item,
                          content: expect.stringContaining('Hechos verificados del portfolio'),
                        }
                      : item,
                  ),
                  store: false,
                  service_tier: 'default',
                }).filter(([key]) => key !== 'temperature'),
              ),
            };
          }),
        );
      }
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
      ', cuando se calcula su hash, entonces conserva los valores del SHA auditado salvo ubicación, contacto y contexto cloud renovados',
    () => {
      const sorted = Object.fromEntries(
        Object.entries(module).sort(([left], [right]) => left.localeCompare(right)),
      );
      const historicalModule =
        name === 'knowledge/professional-profile'
          ? {
              ...sorted,
              PROFESSIONAL_PROFILE: Object.fromEntries(
                Object.entries(professional.PROFESSIONAL_PROFILE).filter(
                  ([key]) => key !== 'contact',
                ),
              ),
            }
          : sorted;
      let normalized = JSON.stringify(historicalModule).replaceAll(
        currentLocation,
        originalLocation,
      );
      if (name === 'content/chat-faq.data') {
        normalized = normalized.replaceAll(currentContact, originalFaqContact);
      }
      if (name === 'knowledge/profile.knowledge') {
        normalized = normalized.replaceAll(currentContact, originalProfileContact);
      }
      const hash = createHash('sha256').update(normalized).digest('hex');
      expect(hash).toBe(
        name === 'knowledge/cloud.knowledge'
          ? '26729dc5db46c526059130841ce0ebef5e4196e5fedf9bb7d6205e811a1ac305'
          : reference.content[name],
      );
    },
  );
}
