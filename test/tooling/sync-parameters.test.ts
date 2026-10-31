import { afterEach, expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parameterKeys, secretKeys } from '@portfolio-api-cloud/contracts/configuration';

const workflow = readFileSync('.github/workflows/sync-parameters.yml', 'utf8');
const step = (name: string) =>
  workflow
    .match(
      new RegExp(
        `name: ${name}\\n[\\s\\S]*?        shell: bash\\n        run: \\|\\n([\\s\\S]*?)(?=\\n      - |\\n?$)`,
      ),
    )![1]!
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n');
const validate = step('Validate every required secret before authentication');
const publish = step('Publish every payload after validating all of them');
const secrets = Object.fromEntries(
  secretKeys.map((key, index) => [key, `sensitive-${index}-${key}`]),
);
// Mismo reparto que contracts/configuration.ts (parameterKeys).
const segments: Record<string, readonly string[]> = parameterKeys;
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

/** Ejecuta un paso con un `aws` simulado que registra cada escritura y su payload. */
function run(
  script: string,
  env: Record<string, string>,
  caller = 'PortfolioApiCloudParametersSyncRole',
) {
  const root = mkdtempSync(join(tmpdir(), 'sync-parameters-'));
  directories.push(root);
  writeFileSync(
    join(root, 'aws'),
    `#!/usr/bin/env bash
if [[ "$1 $2" == "sts get-caller-identity" ]]; then
  [[ "$*" == *Account* ]] && echo 650387442642 || echo "arn:aws:sts::650387442642:assumed-role/${caller}/session"
  exit 0
fi
if [[ "$1 $2" == "ssm put-parameter" ]]; then
  for arg in "$@"; do [[ "$arg" == file://* ]] && file="\${arg#file://}"; done
  printf '%s\\t%s\\t%s\\n' "$*" "$(stat -c %a "$file")" "$(cat "$file")" >> "${root}/calls"
  echo 3
  exit 0
fi
echo "inesperado: $*" >&2; exit 9
`,
  );
  chmodSync(join(root, 'aws'), 0o755);
  const summary = join(root, 'summary');
  const result = spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: {
      PATH: `${root}:/usr/bin:/bin`,
      RUNNER_TEMP: root,
      GITHUB_STEP_SUMMARY: summary,
      AWS_REGION: 'us-east-1',
      ...env,
    },
  });
  let calls: string[][] = [];
  try {
    calls = readFileSync(join(root, 'calls'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => line.split('\t'));
  } catch {
    calls = [];
  }
  return {
    ...result,
    calls,
    leftovers: spawnSync('find', [root, '-name', '*.json']).stdout.toString(),
  };
}

test('Dado el workflow de sync, cuando se inspecciona, entonces solo se dispara a mano en main, con environment protegido, OIDC propio y sin artifacts', () => {
  const triggers = workflow.slice(workflow.indexOf('on:'), workflow.indexOf('permissions:'));
  expect(triggers).toContain('workflow_dispatch:');
  expect(triggers).not.toMatch(/push:|pull_request|schedule:|workflow_run|repository_dispatch/);
  expect(workflow).toContain("github.ref == 'refs/heads/main'");
  expect(workflow).toContain("vars.PARAMETERS_SYNC_ENABLED == 'true'");
  expect(workflow).toContain('environment: production-parameters\n');
  expect(workflow).toMatch(/^permissions:\n  contents: read\n/m);
  expect(workflow.match(/id-token: write/g)).toHaveLength(1);
  expect(workflow).toContain(
    'role-to-assume: arn:aws:iam::650387442642:role/PortfolioApiCloudParametersSyncRole',
  );
  expect(workflow).toContain("allowed-account-ids: '650387442642'");
  expect(workflow).not.toMatch(
    /upload-artifact|actions\/checkout|set -x|--with-decryption|get-parameter|--tier|--key-id|pull_request_target/,
  );
  expect(workflow).toContain('--type SecureString --overwrite');
  // Secrets solo en el env de los steps que los usan, vacíos con target validation.
  const job = workflow.slice(workflow.indexOf('  sync:'), workflow.indexOf('    steps:'));
  expect(job).not.toContain('secrets.');
  for (const name of [
    'Validate every required secret before authentication',
    'Publish every payload after validating all of them',
  ]) {
    const block = workflow.slice(
      workflow.indexOf(`name: ${name}`),
      workflow.indexOf('run: |', workflow.indexOf(`name: ${name}`)),
    );
    for (const key of secretKeys)
      expect(block).toContain(
        `${key}: \${{ inputs.target == 'production' && secrets.${key} || '' }}`,
      );
  }
  expect(workflow.match(/secrets\./g)).toHaveLength(secretKeys.length * 2);
  // Los secretos llegan solo por entorno: nunca se interpolan en scripts.
  for (const script of [validate, publish]) expect(script).not.toContain('${{');
  expect(publish).not.toMatch(/echo[^\n]*\$\{?(?:QUOTA|ORIGIN|RESEND|OPENAI|R2_)/);
});

test('Dados todos los secrets, cuando se publica producción, entonces escribe los cuatro payloads exactos sin exponer valores', () => {
  const env = { TARGET: 'production', ...secrets };
  expect(run(validate, env).status).toBe(0);
  const result = run(publish, env);
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(result.calls.map(([args]) => args!.match(/--name (\S+)/)![1])).toEqual(
    Object.keys(segments).map((segment) => `/portfolio/prod/${segment}`),
  );
  for (const [index, [segment, keys]] of Object.entries(segments).entries()) {
    const [args, mode, payload] = result.calls[index]!;
    expect(args).toContain('--type SecureString --overwrite');
    expect(args).toMatch(/--value file:\/\//);
    expect(mode).toBe('600');
    expect(JSON.parse(payload!), segment).toEqual(
      Object.fromEntries(keys.map((k) => [k, secrets[k]])),
    );
  }
  for (const value of Object.values(secrets))
    expect(result.stdout + result.stderr).not.toContain(value);
  expect(result.stdout).toContain('/portfolio/prod/api: versión 3 (updated)');
  expect(result.leftovers).toBe('');
});

test.each(secretKeys)(
  'Dado %s vacío, cuando se valida, entonces falla sin escribir ningún parámetro',
  (key) => {
    const env = { TARGET: 'production', ...secrets, [key]: '' };
    const validation = run(validate, env);
    expect(validation.status).toBe(1);
    expect(validation.stderr).toContain(key);
    const publication = run(publish, env);
    expect(publication.status).not.toBe(0);
    expect(publication.calls).toEqual([]);
  },
);

test('Dada otra identidad, cuando se intenta publicar, entonces falla antes de escribir', () => {
  const result = run(
    publish,
    { TARGET: 'production', ...secrets },
    'PortfolioApiCloudTestCdkDeployRole',
  );
  expect(result.status).not.toBe(0);
  expect(result.calls).toEqual([]);
});

test('Dado el target validation, cuando se publica, entonces escribe solo api y chat con valores sintéticos compartidos', () => {
  const result = run(publish, { TARGET: 'validation' });
  expect(result.status).toBe(0);
  expect(result.calls.map(([args]) => args!.match(/--name (\S+)/)![1])).toEqual([
    '/portfolio/validation/api',
    '/portfolio/validation/chat',
  ]);
  const [api, chat] = result.calls.map(([, , payload]) => JSON.parse(payload!));
  expect(Object.keys(api).sort()).toEqual(
    [
      'QUOTA_KEY_SECRET',
      'RESEND_CONTACT_API_KEY',
      'R2_SUBSCRIBERS_ACCESS_KEY_ID',
      'R2_SUBSCRIBERS_SECRET_ACCESS_KEY',
    ].sort(),
  );
  expect(Object.keys(chat).sort()).toEqual(['OPENAI_API_KEY', 'QUOTA_KEY_SECRET']);
  expect(chat.OPENAI_API_KEY).toBe('validation-only');
  expect(api.R2_SUBSCRIBERS_SECRET_ACCESS_KEY).toBe('validation-only');
  expect(api.QUOTA_KEY_SECRET).toMatch(/^[a-f0-9]{64}$/);
  expect(chat.QUOTA_KEY_SECRET).toBe(api.QUOTA_KEY_SECRET);
  expect(api.RESEND_CONTACT_API_KEY).toBe('validation-only');
  expect(run(publish, { TARGET: 'other' }).status).not.toBe(0);
});

test('Dado el rol de sync, cuando se inspecciona, entonces confía solo en el environment production y escribe sin leer ni descifrar', () => {
  const resources = JSON.parse(
    readFileSync('packages/infrastructure/templates/delivery-access.template.json', 'utf8'),
  ).Resources;
  const role = resources.ParametersSyncRole.Properties;
  expect(role.RoleName).toBe('PortfolioApiCloudParametersSyncRole');
  expect(role.PermissionsBoundary).toEqual({ Ref: 'ParametersSyncBoundary' });
  expect(role.Policies).toHaveLength(1);
  expect(role.Policies[0].PolicyDocument).toEqual(
    resources.ParametersSyncBoundary.Properties.PolicyDocument,
  );
  expect(role.AssumeRolePolicyDocument.Statement).toEqual([
    {
      Effect: 'Allow',
      Action: 'sts:AssumeRoleWithWebIdentity',
      Principal: {
        Federated: 'arn:aws:iam::650387442642:oidc-provider/token.actions.githubusercontent.com',
      },
      Condition: {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub':
            'repo:matigaleanodev@99203645/portfolio-api-cloud@1432631186:environment:production-parameters',
        },
      },
    },
  ]);
  const parameters = [
    ...['api', 'chat', 'editorial', 'notifications'].map((s) => `/portfolio/prod/${s}`),
    ...['api', 'chat'].map((s) => `/portfolio/validation/${s}`),
  ].map((name) => `arn:aws:ssm:us-east-1:650387442642:parameter${name}`);
  expect(role.Policies[0].PolicyDocument.Statement).toEqual([
    { Effect: 'Allow', Action: ['ssm:PutParameter'], Resource: parameters },
    {
      Effect: 'Allow',
      Action: ['kms:Encrypt', 'kms:GenerateDataKey'],
      Resource: 'arn:aws:kms:us-east-1:650387442642:key/*',
      Condition: {
        StringEquals: {
          'kms:ViaService': 'ssm.us-east-1.amazonaws.com',
          'kms:EncryptionContext:PARAMETER_ARN': parameters,
        },
      },
    },
  ]);
  const text = JSON.stringify(resources);
  expect(text).not.toContain('secretsmanager:');
  // Fuera del rol de sync, ninguna identidad de entrega toca los parámetros de runtime.
  for (const [name, resource] of Object.entries(resources) as [string, object][])
    if (!name.startsWith('ParametersSync'))
      expect(JSON.stringify(resource), name).not.toContain('parameter/portfolio/');
  const decrypting = JSON.stringify(resources.ParametersSyncBoundary);
  expect(decrypting).not.toContain('kms:Decrypt');
});
