import { expect, test } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync('.github/workflows/plan-production.yml', 'utf8');
const prerequisites = workflow
  .match(
    /name: Check prerequisites before authentication[\s\S]*?run: \|\n([\s\S]*?)\n      - uses:/,
  )![1]!
  .split('\n')
  .map((line) => line.slice(10))
  .join('\n');
const environment = {
  PATH: '/usr/bin:/bin',
  ARTIFACT_RUN_ID: '40203426084',
  ARTIFACT_ID: '12602797574',
  REVIEWED_REVISION: 'a'.repeat(40),
  REVIEWED_DIGEST: 'sha256:' + 'b'.repeat(64),
  PRODUCTION_CONTACT_FROM_EMAIL: 'Portfolio <from@example.com>',
  PRODUCTION_CONTACT_TO_EMAIL: 'to@example.com',
  PRODUCTION_BLOG_FROM_EMAIL: 'blog@example.com',
  PRODUCTION_AI_DAILY_BUDGET_MICROUSD: '250000',
  PRODUCTION_AI_PRICING_VALID_UNTIL: '2026-11-20T00:00:00.000Z',
  PRODUCTION_R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
  PRODUCTION_R2_BUCKET: 'media-bucket',
  PRODUCTION_R2_SUBSCRIBERS_BUCKET: 'subscribers-bucket',
  PRODUCTION_MEDIA_BASE_URL: 'https://media.example.com',
  PRODUCTION_AWS_ROLE_ARN: 'arn:aws:iam::650387442642:role/PortfolioApiCloudTestGitHubDeployRole',
  PRODUCTION_EXECUTION_ROLE_ARN:
    'arn:aws:iam::650387442642:role/PortfolioApiCloudTestCloudFormationExecutionRole',
  PRODUCTION_CDK_DEPLOY_ROLE_ARN:
    'arn:aws:iam::650387442642:role/PortfolioApiCloudTestCdkDeployRole',
};
const optional = { CERTIFICATE_ARN: '', ALARM_TOPIC_ARN: '' };
const run = (env: Record<string, string>) =>
  spawnSync('bash', ['-c', prerequisites], { env: { ...optional, ...env } }).status;

test('Dada configuración del environment, cuando se ejecutan los prerrequisitos reales del plan, entonces admite solamente valores y roles previstos', () => {
  expect(run(environment)).toBe(0);
  expect(
    run({
      ...environment,
      CERTIFICATE_ARN: 'arn:aws:acm:us-east-1:650387442642:certificate/abc-123',
      ALARM_TOPIC_ARN: 'arn:aws:sns:us-east-1:650387442642:portfolio-api-cloud-alerts',
    }),
  ).toBe(0);
  for (const key of Object.keys(environment).filter((name) => name !== 'PATH'))
    for (const value of ['', 'arn:aws:iam::000000000000:role/Administrator'])
      expect(run({ ...environment, [key]: value }), key).toBe(1);
  for (const [key, value] of [
    ['PRODUCTION_AI_DAILY_BUDGET_MICROUSD', '1000001'],
    ['PRODUCTION_AI_PRICING_VALID_UNTIL', '2026-11-20'],
    ['PRODUCTION_R2_ENDPOINT', 'http://r2.example.com'],
    ['PRODUCTION_MEDIA_BASE_URL', 'http://media.example.com'],
    ['PRODUCTION_R2_SUBSCRIBERS_BUCKET', 'Bad_Bucket'],
    ['PRODUCTION_R2_SUBSCRIBERS_BUCKET', 'media-bucket'],
    ['PRODUCTION_CONTACT_TO_EMAIL', 'to@example.com\nBcc: other@example.com'],
    ['CERTIFICATE_ARN', 'arn:aws:acm:us-east-1:000000000000:certificate/abc'],
    ['ALARM_TOPIC_ARN', 'arn:aws:sns:us-east-1:650387442642:other'],
  ])
    expect(run({ ...environment, [key!]: value! }), key).toBe(1);
  for (const parameter of [
    'ContactFromEmail',
    'ContactToEmail',
    'AiDailyBudgetMicrousd',
    'AiPricingValidUntil',
    'R2Endpoint',
    'R2Bucket',
    'R2SubscribersBucket',
    'MediaBaseUrl',
    'BlogFromEmail',
  ])
    expect(workflow).toContain(`--parameters "${parameter}=$PRODUCTION_`);
  expect(workflow).not.toMatch(
    /RuntimeSecretArn|PortfolioCloudApiUrl|PORTFOLIO_CLOUD_API_URL|RUNTIME_SECRET/,
  );
});

test('Dadas variables no sensibles, cuando se planifica, entonces provienen del environment production sin autenticar ese job', () => {
  const configuration = workflow.slice(
    workflow.indexOf('  configuration:'),
    workflow.indexOf('  prepare:'),
  );
  expect(configuration).toContain('environment: production\n');
  expect(configuration).toContain('permissions: {}');
  expect(configuration).not.toMatch(/id-token|configure-aws-credentials|checkout|secrets\./);
  for (const name of [
    'CONTACT_FROM_EMAIL',
    'CONTACT_TO_EMAIL',
    'AI_DAILY_BUDGET_MICROUSD',
    'AI_PRICING_VALID_UNTIL',
    'R2_ENDPOINT',
    'R2_BUCKET',
    'R2_SUBSCRIBERS_BUCKET',
    'MEDIA_BASE_URL',
    'BLOG_FROM_EMAIL',
    'CERTIFICATE_ARN',
    'ALARM_TOPIC_ARN',
  ])
    expect(configuration).toContain(`\${{ vars.${name} }}`);
  const prepare = workflow.slice(workflow.indexOf('  prepare:'));
  expect(prepare).toContain('needs: configuration');
  expect(prepare).toContain('environment: production-plan');
  expect(prepare).not.toMatch(/vars\.PRODUCTION_(?:CONTACT|AI_|R2_|MEDIA|BLOG|CERTIFICATE|ALARM)/);
  expect(prepare).toContain('check_catalog(template, validation=False)');
});

test('Dado el plan test, cuando se revisan sus barreras, entonces retiene el assembly antes de OIDC y prepara sin ejecutar', () => {
  expect(workflow).toContain("github.ref == 'refs/heads/main'");
  expect(workflow).toContain("vars.PRODUCTION_PLAN_ENABLED == 'true'");
  expect(workflow).toContain('environment: production-plan');
  expect(workflow).toContain('scripts/recover_bundle.py');
  expect(workflow).toContain('git merge-base --is-ancestor');
  expect(workflow).toContain('fetch-depth: 0');
  expect(workflow).toContain('cmp package-lock.json .tmp/recovered/package-lock.json');
  expect(workflow).not.toContain('npm run cdk -- synth');
  expect(workflow.indexOf('scripts/review_bundle.py verify')).toBeLessThan(
    workflow.indexOf('aws-actions/configure-aws-credentials'),
  );
  expect(workflow).toContain(
    '--app .tmp/recovered/cdk.out --exclusively --method prepare-change-set',
  );
  expect(workflow).not.toMatch(/execute-change-set|cdk (?:bootstrap|destroy)|pull_request_target/);
  for (const file of ['ci.yml', 'plan-production.yml']) {
    const text = readFileSync(`.github/workflows/${file}`, 'utf8');
    expect(text).toContain('retention-days: 30');
    expect(text).toContain('if-no-files-found: error');
    expect(text).toContain('include-hidden-files: true');
  }
});

test('Dados los parámetros SSM del template, cuando se prepara el changeset, entonces exige que existan como SecureString sin descifrarlos', () => {
  const guard = workflow.slice(
    workflow.indexOf('name: Require the runtime parameters before preparing'),
    workflow.indexOf('name: Publish assets and prepare a change set without execution'),
  );
  expect(guard.length).toBeGreaterThan(0);
  expect(workflow.indexOf('Verify personal test identity')).toBeLessThan(
    workflow.indexOf('Require the runtime parameters before preparing'),
  );
  for (const segment of ['api', 'chat', 'editorial', 'notifications'])
    expect(guard).toContain(`/portfolio/prod/${segment}`);
  expect(guard).toContain('aws ssm get-parameters');
  expect(guard).toContain('Parameters[].{Name:Name,Type:Type,Version:Version}');
  expect(guard).not.toMatch(/with-decryption|Value/);
  expect(guard).toContain("item['Type'] != 'SecureString'");
});

test.each([
  ['completos', 'SecureString', [], 0],
  ['uno faltante', 'SecureString', ['/portfolio/prod/notifications'], 1],
  ['uno en texto plano', 'String', [], 1],
] as const)(
  'Dados parámetros %s, cuando corre el guard real, entonces decide sin leer valores',
  (_case, type, invalid, status) => {
    const script = workflow
      .match(
        /name: Require the runtime parameters before preparing\n        shell: bash\n        run: \|\n([\s\S]*?)\n      - /,
      )![1]!
      .split('\n')
      .map((line) => line.slice(10))
      .join('\n');
    const root = mkdtempSync(join(tmpdir(), 'parameters-guard-'));
    try {
      mkdirSync(join(root, '.tmp'));
      const found = ['api', 'chat', 'editorial', 'notifications']
        .map((s) => `/portfolio/prod/${s}`)
        .filter((name) => !invalid.includes(name as never))
        .map((Name, index) => ({ Name, Type: index === 0 ? type : 'SecureString', Version: 2 }));
      writeFileSync(
        join(root, 'aws'),
        `#!/usr/bin/env bash\n[[ "$*" == *with-decryption* ]] && exit 7\necho '${JSON.stringify({ found, invalid })}'\n`,
      );
      chmodSync(join(root, 'aws'), 0o755);
      const result = spawnSync('bash', ['-c', script], {
        cwd: root,
        encoding: 'utf8',
        env: { PATH: `${root}:/usr/bin:/bin` },
      });
      expect(result.status, result.stderr).toBe(status);
      if (status === 0) expect(result.stdout).toContain('/portfolio/prod/api: SecureString v2');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
