import { dryRun, fail, parseFlags } from './cli.ts';

const event = {
  title: 'Arquitectura de Modo Playa',
  slug: 'arquitectura-modo-playa',
  excerpt:
    'API NestJS, MongoDB, aislamiento por ownerId y un pipeline backend para media e imagenes.',
  date: '2026-03-07',
  tags: ['nestjs', 'mongodb', 'architecture'],
};

// --execute sube el PNG al bucket R2 configurado (RUNTIME_PARAMETER_NAME + env de generate-og).
if (!parseFlags(['--execute']).has('--execute')) dryRun('generate-og', event);
else
  await import('../src/handlers/generate-og.ts')
    .then(({ handler }) => handler(event))
    .then((result) => console.log(result), fail);
