import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { generateOgImage } from '../src/editorial/og.ts';
import { repositoryRoot } from './cli.ts';

// Render local sin red ni credenciales: escribe el PNG en la ruta indicada (o og-preview.png).
const outputPath = resolve(process.argv[2] ?? 'og-preview.png');
const image = await generateOgImage(
  {
    title: 'Test flujo completo de Resend y OG',
    excerpt:
      'Pipeline editorial serverless con AWS Lambda, R2 y Resend alineado visualmente con el portfolio.',
    tags: ['aws', 'serverless', 'blog'],
  },
  join(repositoryRoot, 'packages/runtime/assets/og/fonts'),
);
await writeFile(outputPath, image);
console.log(`OG preview written to ${outputPath}`);
