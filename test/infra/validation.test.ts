import { beforeAll, expect, test } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { existsSync } from 'node:fs';
import { PortfolioApiStack } from '../../packages/infrastructure/src/stack.js';

let template: Template;
let production: Template;
beforeAll(() => {
  template = Template.fromStack(
    new PortfolioApiStack(
      new App({ context: { stage: 'production', validationScenario: 'success' } }),
    ),
  );
  production = Template.fromStack(
    new PortfolioApiStack(new App({ context: { stage: 'production' } })),
  );
}, 60_000);

const functionsOf = (t: Template) =>
  Object.values(t.findResources('AWS::Lambda::Function')).map((r) => r.Properties) as Record<
    string,
    any
  >[];
const byName = (t: Template, name: string) => functionsOf(t).find((f) => f.FunctionName === name)!;

test('Dada la variante de validación, cuando se sintetiza, entonces solo cambia código, parámetros y configuración de las funciones HTTP', () => {
  expect(functionsOf(template)).toHaveLength(6);
  expect(byName(template, 'portfolio-api-cloud-test').Handler).toBe('dist/validation/api.handler');
  expect(byName(template, 'portfolio-api-cloud-test-chat').Handler).toBe(
    'dist/validation/chat.handler',
  );
  const api = byName(template, 'portfolio-api-cloud-test').Environment.Variables;
  expect(api).toMatchObject({
    RUNTIME_PARAMETER_NAME: '/portfolio/validation/api',
    CHAT_PARAMETER_NAME: '/portfolio/validation/chat',
    CONTACT_FROM_EMAIL: 'from@example.invalid',
    CONTACT_TO_EMAIL: 'to@example.invalid',
    AI_DAILY_BUDGET_MICROUSD: '1000',
    AI_PRICING_VALID_UNTIL: { Ref: 'AiPricingValidUntil' },
    SUBSCRIBERS_R2_ENDPOINT: 'https://subscribers.example.invalid',
    SUBSCRIBERS_R2_BUCKET: 'validation-subscribers',
  });
  expect(Object.keys(api).filter((key) => /^(?:R2_|CHAT_KNOWLEDGE)/.test(key))).toEqual([]);
  expect(
    byName(template, 'portfolio-api-cloud-test-chat').Environment.Variables.RUNTIME_PARAMETER_NAME,
  ).toBe('/portfolio/validation/chat');
  // Editorial idéntico a producción: la validación no orfana logs retenidos ni roles.
  for (const name of [
    'portfolio-api-cloud-test-process-release',
    'portfolio-api-cloud-test-generate-og',
    'portfolio-api-cloud-test-notify-post',
    'portfolio-api-cloud-test-publish-chat-knowledge',
  ])
    expect(byName(template, name)).toEqual(byName(production, name));
  expect(Object.keys(template.findResources('AWS::Logs::LogGroup')).sort()).toEqual(
    Object.keys(production.findResources('AWS::Logs::LogGroup')).sort(),
  );
  expect(Object.keys(template.findResources('AWS::IAM::Role')).sort()).toEqual(
    Object.keys(production.findResources('AWS::IAM::Role')).sort(),
  );
  const text = JSON.stringify(template.toJSON());
  expect(text).not.toContain('parameter/portfolio/prod/api');
  expect(text).not.toContain('parameter/portfolio/prod/chat');
  expect(Object.keys(template.toJSON().Parameters)).not.toContain('ContactFromEmail');
  expect(existsSync('.tmp/lambda-validation-api')).toBe(true);
  expect(existsSync('.tmp/lambda-validation-chat')).toBe(true);
  expect(
    () =>
      new PortfolioApiStack(
        new App({ context: { stage: 'production', validationScenario: 'public-flag' } }),
      ),
  ).toThrow();
});
