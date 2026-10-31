import { beforeEach, describe, it, afterEach, expect, vi } from 'vitest';
import { KnowledgeService } from '../packages/runtime/src/chat/knowledge.service.js';
import { FaqService } from '../packages/runtime/src/chat/faq.service.js';
import type { ChatKnowledgeRepository } from '../packages/runtime/src/chat/chat-knowledge.repository.js';

beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));

describe('KnowledgeService', () => {
  it('Dado un artifact con posts publicados, futuros e inválidos, cuando se selecciona contexto, entonces solo incluye los publicados', async () => {
    const result = await createService({
      projects: [],
      posts: [
        {
          slug: 'published',
          title: 'Blog publicado',
          excerpt: 'Artículo del blog',
          date: '2020-01-01',
        },
        {
          slug: 'scheduled',
          title: 'Blog futuro',
          excerpt: 'Artículo del blog',
          date: '2999-01-01',
        },
        {
          slug: 'invalid',
          title: 'Blog inválido',
          excerpt: 'Artículo del blog',
          date: '2026-02-30',
        },
      ],
    }).getRelevantContext('¿Qué artículos publicaste en el blog?');
    expect(result.some((item) => item.sourceId === 'published')).toBe(true);
    expect(result.some((item) => ['scheduled', 'invalid'].includes(item.sourceId ?? ''))).toBe(
      false,
    );
  });
  it.each([
    '¿Dónde trabajás?',
    '¿Quién sos?',
    '¿Qué tecnologías usás?',
    '¿Conocés SQL Server?',
    '¿Qué idiomas hablás?',
    '¿Cómo te contacto?',
    '¿Cuánto cobrás por hora?',
  ])(
    'Dada la consulta profesional %s, cuando R2 falla, entonces responde sin consultar el repositorio editorial',
    async (question) => {
      const repository = {
        getKnowledge: vi.fn().mockRejectedValue(new Error('R2 no disponible')),
      };
      const service = new KnowledgeService(repository as unknown as ChatKnowledgeRepository);
      const result = await service.getRelevantContext(question);
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((item) => item.sourceType === 'profile')).toBe(true);
      expect(repository.getKnowledge).not.toHaveBeenCalled();
    },
  );

  it.each([
    '¿Qué hace Foodly?',
    '¿Qué stack usa ModoPlaya?',
    'Compará Comafi con los proyectos',
    '¿Qué publicaste en el blog?',
  ])(
    'Dada la consulta editorial %s, cuando el repositorio falla, entonces conserva el error operativo',
    async (question) => {
      const repository = {
        getKnowledge: vi.fn().mockRejectedValue(new Error('R2 no disponible')),
      };
      const service = new KnowledgeService(repository as unknown as ChatKnowledgeRepository);
      await expect(service.getRelevantContext(question)).rejects.toThrow('R2 no disponible');
    },
  );
  it.each([
    '¿Dónde trabajás?',
    'donde trabajas?',
    '¿En qué empresa laburás?',
    '¿No trabaja en Comafi?',
  ])(
    'Dada la consulta laboral %s, cuando hay contenido editorial competidor, entonces prioriza el empleo del perfil fijado',
    async (question) => {
      const result = await createService({
        projects: [],
        posts: Array.from({ length: 8 }, (_, index) => ({
          slug: `post-${index}`,
          title: question,
          excerpt: question,
        })),
      }).getRelevantContext(question);
      expect(result[0]?.sourceId).toBe('main-experience');
      expect(result[0]?.text).toContain('Banco Comafi a través de Boreal IT');
    },
  );

  it.each([
    '¿Tenés experiencia con SQL Server?',
    '¿Conocés PostgreSQL en RDS y Aurora?',
    '¿Trabajás con DynamoDB?',
    '¿Usás colas SQS?',
    '¿Tenés experiencia con AWS CDK y Lambda?',
  ])(
    'Dada la consulta profesional %s, cuando se seleccionan hechos, entonces conserva su dominio laboral',
    async (question) => {
      const result = await createService({
        projects: [],
        posts: [],
      }).getRelevantContext(question);
      expect(result[0]?.sourceId).toMatch(/^main-(databases|aws)$/);
      expect(result.every((item) => item.sourceType === 'profile')).toBe(true);
    },
  );

  it('Dada una conversación sobre Comafi, cuando se pregunta qué hace ahí, entonces recupera el empleo', async () => {
    const result = await createService({
      projects: [],
      posts: [],
    }).getRelevantContext('¿Y qué hacés ahí?', [{ role: 'user', content: '¿Trabajás en Comafi?' }]);
    expect(result[0]?.sourceId).toBe('main-experience');
  });

  it.each([
    ['¿Se maneja en inglés?', 'main-career-preferences', 'inglés técnico'],
    ['¿Cómo lo contacto por correo?', 'main-contact', 'formulario'],
  ])(
    'Dada la consulta profesional indirecta %s, cuando se selecciona contexto, entonces recupera el hecho correspondiente',
    async (question, id, fact) => {
      const result = await createService({
        projects: [],
        posts: [],
      }).getRelevantContext(question);
      expect(result[0]?.sourceId).toBe(id);
      expect(result[0]?.text).toContain(fact);
    },
  );

  it('Dada una consulta sobre SQL Server y Foodly, cuando se selecciona contexto, entonces evita atribuirle conocimientos personales', async () => {
    const result = await createService({
      projects: [
        {
          slug: 'foodly-notes',
          title: 'Foodly Notes',
          excerpt: 'Recetas con MongoDB',
        },
      ],
      posts: [],
    }).getRelevantContext('¿Foodly usa SQL Server y AWS CDK?');
    expect(result[0]?.sourceId).toBe('foodly-notes');
    expect(result.some((item) => item.sourceType === 'profile')).toBe(false);
  });

  it.each(['¿Qué tecnologías usa?', '¿Cómo funciona?', '¿Y el backend?'])(
    'Dado un proyecto en el historial, cuando se repregunta %s, entonces recupera ese proyecto',
    async (question) => {
      const result = await createService({
        projects: [
          {
            slug: 'modo-playa',
            title: 'Modo Playa',
            excerpt: 'Alojamientos con Angular y NestJS',
          },
        ],
        posts: [],
      }).getRelevantContext(question, [
        { role: 'user', content: 'Contame de Modo Playa' },
        {
          role: 'assistant',
          content: 'Modo Playa es una plataforma de alojamientos.',
        },
      ]);
      expect(result[0]?.sourceId).toBe('modo-playa');
      expect(result.some((item) => item.sourceId === 'main-stack')).toBe(false);
    },
  );

  it('Dado un proyecto mencionado antes, cuando la última respuesta omite su nombre, entonces conserva el tema', async () => {
    const result = await createService({
      projects: [{ slug: 'modo-playa', title: 'Modo Playa', excerpt: 'Alojamientos' }],
      posts: [],
    }).getRelevantContext('¿Y el backend?', [
      { role: 'user', content: 'Contame de Modo Playa' },
      { role: 'assistant', content: 'Es una plataforma de alojamientos.' },
      { role: 'user', content: '¿Qué tecnologías usa?' },
      { role: 'assistant', content: 'Usa Angular y NestJS.' },
    ]);
    expect(result[0]?.sourceId).toBe('modo-playa');
  });

  it('Dados dos proyectos sucesivos, cuando se repregunta por el backend, entonces sigue al último proyecto', async () => {
    const result = await createService({
      projects: [
        { slug: 'modo-playa', title: 'Modo Playa', excerpt: 'Alojamientos' },
        { slug: 'foodly-notes', title: 'Foodly Notes', excerpt: 'Recetas' },
      ],
      posts: [],
    }).getRelevantContext('¿Y el backend?', [
      { role: 'user', content: 'Contame de Modo Playa' },
      { role: 'assistant', content: 'Es una plataforma de alojamientos.' },
      { role: 'user', content: '¿Qué tecnologías usa Foodly?' },
      { role: 'assistant', content: 'Usa Angular y NestJS.' },
    ]);
    expect(result[0]?.sourceId).toBe('foodly-notes');
  });

  it('Dada una comparación de proyectos, cuando se usa una referencia ordinal, entonces conserva ambas entidades', async () => {
    const result = await createService({
      projects: [
        { slug: 'foodly-notes', title: 'Foodly Notes', excerpt: 'Recetas' },
        { slug: 'modo-playa', title: 'Modo Playa', excerpt: 'Alojamientos' },
      ],
      posts: [],
    }).getRelevantContext('Del segundo proyecto, ¿cómo funciona el backend?', [
      { role: 'user', content: 'Compará Foodly Notes y Modo Playa' },
      { role: 'assistant', content: 'Primero recetas y después alojamientos.' },
    ]);
    expect(result.map((item) => item.sourceId)).toEqual(
      expect.arrayContaining(['foodly-notes', 'modo-playa']),
    );
  });

  it('Dado un cambio de proyecto a empleo, cuando se pregunta qué hace ahí, entonces recupera el tema laboral', async () => {
    const repository = { getKnowledge: vi.fn() };
    const result = await new KnowledgeService(
      repository as unknown as ChatKnowledgeRepository,
    ).getRelevantContext('¿Y qué hacés ahí?', [
      { role: 'user', content: 'Contame de Modo Playa' },
      {
        role: 'assistant',
        content: 'Modo Playa es una plataforma de alojamientos.',
      },
      { role: 'user', content: '¿Trabajás en Comafi?' },
      { role: 'assistant', content: 'Sí, en Banco Comafi.' },
    ]);
    expect(result[0]?.sourceId).toBe('main-experience');
    expect(repository.getKnowledge).not.toHaveBeenCalled();
  });

  it('Dado Modo Playa en el historial, cuando se pregunta por Foodly, entonces cambia el proyecto seleccionado', async () => {
    const result = await createService({
      projects: [
        { slug: 'modo-playa', title: 'Modo Playa', excerpt: 'Alojamientos' },
        { slug: 'foodly-notes', title: 'Foodly Notes', excerpt: 'Recetas' },
      ],
      posts: [],
    }).getRelevantContext('¿Qué tecnologías usa Foodly?', [
      {
        role: 'assistant',
        content: 'Modo Playa es una plataforma de alojamientos.',
      },
    ]);
    expect(result[0]?.sourceId).toBe('foodly-notes');
  });

  it('Dado un proyecto en el historial, cuando se pregunta por el stack personal, entonces recupera el perfil', async () => {
    const repository = { getKnowledge: vi.fn() };
    const service = new KnowledgeService(repository as unknown as ChatKnowledgeRepository);
    const result = await service.getRelevantContext('¿Qué tecnologías usás?', [
      {
        role: 'assistant',
        content: 'Modo Playa es una plataforma de alojamientos.',
      },
    ]);
    expect(result[0]?.sourceId).toBe('main-stack');
    expect(repository.getKnowledge).not.toHaveBeenCalled();
  });

  it('Dado Foodly en el historial, cuando se pregunta por el otro, entonces conserva la entidad anterior', async () => {
    const service = createService({
      projects: [{ slug: 'foodly-notes', title: 'Foodly Notes', excerpt: 'Recetas' }],
      posts: [],
    });
    const result = await service.getRelevantContext('¿Y el otro?', [
      { role: 'assistant', content: 'Foodly Notes' },
    ]);
    expect(result[0]?.sourceId).toBe('foodly-notes');
  });
  it('Dado historial de proyectos, cuando se consulta disponibilidad y tarifa, entonces prioriza contacto', async () => {
    const service = createService({ projects: [], posts: [] });
    const result = await service.getRelevantContext(
      '¿Matías puede empezar mañana y cuánto cobra por hora?',
      [
        {
          role: 'assistant',
          content: 'Foodly Notes y Modo Playa: Angular, NestJS, AWS, Docker',
        },
      ],
    );
    expect(result[0]?.sourceId).toBe('main-contact');
    expect(result[0]?.text).toContain('formulario');
    expect(result[0]?.text).toContain('contacto@matiasgaleano.dev');
    const faq = await new FaqService().findBestMatch('¿Cómo puedo contactarte?');
    expect(faq?.answer).toContain('contacto@matiasgaleano.dev');
    expect(result[0]?.text).toContain(faq?.answer);
  });
  it.each([
    'Compará Foodly y ModoPlaya: stack y publicación',
    'MODO PLAYA y FÓODLY: qué hace cada uno',
  ])(
    'Dada la comparación %s, cuando se aplica el límite contextual, entonces conserva ambos proyectos',
    async (question) => {
      const service = createService({
        generatedAt: '2026-10-09T00:00:00Z',
        projects: [
          { slug: 'foodly-notes', title: 'Foodly Notes', excerpt: 'Recetas' },
          { slug: 'modo-playa', title: 'Modo Playa', excerpt: 'Alojamientos' },
        ],
        posts: Array.from({ length: 8 }, (_, index) => ({
          slug: `post-${index}`,
          title: question,
          excerpt: question,
          date: '2026-10-09',
        })),
      });
      const result = await service.getRelevantContext(question);
      expect(result.slice(0, 2).map((item) => item.sourceId)).toEqual([
        'foodly-notes',
        'modo-playa',
      ]);
    },
  );

  it('Dada la ubicación profesional corregida, cuando se consulta el perfil, entonces responde Posadas, Misiones y descarta Villa Gesell', async () => {
    const result = await createService({
      projects: [],
      posts: [],
    }).getRelevantContext('perfil fullstack');
    expect(result.map((item) => item.text).join(' ')).toContain('Posadas, Misiones');
    expect(result.map((item) => item.text).join(' ')).not.toContain('Villa Gesell');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dado un proyecto publicado en el artifact, cuando se pregunta por Play Store, entonces prioriza ese proyecto', async () => {
    const service = createService({
      generatedAt: new Date().toISOString(),
      projects: [
        {
          slug: 'foodly-notes',
          title: 'Foodly Notes',
          excerpt: 'App de recetas publicada en Google Play Store.',
          stack: ['Angular', 'Ionic', 'NestJS'],
          links: [
            {
              label: 'Play Store',
              url: 'https://play.google.com/store/apps/details?id=io.example',
            },
          ],
          highlights: ['Publicada en Google Play Store.'],
          searchText: 'foodly notes play store angular ionic nestjs',
        },
      ],
      posts: [],
    });
    const result = await service.getRelevantContext('publicaste alguna app en play store');

    expect(result[0]).toEqual(
      expect.objectContaining({
        sourceType: 'project',
        sourceId: 'foodly-notes',
      }),
    );
  });

  it('Dado un artifact editorial vacío, cuando se consulta el ecosistema, entonces utiliza el conocimiento cloud curado', async () => {
    const service = createService({
      generatedAt: new Date().toISOString(),
      projects: [],
      posts: [],
    });
    const result = await service.getRelevantContext(
      'como esta armado el ecosistema de portfolio cloud',
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'cloud',
          sourceId: 'cloud-ecosystem',
        }),
      ]),
    );
  });

  it('Dado un post publicado sobre Docker, cuando se consulta EC2, entonces incluye el post editorial', async () => {
    const service = createService({
      generatedAt: new Date().toISOString(),
      projects: [],
      posts: [
        {
          slug: 'desplegar-apis-docker-ec2',
          title: 'Cómo desplegar APIs con Docker en un EC2',
          excerpt: 'Post sobre deploy de APIs NestJS con Docker y EC2.',
          date: '2026-03-02',
          tags: ['docker', 'aws', 'ec2'],
          canonicalUrl: 'https://matiasgaleano.dev/blog/desplegar-apis-docker-ec2',
          summary: 'Explica el criterio operativo para deploy con Docker Compose.',
          searchText: 'docker aws ec2 deploy compose portfolio api',
        },
      ],
    });
    const result = await service.getRelevantContext('escribiste algo sobre docker en ec2');

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'post',
          sourceId: 'desplegar-apis-docker-ec2',
        }),
      ]),
    );
  });

  it('Dada una consulta sobre Lambdas y serverless, cuando se selecciona contexto, entonces prioriza cloud', async () => {
    const service = createService({
      generatedAt: new Date().toISOString(),
      projects: [],
      posts: [],
    });
    const result = await service.getRelevantContext(
      'como resolviste lambdas y serverless en portfolio cloud',
    );

    expect(result[0]).toEqual(
      expect.objectContaining({
        sourceType: 'cloud',
      }),
    );
  });
});

function createService(payload: Record<string, unknown>): KnowledgeService {
  const repository = {
    getKnowledge: vi.fn().mockResolvedValue(payload),
  } as unknown as ChatKnowledgeRepository;

  return new KnowledgeService(repository);
}
