// Smoke de un artifact extraído fuera del checkout: `node --import ./block-network.mjs
// ./artifact-smoke.mjs <artifact>`. Solo resuelve módulos del propio ZIP; red bloqueada y SDK
// simulados en sus prototipos (la misma instancia que carga el entrypoint).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const artifact = process.argv[2];
const entries = {
  api: ['dist/handlers/api.js'],
  chat: ['dist/handlers/chat.js'],
  editorial: [
    'dist/handlers/process-release.js',
    'dist/handlers/notify-post.js',
    'dist/handlers/publish-chat-knowledge.js',
  ],
  og: ['dist/handlers/generate-og.js'],
  'validation-api': ['dist/validation/api.js'],
  'validation-chat': ['dist/validation/chat.js'],
}[artifact];
assert.ok(entries, `Artifact desconocido: ${artifact}`);

const has = (path) => existsSync(path);
const modules = (path) => has(`node_modules/${path}`);
const http = ['@aws-sdk/client-dynamodb', '@middy/core', 'body-parser', 'class-validator'];
const forbidden = {
  api: ['@resvg/resvg-js', '@aws-sdk/client-lambda'],
  chat: ['resend', '@resvg/resvg-js', '@aws-sdk/client-lambda'],
  editorial: [...http, '@resvg/resvg-js', 'class-transformer', 'rate-limiter-flexible'],
  og: [...http, 'resend', '@aws-sdk/client-lambda', 'class-transformer', 'rate-limiter-flexible'],
  'validation-api': ['@resvg/resvg-js', '@aws-sdk/client-lambda'],
  'validation-chat': ['resend', '@resvg/resvg-js', '@aws-sdk/client-lambda'],
}[artifact];

// Contenido: solo runtime compilado y dependencias de producción de este artifact.
for (const name of [
  ...forbidden,
  '@aws-sdk/client-secrets-manager',
  'aws-cdk-lib',
  'constructs',
  'aws-cdk',
  'vitest',
  'typescript',
  'prettier',
  'esbuild',
  '@types',
  '@nestjs',
  'express',
  'react',
  '@react-email/render',
  'dotenv',
  '@portfolio-api-cloud/runtime',
  '@portfolio-api-cloud/infrastructure',
])
  assert.equal(modules(name), false, `${artifact} no debe incluir ${name}`);
assert.equal(modules('@aws-sdk/client-ssm'), true, `${artifact} lee configuración por SSM`);
assert.equal(modules('@portfolio-api-cloud/contracts/package.json'), true);
for (const path of ['dev', 'test', 'Docs', 'src', 'packages', '.env', 'AGENTS.md', 'roadmap'])
  assert.equal(has(path), false, `${artifact} no debe incluir ${path}`);
for (const entry of entries) assert.equal(has(entry), true, `Falta ${entry}`);
assert.equal(has('LICENSE'), true);
assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).type, 'module');
const validation = artifact.startsWith('validation-');
assert.equal(has('validation.json'), validation);
assert.equal(has('dist/validation'), validation);
assert.equal(has('fallback/chat-knowledge.v1.json'), !['editorial', 'og'].includes(artifact));
assert.equal(has('assets/og/fonts'), artifact === 'og');
const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)],
  );
for (const file of walk('dist'))
  assert.match(file, /\.js$/, `Solo JavaScript compilado en dist: ${file}`);
for (const file of walk('node_modules/@portfolio-api-cloud/contracts'))
  assert.doesNotMatch(file, /\.ts$/, `Contratos sin fuentes TypeScript: ${file}`);

const logs = [];
for (const level of ['info', 'error', 'warn', 'log'])
  console[level] = (...values) => logs.push(values.map(String).join(' '));
const report = (message) => process.stdout.write(`${artifact}: ${message}\n`);

if (validation) {
  // Destino que CDK declara para la variante de validación; el entrypoint lo exige al importar.
  const { functions } = await import('@portfolio-api-cloud/contracts/functions');
  const { runtimeParameterNames } = await import('@portfolio-api-cloud/contracts/configuration');
  const api = artifact === 'validation-api';
  Object.assign(process.env, {
    AWS_REGION: 'us-east-1',
    QUOTA_TABLE_NAME: 'portfolio-api-cloud-test-control',
    TRUSTED_API_ID: 'local',
    AWS_LAMBDA_FUNCTION_NAME: api ? functions.api.functionName : functions.chat.functionName,
    RUNTIME_PARAMETER_NAME: api
      ? runtimeParameterNames.validationApi
      : runtimeParameterNames.validationChat,
    ...(api ? { CHAT_PARAMETER_NAME: runtimeParameterNames.validationChat } : {}),
  });
}

for (const entry of entries) {
  const { handler } = await import(`./${entry}`);
  assert.equal(typeof handler, 'function', `${entry} exporta handler`);
}

if (artifact === 'editorial' || artifact === 'og') await editorialSmoke();
else {
  // HTTP: el entrypoint real compone y responde sin configuración (sin red ni proveedores).
  const { handler } = await import(`./${entries[0]}`);
  const response = await handler({
    version: '2.0',
    rawPath: artifact.endsWith('chat') ? '/api/chat/starters' : '/api/health',
    headers: {},
    requestContext: { http: { method: 'GET', sourceIp: '192.0.2.1' } },
    isBase64Encoded: false,
  });
  assert.equal(typeof response?.statusCode, 'number');
  if (artifact.endsWith('chat') || artifact.endsWith('api'))
    assert.ok(JSON.parse(readFileSync('fallback/chat-knowledge.v1.json', 'utf8')));
  report(`entrypoint importado y respondió ${response.statusCode} sin configuración`);
}
await assert.rejects(fetch('https://example.invalid'), /Red y proveedores reales bloqueados/);
assert.equal(
  logs.some((line) => /[^\s@"']+@[^\s@"']+\.[a-z]/i.test(line)),
  false,
  'Ningún log contiene emails',
);
process.stdout.write(`${artifact}: verificado fuera del checkout\n`);

async function editorialSmoke() {
  const { SSMClient, GetParameterCommand } = await import('@aws-sdk/client-ssm');
  const s3 = await import('@aws-sdk/client-s3');
  const parameters = [];
  const sensitive = {
    R2_MEDIA_ACCESS_KEY_ID: 'smoke',
    R2_MEDIA_SECRET_ACCESS_KEY: 'smoke',
    R2_SUBSCRIBERS_ACCESS_KEY_ID: 'smoke',
    R2_SUBSCRIBERS_SECRET_ACCESS_KEY: 'smoke',
    RESEND_BLOG_API_KEY: 're_smoke',
  };
  SSMClient.prototype.send = async (command) => {
    assert.ok(command instanceof GetParameterCommand);
    assert.equal(command.input.WithDecryption, true);
    parameters.push(command.input.Name);
    return { Parameter: { Type: 'SecureString', Value: JSON.stringify(sensitive) } };
  };
  const objects = new Map();
  const s3Calls = [];
  s3.S3Client.prototype.send = async (command) => {
    s3Calls.push(command);
    const { Bucket, Key } = command.input;
    if (command instanceof s3.PutObjectCommand) objects.set(`${Bucket}/${Key}`, command.input);
    if (command instanceof s3.GetObjectCommand) {
      const object = objects.get(`${Bucket}/${Key}`);
      if (!object) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
      return { Body: { transformToString: async () => String(object.Body) } };
    }
    if (command instanceof s3.ListObjectsV2Command)
      return {
        Contents: [{ Key: 'subscribers/uno@example.com.json' }, { Key: 'subscribers/' }],
      };
    return {};
  };
  Object.assign(process.env, {
    AWS_REGION: 'us-east-1',
    R2_ENDPOINT: 'https://r2.example.invalid',
    R2_BUCKET: 'media',
    SUBSCRIBERS_R2_ENDPOINT: 'https://r2.example.invalid',
    SUBSCRIBERS_R2_BUCKET: 'subscribers',
    MEDIA_BASE_URL: 'https://media.example.invalid/',
    BLOG_FROM_EMAIL: 'blog@example.invalid',
    GENERATE_OG_FUNCTION_NAME: 'portfolio-api-cloud-test-generate-og',
    NOTIFY_POST_FUNCTION_NAME: 'portfolio-api-cloud-test-notify-post',
  });

  if (artifact === 'og') {
    process.env.RUNTIME_PARAMETER_NAME = '/portfolio/prod/editorial';
    const { handler } = await import('./dist/handlers/generate-og.js');
    assert.equal((await handler({})).statusCode, 400);
    assert.equal(parameters.length + s3Calls.length, 0, 'Evento inválido sin efectos');

    const pkg = (name) => JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8'));
    const native = 'node_modules/@resvg/resvg-js-linux-x64-gnu/resvgjs.linux-x64-gnu.node';
    assert.equal(pkg('@resvg/resvg-js-linux-x64-gnu').version, pkg('@resvg/resvg-js').version);
    const elf = readFileSync(native);
    assert.equal(elf.subarray(0, 4).toString('latin1'), '\x7fELF');
    assert.equal(elf.readUInt16LE(18), 0x3e, 'Binario resvg x86_64');
    assert.deepEqual(
      readdirSync('node_modules/@resvg').sort(),
      ['resvg-js', 'resvg-js-linux-x64-gnu'],
      'Solo el binario linux-x64-gnu',
    );
    assert.equal(readdirSync('assets/og/fonts').length, 4);
    if (process.arch !== 'x64' || process.platform !== 'linux') {
      report('host no linux-x64: render omitido');
      return;
    }
    const response = await handler({
      slug: 'smoke',
      title: 'Test flujo completo de Resend y OG',
      excerpt:
        'Pipeline editorial serverless con AWS Lambda, R2 y Resend alineado visualmente con el portfolio.',
      tags: ['aws', 'serverless', 'blog'],
    });
    assert.deepEqual(JSON.parse(response.body), {
      message: 'OG image generated',
      url: 'https://media.example.invalid/og/smoke.png',
    });
    const png = objects.get('media/og/smoke.png');
    assert.equal(png.ContentType, 'image/png');
    assert.equal(png.Body.readUInt32BE(16), 1200);
    assert.equal(png.Body.readUInt32BE(20), 630);
    const digest = createHash('sha256').update(png.Body).digest('hex');
    if (process.env.REFERENCE_OG_SHA256)
      assert.equal(digest, process.env.REFERENCE_OG_SHA256, 'PNG idéntico al render de referencia');
    assert.deepEqual(parameters, ['/portfolio/prod/editorial']);
    report(`PNG 1200x630 ${png.Body.length} bytes sha256 ${digest.slice(0, 16)}`);
    return;
  }

  const { LambdaClient, InvokeCommand } = await import('@aws-sdk/client-lambda');
  const invocations = [];
  LambdaClient.prototype.send = async (command) => {
    assert.ok(command instanceof InvokeCommand);
    invocations.push(command.input.FunctionName);
    return {
      Payload: Buffer.from(JSON.stringify({ statusCode: 200, body: '{"message":"ok"}' })),
    };
  };
  const sent = [];
  const blockedFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), 'https://api.resend.com/emails');
    sent.push(JSON.parse(options.body).to);
    return new Response('{"id":"smoke"}', { status: 200 });
  };

  process.env.RUNTIME_PARAMETER_NAME = '/portfolio/prod/editorial';
  const release = (await import('./dist/handlers/process-release.js')).handler;
  const knowledge = (await import('./dist/handlers/publish-chat-knowledge.js')).handler;
  for (const response of [await release({}), await knowledge({}), await release({ manifest: 1 })])
    assert.equal(response.statusCode, 400);
  assert.equal(parameters.length + s3Calls.length + invocations.length, 0, 'Rechazo sin efectos');

  const manifest = {
    generatedAt: '2026-03-07T15:00:00Z',
    siteUrl: 'https://matiasgaleano.dev',
    content: {
      posts: [{ slug: 'a', title: 'A', date: '2026-03-07', canonicalPath: '/blog/a' }],
    },
  };
  assert.deepEqual(await release(manifest), {
    statusCode: 200,
    body: JSON.stringify({ processedPosts: ['a'] }),
  });
  assert.deepEqual(invocations, [
    'portfolio-api-cloud-test-generate-og',
    'portfolio-api-cloud-test-notify-post',
  ]);
  assert.equal(
    JSON.parse(objects.get('media/state/posts.json').Body).a.notifiedAt.length > 0,
    true,
  );
  assert.equal((await release({ manifest })).body, JSON.stringify({ message: 'No new posts' }));

  const published = await knowledge({ generatedAt: '2026-03-08T00:00:00Z', projects: [] });
  assert.equal(published.statusCode, 200);
  const envelope = JSON.parse(objects.get('media/artifacts/chat/knowledge.json').Body);
  assert.equal(envelope.version, 1);
  assert.match(envelope.contentHash, /^sha256:[a-f0-9]{64}$/);

  process.env.RUNTIME_PARAMETER_NAME = '/portfolio/prod/notifications';
  const notify = (await import('./dist/handlers/notify-post.js')).handler;
  const notified = await notify({ title: 'A', url: 'https://matiasgaleano.dev/blog/a' });
  assert.equal(JSON.parse(notified.body).recipients, 1);
  assert.deepEqual(sent, ['uno@example.com']);
  globalThis.fetch = blockedFetch;
  assert.deepEqual(
    [...new Set(parameters)],
    ['/portfolio/prod/editorial', '/portfolio/prod/notifications'],
  );
  report('release/notify/knowledge con SSM, R2, Lambda y Resend simulados');
}
