import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve('scripts/review_bundle.py');
const revision = 'a'.repeat(40);
const directories: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'api-review-'));
  directories.push(root);
  mkdirSync(join(root, 'cdk.out'));
  writeFileSync(join(root, '.nvmrc'), '24.22.1\n');
  writeFileSync(join(root, 'package-lock.json'), '{}');
  writeFileSync(join(root, 'cdk.out/asset.txt'), 'runtime');
  writeFileSync(join(root, 'cdk.out/stack.metadata.json'), '{}');
  writeFileSync(
    join(root, 'cdk.out/assets.json'),
    JSON.stringify({
      files: { runtime: { source: { path: 'asset.txt' } } },
    }),
  );
  writeFileSync(
    join(root, 'cdk.out/manifest.json'),
    JSON.stringify({
      artifacts: {
        Assets: { type: 'cdk:asset-manifest', properties: { file: 'assets.json' } },
        PortfolioApiCloudTest: {
          type: 'aws:cloudformation:stack',
          environment: 'aws://650387442642/us-east-1',
          properties: { templateFile: 'asset.txt' },
          additionalMetadataFile: 'stack.metadata.json',
        },
      },
    }),
  );
  return { root, output: join(root, 'bundle') };
}
function run(...args: string[]) {
  return spawnSync('python3', [script, ...args], {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin' },
  });
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

test('Dado un assembly local, cuando se conserva y recupera el bundle, entonces verifica los mismos bytes y la revisión sin AWS', () => {
  const { root, output } = fixture();
  writeFileSync(join(root, 'cdk.out/stale.txt'), 'old asset');
  expect(run('create', root, output, revision, 'v24.22.1').status).toBe(0);
  expect(run('verify', output, revision).status).toBe(0);
  expect(() => readFileSync(join(output, 'cdk.out/stale.txt'))).toThrow();
  expect(readFileSync(join(output, 'cdk.out/asset.txt'), 'utf8')).toBe('runtime');
  expect(readFileSync(join(output, 'cdk.out/stack.metadata.json'), 'utf8')).toBe('{}');
  expect(JSON.parse(readFileSync(join(output, 'review.json'), 'utf8')).nodeVersion).toBe(
    'v24.22.1',
  );
  expect(run('create', root, output, revision, 'v24.22.1').status).toBe(1);
});

test.each(['alterado', 'faltante', 'adicional', 'otra revisión', 'enlace'])(
  'Dado un bundle %s, cuando se comprueba su integridad, entonces rechaza la recuperación',
  (change) => {
    const { root, output } = fixture();
    expect(run('create', root, output, revision, 'v24.22.1').status).toBe(0);
    const asset = join(output, 'cdk.out/asset.txt');
    if (change === 'alterado') writeFileSync(asset, 'changed');
    if (change === 'faltante') rmSync(asset);
    if (change === 'adicional') writeFileSync(join(output, 'extra.txt'), 'extra');
    if (change === 'enlace') {
      rmSync(asset);
      symlinkSync(join(root, 'package-lock.json'), asset);
    }
    expect(
      run('verify', output, change === 'otra revisión' ? 'b'.repeat(40) : revision).status,
    ).toBe(1);
  },
);

test.each(['SHA incompleto', 'Node distinto', 'otro ambiente', 'archivo privado', 'enlace'])(
  'Dado %s en la preparación, cuando se crea el bundle, entonces falla antes de conservarlo',
  (change) => {
    const { root, output } = fixture();
    if (change === 'otro ambiente')
      writeFileSync(join(root, 'cdk.out/manifest.json'), JSON.stringify({ artifacts: {} }));
    if (change === 'archivo privado')
      writeFileSync(
        join(root, 'cdk.out/manifest.json'),
        JSON.stringify({
          artifacts: {
            PortfolioApiCloudTest: {
              type: 'aws:cloudformation:stack',
              environment: 'aws://650387442642/us-east-1',
              properties: { templateFile: '.env' },
            },
          },
        }),
      );
    if (change === 'archivo privado') writeFileSync(join(root, 'cdk.out/.env'), 'synthetic');
    if (change === 'enlace') {
      rmSync(join(root, 'cdk.out/asset.txt'));
      symlinkSync(join(root, 'package-lock.json'), join(root, 'cdk.out/asset.txt'));
    }
    expect(
      run(
        'create',
        root,
        output,
        change === 'SHA incompleto' ? 'abc' : revision,
        change === 'Node distinto' ? 'v22.0.0' : 'v24.22.1',
      ).status,
    ).toBe(1);
  },
);

test.each(['asset válido', 'asset externo'])(
  'Dado un manifest con %s, cuando se conservan sus referencias, entonces incluye solamente contenido local válido',
  (scenario) => {
    const { root, output } = fixture();
    mkdirSync(join(root, 'cdk.out/asset.runtime'));
    writeFileSync(join(root, 'cdk.out/asset.runtime/handler.js'), 'runtime');
    writeFileSync(
      join(root, 'cdk.out/assets.json'),
      JSON.stringify({
        files: {
          runtime: {
            source: {
              path: scenario === 'asset válido' ? 'asset.runtime' : '../package-lock.json',
            },
          },
        },
      }),
    );
    const manifestPath = join(root, 'cdk.out/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.artifacts.Assets = {
      type: 'cdk:asset-manifest',
      properties: { file: 'assets.json' },
    };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(run('create', root, output, revision, 'v24.22.1').status).toBe(
      scenario === 'asset válido' ? 0 : 1,
    );
    if (scenario === 'asset válido') {
      expect(run('verify', output, revision).status).toBe(0);
      expect(readFileSync(join(output, 'cdk.out/asset.runtime/handler.js'), 'utf8')).toBe(
        'runtime',
      );
    }
  },
);

test('Dada metadata referenciada ausente, cuando se prepara el bundle, entonces falla antes de conservarlo', () => {
  const { root, output } = fixture();
  rmSync(join(root, 'cdk.out/stack.metadata.json'));
  expect(run('create', root, output, revision, 'v24.22.1').status).toBe(1);
});

test('Dado un inventario consistente sin metadata referenciada, cuando se recupera el bundle, entonces rechaza el assembly incompleto', () => {
  const { root, output } = fixture();
  expect(run('create', root, output, revision, 'v24.22.1').status).toBe(0);
  rmSync(join(output, 'cdk.out/stack.metadata.json'));
  const checksumPath = join(output, 'checksums.json');
  const checksums = JSON.parse(readFileSync(checksumPath, 'utf8'));
  delete checksums['cdk.out/stack.metadata.json'];
  writeFileSync(checksumPath, JSON.stringify(checksums));
  expect(run('verify', output, revision).status).toBe(1);
});
