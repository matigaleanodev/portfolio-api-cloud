import { PutObjectCommand } from '@aws-sdk/client-s3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

type AnyMock = Mock<(...args: any[]) => any>;
import {
  generateOg,
  type GenerateOgDependencies,
} from '../../packages/runtime/src/editorial/generate-og.js';
import { buildOgSvg, generateOgImage } from '../../packages/runtime/src/editorial/og.js';
import { repositoryPath } from '../support/paths.js';

const fonts = repositoryPath('packages/runtime/assets/og/fonts');
let send: AnyMock;
let render: AnyMock;
let resolve: AnyMock;

beforeEach(() => {
  send = vi.fn().mockResolvedValue({});
  render = vi.fn().mockResolvedValue(Buffer.from('image'));
  resolve = vi.fn(async (): Promise<GenerateOgDependencies> => ({
    storage: { send },
    bucket: 'media',
    mediaBaseUrl: 'https://cdn.matiasgaleano.dev',
    ogObjectPrefix: 'og',
    render,
  }));
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

describe('generate-og', () => {
  it.each([{ title: 'Missing slug' }, { slug: 'missing-title' }, { title: ' ', slug: 'x' }, null])(
    'devuelve 400 sin título o slug y sin efectos: %j',
    async (event) => {
      await expect(generateOg(event as never, resolve)).resolves.toEqual({
        statusCode: 400,
        body: JSON.stringify({ error: 'Title and slug are required' }),
      });
      expect(resolve).not.toHaveBeenCalled();
      expect(render).not.toHaveBeenCalled();
    },
  );

  it('genera y sube la imagen con metadatos opcionales normalizados', async () => {
    await expect(
      generateOg(
        {
          title: 'Arquitectura de Modo Playa',
          slug: 'arquitectura-modo-playa',
          excerpt: '  resumen  ',
          date: '2026-03-07',
          tags: ['nestjs', 'architecture', ''],
        },
        resolve,
      ),
    ).resolves.toEqual({
      statusCode: 200,
      body: JSON.stringify({
        message: 'OG image generated',
        url: 'https://cdn.matiasgaleano.dev/og/arquitectura-modo-playa.png',
      }),
    });
    expect(render).toHaveBeenCalledWith({
      title: 'Arquitectura de Modo Playa',
      excerpt: '  resumen  ',
      date: '2026-03-07',
      tags: ['nestjs', 'architecture'],
    });
    const put = send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(put).toBeInstanceOf(PutObjectCommand);
    expect(put.input).toEqual({
      Bucket: 'media',
      Key: 'og/arquitectura-modo-playa.png',
      Body: Buffer.from('image'),
      ContentType: 'image/png',
    });
  });

  it('respeta OG_OBJECT_PREFIX y recorta barras del slug', async () => {
    resolve.mockResolvedValue({ ...(await resolve()), ogObjectPrefix: 'media/og' });
    const response = await generateOg({ title: 'T', slug: '/nested/post/' }, resolve);
    expect(JSON.parse(response.body).url).toBe(
      'https://cdn.matiasgaleano.dev/media/og/nested/post.png',
    );
    expect(send.mock.calls[0]?.[0].input.Key).toBe('media/og/nested/post.png');
  });

  it('un fallo de subida se propaga sin informar éxito', async () => {
    send.mockRejectedValue(new Error('R2 down'));
    await expect(generateOg({ title: 'T', slug: 's' }, resolve)).rejects.toThrow('R2 down');
  });
});

describe('render OG con resvg', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it('renderiza un PNG 1200x630 con las fuentes del paquete', async () => {
    const image = await generateOgImage(
      {
        title: 'Test flujo completo de Resend y OG',
        excerpt:
          'Pipeline editorial serverless con AWS Lambda, R2 y Resend alineado visualmente con el portfolio.',
        tags: ['aws', 'serverless', 'blog'],
      },
      fonts,
    );
    expect(image.subarray(0, 8)).toEqual(png);
    expect(image.readUInt32BE(16)).toBe(1200);
    expect(image.readUInt32BE(20)).toBe(630);
    expect(image.byteLength).toBeGreaterThan(1000);
  });

  it('soporta títulos y extractos largos', async () => {
    await expect(
      generateOgImage(
        {
          title:
            'Como disene la arquitectura de Modo Playa para escalar contenido, automatizacion editorial y producto sin perder claridad visual',
          excerpt:
            'API NestJS, MongoDB, ownerId y un pipeline backend para media, automatizacion editorial y assets Open Graph consistentes con el portfolio.',
          tags: ['aws', 'serverless', 'og', 'blog'],
        },
        fonts,
      ),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('falla sin fuentes en lugar de producir una imagen sin texto', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'og-fonts-'));
    try {
      await expect(generateOgImage({ title: 'T' }, empty)).rejects.toThrow('OG fonts are missing');
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('escapa XML y limita tags a tres en mayúsculas', () => {
    const svg = buildOgSvg({ title: 'A <b> & "c"', tags: ['aws', 'cloud', 'og', 'extra'] });
    expect(svg).toContain('A &lt;b&gt; &amp; &quot;c&quot;');
    expect(svg).toContain('>AWS<');
    expect(svg).toContain('>OG<');
    expect(svg).not.toContain('EXTRA');
  });
});
