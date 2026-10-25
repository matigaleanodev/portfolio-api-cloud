import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
console.info = () => undefined;
assert.equal(existsSync('dist/validation/handler.js'), true);
const records = new Map();
let secrets = 0,
  operations = 0;
SecretsManagerClient.prototype.send = async (command) => {
  assert.ok(command instanceof GetSecretValueCommand);
  secrets++;
  return {
    SecretString: JSON.stringify({
      RESEND_API_KEY: 'validation-only',
      OPENAI_API_KEY: 'validation-only',
      CONTACT_FROM_EMAIL: 'from@example.invalid',
      CONTACT_TO_EMAIL: 'to@example.invalid',
      PORTFOLIO_CLOUD_API_URL: 'https://cloud.example.invalid',
      QUOTA_KEY_SECRET: 's'.repeat(32),
      AI_DAILY_BUDGET_MICROUSD: '1000',
      AI_PRICING_VALID_UNTIL: new Date(Date.now() + 86400000).toISOString(),
    }),
  };
};
DynamoDBClient.prototype.send = async (command) => {
  operations++;
  const key = command.input.Key?.pk.S ?? command.input.Item?.pk.S;
  if (command instanceof GetItemCommand) return { Item: records.get(key) };
  assert.ok(command instanceof PutItemCommand);
  records.set(key, command.input.Item);
  return {};
};
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_LAMBDA_FUNCTION_NAME = 'portfolio-api-cloud-test';
process.env.QUOTA_TABLE_NAME = 'portfolio-api-cloud-test-control';
process.env.RUNTIME_SECRET_ARN =
  'arn:aws:secretsmanager:us-east-1:650387442642:secret:portfolio-api-cloud/test/runtime-Ab1234';
process.env.TRUSTED_API_ID = 'local';
const { handler } = await import('./dist/validation/handler.js');
const event = {
  version: '2.0',
  rawPath: '/api/contact',
  headers: { 'content-type': 'application/json' },
  requestContext: {
    apiId: 'local',
    domainName: 'local.execute-api.us-east-1.amazonaws.com',
    stage: '$default',
    http: { method: 'POST', sourceIp: '192.0.2.1' },
  },
  isBase64Encoded: false,
  body: JSON.stringify({
    name: 'Prueba',
    email: 'test@example.invalid',
    message: 'Mensaje de validación.',
  }),
};
assert.equal((await handler(event)).statusCode, 204);
assert.equal(secrets, 1);
assert.ok(operations >= 2);
await assert.rejects(fetch('https://api.resend.com/emails'), /Red y proveedores reales bloqueados/);
console.log(
  'Paquete de validación aislado: entrypoint real, SDK Secrets/Dynamo simulados solo en el smoke, contacto sin red.',
);
