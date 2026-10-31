import { describe, it, beforeEach, expect, vi } from 'vitest';
import { ChatService } from '../packages/runtime/src/chat/chat.service.js';

beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));

describe('ChatService', () => {
  let service: ChatService;

  const faqServiceMock = {
    findBestMatch: vi.fn(),
    incrementUsage: vi.fn(),
    getSystemEntry: vi.fn(),
    buildFollowUpSuggestions: vi.fn(),
  };

  const knowledgeServiceMock = {
    getRelevantContext: vi.fn(),
  };

  const openAiServiceMock = {
    generateChatResponse: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    faqServiceMock.getSystemEntry.mockResolvedValue(null);
    knowledgeServiceMock.getRelevantContext.mockResolvedValue([]);

    service = new ChatService(faqServiceMock, knowledgeServiceMock, openAiServiceMock);
  });

  it('Dado un chat sin consultas previas, cuando se piden starters, entonces devuelve las dos preguntas fijas', async () => {
    const result = await service.getStarters();

    expect(result.suggestedQuestions).toEqual([
      '¿Quién sos y a qué te dedicás?',
      '¿Qué tecnologías usás?',
    ]);
  });

  it('Dado conocimiento no disponible, cuando se consulta chat, entonces falla con 503 sin llamar a IA', async () => {
    faqServiceMock.findBestMatch.mockResolvedValue(null);
    knowledgeServiceMock.getRelevantContext.mockRejectedValue(new Error('unavailable'));
    await expect(service.reply({ message: 'Foodly Notes' })).rejects.toMatchObject({ status: 503 });
    expect(openAiServiceMock.generateChatResponse).not.toHaveBeenCalled();
  });

  it('Dada una coincidencia FAQ, cuando se responde, entonces conserva la FAQ sin llamar a IA', async () => {
    faqServiceMock.findBestMatch.mockResolvedValue({
      id: 'que-tecnologias-usas',
      question: '¿Qué tecnologías usás?',
      answer: 'Uso TypeScript y NestJS',
      tags: ['skills'],
    });
    faqServiceMock.buildFollowUpSuggestions.mockReturnValue([
      '¿Qué proyecto destacás?',
      '¿Cuál es tu experiencia laboral?',
    ]);
    openAiServiceMock.generateChatResponse.mockResolvedValue({
      answer: 'Trabajo con TypeScript y NestJS.',
      suggestedQuestions: ['¿Qué proyecto destacás?', '¿Usás MongoDB?'],
    });
    const result = await service.reply({
      message: '¿Qué tecnologías usás?',
      sessionId: 's1',
    });

    expect(faqServiceMock.incrementUsage).toHaveBeenCalledWith('que-tecnologias-usas');
    expect(result.source).toBe('faq');
    expect(result.answer).toBe('Uso TypeScript y NestJS');
    expect(openAiServiceMock.generateChatResponse).not.toHaveBeenCalled();
    expect(result.suggestedQuestions).toEqual([
      '¿Qué proyecto destacás?',
      '¿Cuál es tu experiencia laboral?',
    ]);
  });

  it('Dada una consulta sin FAQ, cuando IA responde con contexto, entonces devuelve source ai', async () => {
    faqServiceMock.findBestMatch.mockResolvedValue(null);
    knowledgeServiceMock.getRelevantContext.mockResolvedValue([
      {
        sourceType: 'profile',
        title: 'Proyectos',
        text: 'Foodly Notes publicado en Play Store',
        tags: ['projects'],
      },
    ]);
    openAiServiceMock.generateChatResponse.mockResolvedValue({
      answer: 'Sí, Foodly Notes está publicada en Play Store.',
      suggestedQuestions: ['¿Qué tecnologías usaste en Foodly Notes?'],
    });
    const result = await service.reply({
      message: '¿Publicaste alguna app en play store?',
      sessionId: 's2',
    });

    expect(result.source).toBe('ai');
    expect(result.answer).toContain('Play Store');
  });

  it('Dado contexto laboral, cuando IA no sugiere preguntas, entonces completa con sugerencias profesionales', async () => {
    faqServiceMock.findBestMatch.mockResolvedValue(null);
    knowledgeServiceMock.getRelevantContext.mockResolvedValue([
      {
        sourceType: 'profile',
        sourceId: 'main-experience',
        title: 'Experiencia laboral',
        text: 'Trabajo en Banco Comafi a través de Boreal IT.',
      },
    ]);
    openAiServiceMock.generateChatResponse.mockResolvedValue({
      answer: 'Trabajo en Banco Comafi.',
      suggestedQuestions: [],
    });
    const result = await service.reply({ message: '¿No trabaja en Comafi?' });
    expect(openAiServiceMock.generateChatResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedSeedQuestions: [
          '¿Qué tecnologías usás en Comafi?',
          '¿Qué hacés en el área de Fondos Comunes de Inversión?',
        ],
      }),
    );
    expect(result.suggestedQuestions).toEqual([
      '¿Qué tecnologías usás en Comafi?',
      '¿Qué hacés en el área de Fondos Comunes de Inversión?',
    ]);
  });

  it('Dado contexto vacío e IA sin respuesta, cuando se consulta, entonces usa el fallback general', async () => {
    faqServiceMock.findBestMatch.mockResolvedValue(null);
    knowledgeServiceMock.getRelevantContext.mockResolvedValue([]);
    openAiServiceMock.generateChatResponse.mockResolvedValue(null);
    const result = await service.reply({
      message: 'Pregunta desconocida',
    });

    expect(result.source).toBe('fallback');
    expect(result.suggestedQuestions).toHaveLength(2);
  });

  it('Dado conocimiento de un proyecto e IA sin respuesta, cuando se consulta, entonces devuelve fallback técnico contextual', async () => {
    faqServiceMock.findBestMatch.mockResolvedValue(null);
    knowledgeServiceMock.getRelevantContext.mockResolvedValue([
      {
        sourceType: 'project',
        sourceId: 'foodly-notes',
        title: 'Foodly Notes',
        text: 'Foodly Notes está publicada en Play Store y tiene repositorios frontend y backend públicos.',
        tags: ['angular', 'ionic', 'nestjs'],
      },
    ]);
    openAiServiceMock.generateChatResponse.mockResolvedValue(null);
    const result = await service.reply({
      message: 'contame de foodly notes',
      sessionId: 's-fallback-project',
    });

    expect(result.source).toBe('fallback');
    expect(result.answer).toContain('contacto@matiasgaleano.dev');
    expect(result.answer).not.toContain('No tengo esa información');
    expect(result.suggestedQuestions).toEqual([
      '¿Qué tecnologías usaste en ese proyecto?',
      '¿Qué links públicos tiene ese proyecto?',
    ]);
  });

  it('Dada una pregunta fuera de alcance, cuando se consulta, entonces redirige sin usar FAQ, contexto ni IA', async () => {
    const result = await service.reply({
      message: 'How much is 2+2?',
      sessionId: 's3',
    });

    expect(result.source).toBe('fallback');
    expect(result.answer).toContain('Solo puedo ayudar con preguntas sobre el portfolio');
    expect(faqServiceMock.findBestMatch).not.toHaveBeenCalled();
    expect(knowledgeServiceMock.getRelevantContext).not.toHaveBeenCalled();
    expect(openAiServiceMock.generateChatResponse).not.toHaveBeenCalled();
  });

  it('Dada una consulta técnica sin FAQ, cuando hay contexto e IA, entonces mantiene el flujo contextual', async () => {
    faqServiceMock.findBestMatch.mockResolvedValue(null);
    knowledgeServiceMock.getRelevantContext.mockResolvedValue([
      {
        sourceType: 'profile',
        title: 'Tecnologias principales',
        text: 'Angular, Ionic y NestJS',
        tags: ['angular', 'ionic', 'nestjs'],
      },
    ]);
    openAiServiceMock.generateChatResponse.mockResolvedValue({
      answer: 'Matias Galeano trabaja principalmente con Angular, Ionic y NestJS.',
      suggestedQuestions: ['¿En qué proyecto aplicaste ese stack?'],
    });
    const result = await service.reply({
      message: 'Do you know React?',
      sessionId: 's4',
    });

    expect(result.source).toBe('ai');
    expect(knowledgeServiceMock.getRelevantContext).toHaveBeenCalledWith('Do you know React?');
    expect(openAiServiceMock.generateChatResponse).toHaveBeenCalled();
  });

  it('Dada una consulta sobre blog y cloud, cuando IA responde, entonces conserva el contexto cloud', async () => {
    faqServiceMock.findBestMatch.mockResolvedValue(null);
    knowledgeServiceMock.getRelevantContext.mockResolvedValue([
      {
        sourceType: 'cloud',
        sourceId: 'cloud-lambdas',
        title: 'Experiencia reciente con AWS Lambda',
        text: 'Se implementaron Lambdas para generate-og y process-release.',
        tags: ['aws', 'lambda', 'serverless'],
      },
    ]);
    openAiServiceMock.generateChatResponse.mockResolvedValue({
      answer: 'En portfolio-cloud resolví Lambdas dedicadas para generate-og y process-release.',
      suggestedQuestions: ['¿Cómo manejás el release manifest?'],
    });
    const result = await service.reply({
      message: '¿Cómo resolviste las lambdas del blog en portfolio cloud?',
      sessionId: 's5',
    });

    expect(result.source).toBe('ai');
    expect(knowledgeServiceMock.getRelevantContext).toHaveBeenCalledWith(
      '¿Cómo resolviste las lambdas del blog en portfolio cloud?',
    );
    expect(openAiServiceMock.generateChatResponse).toHaveBeenCalled();
  });

  it('Dado contexto cloud e IA sin respuesta, cuando se consulta, entonces ofrece fallback técnico y sugerencias cloud', async () => {
    faqServiceMock.findBestMatch.mockResolvedValue(null);
    knowledgeServiceMock.getRelevantContext.mockResolvedValue([
      {
        sourceType: 'cloud',
        sourceId: 'cloud-lambdas',
        title: 'Experiencia reciente con AWS Lambda',
        text: 'Se implementaron Lambdas dedicadas para generate-og, notify-post y process-release en portfolio-cloud.',
        tags: ['aws', 'lambda', 'serverless'],
      },
    ]);
    openAiServiceMock.generateChatResponse.mockResolvedValue(null);
    const result = await service.reply({
      message: 'como resolviste portfolio cloud',
      sessionId: 's-fallback-cloud',
    });

    expect(result.source).toBe('fallback');
    expect(result.answer).toContain('contacto@matiasgaleano.dev');
    expect(result.suggestedQuestions).toEqual([
      '¿Cómo está dividido el ecosistema portfolio?',
      '¿Qué resolviste con AWS Lambda y storage?',
    ]);
  });
});
