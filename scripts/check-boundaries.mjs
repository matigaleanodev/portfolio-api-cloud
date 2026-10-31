import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const contractName = '@portfolio-api-cloud/contracts';
const allowed = {
  contracts: new Set(),
  infrastructure: new Set([contractName, 'aws-cdk-lib', 'constructs']),
  runtime: new Set([
    contractName,
    '@aws-sdk/client-dynamodb',
    '@aws-sdk/client-lambda',
    '@aws-sdk/client-s3',
    '@aws-sdk/client-ssm',
    '@middy/core',
    '@resvg/resvg-js',
    'body-parser',
    'class-transformer',
    'class-validator',
    'rate-limiter-flexible',
    'reflect-metadata',
    'resend',
  ]),
};
// Paquetes de solo tipos admitidos en imports `import type`.
const typeOnly = {
  contracts: new Set(),
  infrastructure: new Set(),
  runtime: new Set(['aws-lambda']),
};

function dependencyName(specifier) {
  return specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
}

function checkImport(owner, manifest, file, specifier, isTypeOnly) {
  if (specifier.startsWith('node:')) {
    assert.notEqual(owner, 'contracts', `Los contratos no dependen de Node: ${file}`);
    return;
  }
  if (specifier.startsWith('.')) {
    const target = relative(
      resolve(root, 'packages', owner, 'src'),
      resolve(dirname(file), specifier),
    );
    assert.ok(!target.startsWith('..'), `Import relativo fuera del paquete: ${file}: ${specifier}`);
    return;
  }
  const name = dependencyName(specifier);
  if (isTypeOnly && typeOnly[owner].has(name)) {
    assert.ok(
      manifest.devDependencies?.[`@types/${name}`],
      `Tipos no declarados: ${file}: ${name}`,
    );
    return;
  }
  assert.ok(
    allowed[owner].has(name) && manifest.dependencies?.[name],
    `Dependencia fuera del límite: ${file}: ${name}`,
  );
  if (name.startsWith('@portfolio-api-cloud/')) {
    assert.equal(name, contractName, `Dependencia entre paquetes no permitida: ${file}`);
    assert.ok(specifier.startsWith(`${contractName}/`), `Usar exports explícitos: ${file}`);
  }
}

// Autocontroles negativos: el hoisting no habilita imports ni escapes entre paquetes.
const fixture = resolve(root, 'packages/infrastructure/src/stack.ts');
assert.throws(() => checkImport('infrastructure', {}, fixture, 'resend', false));
assert.throws(() =>
  checkImport('infrastructure', { dependencies: { resend: '6.34.1' } }, fixture, 'resend', false),
);
assert.throws(() =>
  checkImport('infrastructure', {}, fixture, '../../runtime/src/handler.ts', false),
);
assert.throws(() => checkImport('contracts', {}, fixture, 'node:fs', false));
assert.throws(() =>
  checkImport(
    'contracts',
    { dependencies: { '@portfolio-api-cloud/runtime': '1.1.0' } },
    fixture,
    '@portfolio-api-cloud/runtime/handler',
    false,
  ),
);
assert.throws(() => checkImport('runtime', {}, fixture, 'aws-lambda', true));
assert.throws(() =>
  checkImport(
    'runtime',
    { dependencies: { '@portfolio-api-cloud/infrastructure': '1.1.0' } },
    fixture,
    '@portfolio-api-cloud/infrastructure',
    true,
  ),
);

async function files(directory) {
  const entries = (await readdir(directory, { withFileTypes: true })).filter(
    (entry) => !['node_modules', 'dist'].includes(entry.name),
  );
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = resolve(directory, entry.name);
        return entry.isDirectory() ? files(path) : [path];
      }),
    )
  ).flat();
}

const rootManifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const contractManifest = JSON.parse(
  await readFile(resolve(root, 'packages/contracts/package.json'), 'utf8'),
);
assert.deepEqual(
  [...rootManifest.workspaces].sort(),
  Object.keys(allowed).map((owner) => `packages/${owner}`),
);
for (const owner of Object.keys(allowed)) {
  const directory = resolve(root, 'packages', owner);
  const manifest = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
  assert.equal(manifest.name, `@portfolio-api-cloud/${owner}`);
  assert.equal(manifest.private, true);
  assert.equal(manifest.version, rootManifest.version, `Versión distinta: ${owner}`);
  assert.ok(!('scripts' in manifest) || !('prepare' in manifest.scripts));
  for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
    assert.ok(allowed[owner].has(name), `Dependencia fuera del límite: ${owner}: ${name}`);
    assert.match(version, /^\d+\.\d+\.\d+$/, `Conservar versiones exactas: ${owner}: ${name}`);
    if (name.startsWith('@portfolio-api-cloud/')) assert.equal(version, rootManifest.version);
  }
  assert.equal(
    (await files(directory)).some((path) => path.endsWith('package-lock.json')),
    false,
    `Lockfile por paquete: ${owner}`,
  );
  for (const file of await files(resolve(directory, 'src'))) {
    if (!file.endsWith('.ts')) continue;
    const source = await readFile(file, 'utf8');
    // Import/export estáticos, incluidos los de solo tipos.
    const imports = source.matchAll(
      /\b(?:import|export)\s+(?:(type)\s+)?(?:[^;'"()]*?\sfrom\s*)?['"]([^'"]+)['"]/g,
    );
    for (const [, type, specifier] of imports) {
      checkImport(owner, manifest, file, specifier, !!type);
      if (specifier.startsWith(`${contractName}/`)) {
        assert.ok(
          contractManifest.exports[`./${specifier.slice(contractName.length + 1)}`],
          `Export no declarado: ${specifier}`,
        );
      }
    }
    for (const [, specifier] of source.matchAll(/\b(?:import|require)\(['"]([^'"]+)['"]\)/g)) {
      checkImport(owner, manifest, file, specifier, false);
    }
  }
}
console.info(
  'Límites de imports/dependencias, versiones y exports de los tres paquetes comprobados.',
);
