import { dryRun, fail, parseFlags } from './cli.ts';

const event = {
  manifest: {
    generatedAt: '2026-03-07T15:00:00Z',
    siteUrl: 'https://matiasgaleano.dev',
    content: {
      posts: [
        {
          slug: 'arquitectura-modo-playa',
          title: 'Como disene la arquitectura de Modo Playa',
          date: '2026-03-07',
          canonicalPath: '/blog/arquitectura-modo-playa',
        },
      ],
    },
  },
};

// --execute lee/escribe state/posts.json e invoca generate-og y notify-post configuradas.
if (!parseFlags(['--execute']).has('--execute')) dryRun('process-release', event);
else
  await import('../src/handlers/process-release.ts')
    .then(({ handler }) => handler(event))
    .then((result) => console.log(result), fail);
