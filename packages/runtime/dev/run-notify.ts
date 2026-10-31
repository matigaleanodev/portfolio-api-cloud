import { dryRun, fail, parseFlags } from './cli.ts';

const event = {
  title: 'Arquitectura de Modo Playa',
  url: 'https://matiasgaleano.dev/blog/arquitectura-modo-playa',
  excerpt:
    'Una arquitectura multi-tenant real con NestJS, MongoDB, limites claros entre catalogo publico y admin.',
  date: '2026-03-07',
  tags: ['nestjs', 'architecture', 'backend'],
};

// --execute envía mails reales a todos los suscriptores del bucket configurado.
if (!parseFlags(['--execute']).has('--execute')) dryRun('notify-post', event);
else
  await import('../src/handlers/notify-post.ts')
    .then(({ handler }) => handler(event))
    .then((result) => console.log(result), fail);
