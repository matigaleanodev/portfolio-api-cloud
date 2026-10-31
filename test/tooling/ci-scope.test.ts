import { afterEach, test, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});
function fixture(application = false) {
  const root = mkdtempSync(join(tmpdir(), 'api-scope-'));
  directories.push(root);
  if (application) {
    for (const name of applicationFiles) {
      mkdirSync(dirname(join(root, name)), { recursive: true });
      writeFileSync(join(root, name), '{}');
    }
    manifest(root, applicationScripts);
  }
  return root;
}
const applicationFiles = [
  'package-lock.json',
  'tsconfig.json',
  'packages/contracts/package.json',
  'packages/runtime/package.json',
  'packages/runtime/tsconfig.build.json',
  ...['api', 'chat', 'process-release', 'generate-og', 'notify-post', 'publish-chat-knowledge'].map(
    (name) => `packages/runtime/src/handlers/${name}.ts`,
  ),
];
const applicationScripts = Object.fromEntries(
  [
    'typecheck',
    'build',
    'test',
    'test:app',
    'test:editorial',
    'test:tooling',
    'test:package',
    'boundaries',
  ].map((name) => [name, 'node']),
);
function manifest(root: string, scripts: Record<string, string>) {
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts }));
}
function detect(root: string) {
  return spawnSync(
    'python3',
    [
      '-c',
      `import importlib.util,json,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('scope',sys.argv[1]); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
print(json.dumps(module.detect(Path(sys.argv[2]))))`,
      resolve('scripts/ci_scope.py'),
      root,
    ],
    { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } },
  );
}
test('Dado un repositorio documental, cuando CI detecta su alcance, entonces informa aplicación e infraestructura ausentes', () => {
  const result = detect(fixture());
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({
    application: 'false',
    infrastructure: 'false',
  });
});
test('Dada una aplicación completa sin CDK, cuando CI detecta su alcance, entonces exige solo las verificaciones de aplicación', () => {
  const result = detect(fixture(true));
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({
    application: 'true',
    infrastructure: 'false',
  });
});
test('Dados archivos de aplicación sin manifiesto, cuando CI detecta el alcance, entonces rechaza cada base huérfana', () => {
  for (const name of ['package-lock.json', 'tsconfig.json', 'packages', 'test', 'cdk.json']) {
    const root = fixture();
    writeFileSync(join(root, name), '{}');
    expect(detect(root).status).not.toBe(0);
  }
});
test('Dada una aplicación incompleta, cuando faltan el lock, un handler del catálogo o un script, entonces CI falla sin omitir controles', () => {
  for (const name of ['package-lock.json', 'packages/runtime/src/handlers/notify-post.ts']) {
    const root = fixture(true);
    unlinkSync(join(root, name));
    expect(detect(root).status, name).not.toBe(0);
  }
  for (const script of Object.keys(applicationScripts)) {
    const root = fixture(true);
    const { [script]: _removed, ...rest } = applicationScripts;
    manifest(root, rest);
    expect(detect(root).status, script).not.toBe(0);
  }
  const root = fixture(true);
  mkdirSync(join(root, 'packages/runtime/nested'), { recursive: true });
  writeFileSync(join(root, 'packages/runtime/nested/package-lock.json'), '{}');
  expect(detect(root).status).not.toBe(0);
});
test('Dada infraestructura CDK, cuando faltan sus verificaciones o su paquete, entonces CI la rechaza', () => {
  const root = fixture(true);
  writeFileSync(join(root, 'cdk.json'), '{}');
  manifest(root, {
    ...applicationScripts,
    'test:infra': 'node',
    'synth:local': 'node',
    cdk: 'cdk',
  });
  expect(detect(root).status).not.toBe(0);
  for (const name of [
    'packages/infrastructure/package.json',
    'packages/infrastructure/src/app.ts',
  ]) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), '{}');
  }
  const result = detect(root);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ application: 'true', infrastructure: 'true' });
  manifest(root, { ...applicationScripts, 'test:infra': 'node', cdk: 'cdk' });
  expect(detect(root).status).not.toBe(0);
});
