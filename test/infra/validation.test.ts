import { expect, test } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { existsSync } from 'node:fs';
import { PortfolioApiStack } from '../../infra/stack.js';
test('Dado el asset separado de validación, cuando se sintetiza, entonces conserva la misma instalación e IAM con otro handler', () => {
  const stack = new PortfolioApiStack(
    new App({ context: { stage: 'test', validationScenario: 'success' } }),
  );
  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::Lambda::Function', 1);
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'portfolio-api-cloud-test',
    Handler: 'dist/validation/handler.handler',
  });
  template.resourceCountIs('AWS::DynamoDB::Table', 1);
  expect(existsSync('.tmp/lambda/dist/validation')).toBe(false);
  expect(existsSync('.tmp/lambda-validation/validation.json')).toBe(true);
  expect(
    () =>
      new PortfolioApiStack(
        new App({ context: { stage: 'test', validationScenario: 'public-flag' } }),
      ),
  ).toThrow();
});
