import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const runtime = new URL('packages/runtime/', root);
const contracts = new URL('packages/contracts/', root);
const contractsName = '@portfolio-api-cloud/contracts';
const resvgNative = '@resvg/resvg-js-linux-x64-gnu';

const http = [
  contractsName,
  '@aws-sdk/client-dynamodb',
  '@aws-sdk/client-s3',
  '@aws-sdk/client-ssm',
  '@middy/core',
  'body-parser',
  'class-transformer',
  'class-validator',
  'rate-limiter-flexible',
  'reflect-metadata',
];

/**
 * Catálogo de artifacts: entrypoints compilados y dependencias de producción permitidas.
 * Las dependencias efectivas son los imports alcanzables desde los entrypoints (más `native`);
 * un import fuera de `allowed` corta el build. Directorio de salida: `.tmp/lambda-<nombre>`.
 */
export const artifacts = {
  api: { entries: ['handlers/api.js'], allowed: [...http, 'resend'], fallback: true },
  chat: { entries: ['handlers/chat.js'], allowed: http, fallback: true },
  editorial: {
    entries: [
      'handlers/process-release.js',
      'handlers/notify-post.js',
      'handlers/publish-chat-knowledge.js',
    ],
    allowed: [
      contractsName,
      '@aws-sdk/client-s3',
      '@aws-sdk/client-ssm',
      '@aws-sdk/client-lambda',
      'resend',
    ],
  },
  og: {
    entries: ['handlers/generate-og.js'],
    allowed: [contractsName, '@aws-sdk/client-s3', '@aws-sdk/client-ssm', '@resvg/resvg-js'],
    // Cargado con createRequire: no aparece como import estático.
    native: ['@resvg/resvg-js'],
    fonts: true,
  },
  'validation-api': {
    entries: ['validation/api.js'],
    allowed: [...http, 'resend'],
    fallback: true,
    validation: true,
  },
  'validation-chat': {
    entries: ['validation/chat.js'],
    allowed: http,
    fallback: true,
    validation: true,
  },
};

export const validationScenarios = ['success', 'error', 'pending-body', 'ambiguous'];
export const artifactDirectory = (name) => fileURLToPath(new URL(`.tmp/lambda-${name}/`, root));

function packageName(specifier) {
  return specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
}

const importPattern =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])([^'"\n]+)\1/g;

/** Archivos compilados alcanzables y paquetes importados desde los entrypoints. */
export function reachable(distDirectory, entries) {
  const files = new Set();
  const packages = new Set();
  const pending = entries.map((entry) => posix.normalize(entry));
  while (pending.length) {
    const file = pending.pop();
    if (files.has(file)) continue;
    const path = join(distDirectory, file);
    if (!existsSync(path)) throw new Error(`Entrypoint o import compilado inexistente: ${file}`);
    files.add(file);
    for (const [, , specifier] of readFileSync(path, 'utf8').matchAll(importPattern)) {
      if (specifier.startsWith('node:')) continue;
      if (specifier.startsWith('.')) {
        const target = posix.normalize(posix.join(posix.dirname(file), specifier));
        if (target.startsWith('..')) throw new Error(`Import fuera de dist: ${file}: ${specifier}`);
        pending.push(target);
      } else packages.add(packageName(specifier));
    }
  }
  return { files: [...files].sort(), packages: [...packages].sort() };
}

/** Cierre de dependencias de producción desde `roots` según el lockfile raíz. */
export function dependencyClosure(lock, roots) {
  const packages = lock.packages;
  const resolve = (from, name) => {
    for (let base = from; ;) {
      const candidate = `${base ? `${base}/` : ''}node_modules/${name}`;
      if (packages[candidate]) return candidate;
      if (!base) return null;
      const index = base.lastIndexOf('/node_modules/');
      base = index >= 0 ? base.slice(0, index) : '';
    }
  };
  const selected = new Set();
  const visit = (from, names, optional) => {
    for (const name of names) {
      const path = resolve(from, name);
      if (!path || (packages[path].optional && !existsSync(new URL(path, root)))) {
        if (optional.has(name)) continue;
        throw new Error(`Dependencia de producción sin instalar: ${name}`);
      }
      if (selected.has(path)) continue;
      selected.add(path);
      const entry = packages[path];
      const metadata = entry.link ? packages[entry.resolved] : entry;
      visit(
        entry.link ? entry.resolved : path,
        [
          ...Object.keys(metadata.dependencies ?? {}),
          ...Object.keys(metadata.optionalDependencies ?? {}),
          ...Object.keys(metadata.peerDependencies ?? {}),
        ],
        new Set([
          ...Object.keys(metadata.optionalDependencies ?? {}),
          ...Object.entries(metadata.peerDependenciesMeta ?? {})
            .filter(([, value]) => value.optional)
            .map(([name]) => name),
        ]),
      );
    }
  };
  visit('packages/runtime', roots, new Set());
  return [...selected].sort();
}

/** Contratos compilados con exports `.js`; el paquete no incluye fuentes TypeScript. */
function stageContracts(target) {
  const manifest = JSON.parse(readFileSync(new URL('package.json', contracts), 'utf8'));
  if (!existsSync(new URL('dist/', contracts))) throw new Error('Contracts are not built');
  mkdirSync(target, { recursive: true });
  cpSync(new URL('dist/', contracts), join(target, 'dist'), { recursive: true });
  const exports = Object.fromEntries(
    Object.entries(manifest.exports).map(([name, source]) => [
      name,
      source.replace(/^\.\/src\//, './dist/').replace(/\.ts$/, '.js'),
    ]),
  );
  writeManifest(join(target, 'package.json'), manifest, { exports });
}

function writeManifest(path, manifest, extra = {}) {
  writeFileSync(
    path,
    JSON.stringify(
      {
        name: manifest.name,
        version: manifest.version,
        private: true,
        license: manifest.license,
        type: 'module',
        ...extra,
      },
      null,
      2,
    ) + '\n',
  );
}

/** Solo el binario linux-x64-gnu (Lambda x86_64), con la versión exacta del wrapper. */
function nativePackages(lock, paths) {
  const wrapper = lock.packages['node_modules/@resvg/resvg-js'];
  const native = lock.packages[`node_modules/${resvgNative}`];
  if (!wrapper || native?.version !== wrapper.version)
    throw new Error('Versión de resvg nativo distinta de @resvg/resvg-js');
  if (!existsSync(new URL(`node_modules/${resvgNative}/package.json`, root)))
    throw new Error(`${resvgNative} no está instalado: se requiere un host linux-x64-gnu`);
  return [
    ...paths.filter((path) => !/^node_modules\/@resvg\/resvg-js-/.test(path)),
    `node_modules/${resvgNative}`,
  ].sort();
}

/**
 * Prepara un artifact en `directory` (borrado antes). Con `scenario`, `api` y `chat` se
 * resuelven a su variante de validación con proveedores ficticios.
 */
export function stageArtifact(requested, directory, scenario) {
  const name =
    scenario !== undefined && artifacts[`validation-${requested}`]
      ? `validation-${requested}`
      : requested;
  const definition = artifacts[name];
  if (!definition) throw new Error(`Artifact desconocido: ${requested}`);
  directory ??= artifactDirectory(name);
  scenario ??= 'success';
  if (definition.validation && !validationScenarios.includes(scenario))
    throw new Error('Invalid validation scenario');
  const dist = definition.validation
    ? fileURLToPath(new URL('.tmp/validation-dist/', root))
    : fileURLToPath(new URL('dist/', runtime));
  const { files, packages } = reachable(dist, definition.entries);
  const roots = [...new Set([...packages, ...(definition.native ?? [])])].sort();
  const outside = roots.filter((name) => !definition.allowed.includes(name));
  if (outside.length) throw new Error(`Dependencias no permitidas en ${name}: ${outside}`);
  if (!definition.validation && files.some((file) => file.startsWith('validation/')))
    throw new Error(`Código de validación en ${name}`);

  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  for (const file of files) {
    mkdirSync(join(directory, 'dist', dirname(file)), { recursive: true });
    cpSync(join(dist, file), join(directory, 'dist', file));
  }
  if (definition.fallback)
    cpSync(new URL('fallback/', runtime), join(directory, 'fallback'), { recursive: true });
  if (definition.fonts)
    cpSync(new URL('assets/og/fonts/', runtime), join(directory, 'assets/og/fonts'), {
      recursive: true,
    });
  cpSync(new URL('LICENSE', root), join(directory, 'LICENSE'));
  writeManifest(
    join(directory, 'package.json'),
    JSON.parse(readFileSync(new URL('package.json', runtime), 'utf8')),
  );
  if (definition.validation)
    writeFileSync(
      join(directory, 'validation.json'),
      JSON.stringify({ version: 1, scenario }) + '\n',
    );

  const lock = JSON.parse(readFileSync(new URL('package-lock.json', root), 'utf8'));
  // Paquetes de solo tipos declarados como dependencia (p. ej. @types/validator): sin runtime.
  let paths = dependencyClosure(lock, roots).filter(
    (path) => !/(?:^|\/)node_modules\/@types\//.test(path),
  );
  if (definition.native) paths = nativePackages(lock, paths);
  for (const path of paths) {
    if (/^node_modules\/(?:@nestjs\/|express(?:\/|$)|@aws-sdk\/client-secrets-manager$)/.test(path))
      throw new Error(`Dependencia inesperada: ${path}`);
    if (lock.packages[path].link) {
      if (path !== `node_modules/${contractsName}`)
        throw new Error(`Paquete del workspace inesperado: ${path}`);
      stageContracts(join(directory, path));
      continue;
    }
    const source = fileURLToPath(new URL(path, root));
    // Las dependencias anidadas necesarias son entradas propias del cierre.
    const nested = join(source, 'node_modules');
    cpSync(source, join(directory, path), {
      recursive: true,
      filter: (file) => file !== nested && !file.startsWith(nested + '/'),
    });
  }
  return { name, directory, files, packages: paths };
}

export function stageAllArtifacts(scenario = 'success') {
  return Object.keys(artifacts).map((name) =>
    stageArtifact(name, undefined, artifacts[name].validation ? scenario : undefined),
  );
}

/** Compatibilidad con el empaquetado previo: api o su variante de validación. */
export function stageRuntimePackage(directory, scenario) {
  return stageArtifact('api', directory, scenario);
}

export function listFiles(directory, base = directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path, base) : [path.slice(base.length + 1)];
  });
}
