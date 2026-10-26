import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
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
  PRODUCTION_RUNTIME_SECRET_ARN:
    'arn:aws:secretsmanager:us-east-1:650387442642:secret:portfolio-api-cloud/test/runtime-Ab1234',
  PRODUCTION_AWS_ROLE_ARN: 'arn:aws:iam::650387442642:role/PortfolioApiCloudTestGitHubDeployRole',
  PRODUCTION_EXECUTION_ROLE_ARN:
    'arn:aws:iam::650387442642:role/PortfolioApiCloudTestCloudFormationExecutionRole',
  PRODUCTION_CDK_DEPLOY_ROLE_ARN:
    'arn:aws:iam::650387442642:role/PortfolioApiCloudTestCdkDeployRole',
};

test('Dadas referencias test explícitas, cuando se ejecutan los prerrequisitos reales del workflow, entonces admite solamente los roles y secreto previstos', () => {
  expect(spawnSync('bash', ['-c', prerequisites], { env: environment }).status).toBe(0);
  for (const key of Object.keys(environment).filter((name) => name !== 'PATH')) {
    for (const value of ['', 'arn:aws:iam::000000000000:role/Administrator']) {
      expect(
        spawnSync('bash', ['-c', prerequisites], { env: { ...environment, [key]: value } }).status,
      ).toBe(1);
    }
  }
  expect(
    spawnSync('bash', ['-c', prerequisites], {
      env: {
        ...environment,
        PRODUCTION_RUNTIME_SECRET_ARN: environment.PRODUCTION_RUNTIME_SECRET_ARN.replace(
          '/test/',
          '/prod/',
        ),
      },
    }).status,
  ).toBe(1);
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
