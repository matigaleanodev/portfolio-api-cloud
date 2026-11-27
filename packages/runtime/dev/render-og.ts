import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { composeOgImage, generateOgImage, ogFontFiles } from '../src/editorial/og.ts';
import { repositoryRoot } from './cli.ts';

// Ejemplos locales sin red ni credenciales: PNG, miniaturas, hashes e índice HTML.
const { Resvg } = createRequire(import.meta.url)(
  '@resvg/resvg-js',
) as typeof import('@resvg/resvg-js');
const output = resolve(process.argv[2] ?? '.tmp/og-examples');
const fonts = join(repositoryRoot, 'packages/runtime/assets/og/fonts');
const examples: Readonly<Record<string, string>> = {
  corto: 'Mis expectativas con Angular Native',
  medio: 'Cómo organizo componentes en Angular standalone sin rigidizar el frontend',
  largo: 'Tarjetitas de Jira, versiones y correcciones urgentes: cómo mantengo la trazabilidad',
  excedido:
    'Cómo diseñé la arquitectura de Modo Playa para escalar contenido, automatización editorial y producto sin perder claridad visual ni mezclar responsabilidades entre repositorios',
  indivisible:
    'https://matiasgaleano.dev/blog/como_diseno_contratos_cross_repo_sin_volverme_loco_ni_un_poco',
  acentos: '¿ÁRBOL, pingüino y señal? ÉL ÑANDÚ À Â Ä Å Ç jgpqy',
  combinados: 'Grafemas combinados: q̇ x̂ ñ é sin cortes',
  emoji: 'Desplegar sin miedo 🚀 con CDK ✅ y 👩‍💻',
  respaldo: '​',
};

const thumbnail = (svg: string, width: number, height: number) =>
  new Resvg(
    svg.replace(
      'width="1200" height="630"',
      `width="${width}" height="${height}" preserveAspectRatio="none"`,
    ),
    { font: { fontFiles: ogFontFiles.map((f) => join(fonts, f)), loadSystemFonts: false } },
  )
    .render()
    .asPng();

await mkdir(output, { recursive: true });
const hashes: string[] = [];
const sections: string[] = [];
for (const [name, title] of Object.entries(examples)) {
  const { svg, fontSize, lines } = composeOgImage(title, fonts);
  const image = await generateOgImage({ title }, fonts);
  await writeFile(join(output, `${name}.png`), image);
  await writeFile(join(output, `${name}-300x157.png`), thumbnail(svg, 300, 157));
  await writeFile(join(output, `${name}-160x84.png`), thumbnail(svg, 160, 84));
  hashes.push(`${createHash('sha256').update(image).digest('hex')}  ${name}.png`);
  sections.push(
    `<h2>${name} · ${fontSize}px · ${lines.length} líneas</h2><img src="${name}.png" width="600"> ` +
      `<img src="${name}-300x157.png"> <img src="${name}-160x84.png">`,
  );
}
await writeFile(join(output, 'SHA256SUMS'), hashes.join('\n') + '\n');
await writeFile(
  join(output, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Ejemplos OG</title><body style="background:#888;font-family:sans-serif">${sections.join('')}`,
);
console.log(`${hashes.join('\n')}\nEjemplos en ${output}`);
