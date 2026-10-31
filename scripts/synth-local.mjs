import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);

// Sin perfiles ni credenciales heredadas: síntesis sin lookups ni acceso a la cuenta.
const inherited = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !/^(?:AWS_|CDK_)/.test(name)),
);
execFileSync(
  process.execPath,
  [
    fileURLToPath(new URL('node_modules/aws-cdk/bin/cdk', root)),
    'synth',
    '--no-lookups',
    '--no-notices',
    '--context',
    'stage=production',
    '--quiet',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...inherited,
      AWS_ACCESS_KEY_ID: 'local-synth',
      AWS_SECRET_ACCESS_KEY: 'local-synth',
      AWS_REGION: 'us-east-1',
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_SHARED_CREDENTIALS_FILE: '/dev/null',
      AWS_CONFIG_FILE: '/dev/null',
      CDK_DISABLE_VERSION_CHECK: 'true',
    },
  },
);

/** Revisión local del assembly: recursos esperados y ausencia de permisos amplios. */
function reviewTemplate(template) {
  const resources = Object.entries(template.Resources);
  const failures = [];
  const ofType = (type) => resources.filter(([, resource]) => resource.Type === type);
  const functions = ofType('AWS::Lambda::Function').map(([, r]) => r.Properties);
  if (functions.length !== 6) failures.push(`Se esperaban 6 funciones: ${functions.length}`);
  for (const fn of functions) {
    if (fn.ReservedConcurrentExecutions !== undefined)
      failures.push(`Concurrencia reservada: ${fn.FunctionName}`);
    if (fn.TracingConfig) failures.push(`X-Ray no previsto: ${fn.FunctionName}`);
  }
  // Capa gratuita de CloudWatch: tres alarmas de una métrica y sin access logs del stage.
  const alarms = ofType('AWS::CloudWatch::Alarm');
  if (alarms.length !== 3 || alarms.some(([, alarm]) => alarm.Properties.Metrics))
    failures.push(`Se esperaban 3 alarmas simples: ${alarms.length}`);
  for (const [id, stage] of ofType('AWS::ApiGatewayV2::Stage'))
    if (stage.Properties.AccessLogSettings) failures.push(`Access logs no previstos: ${id}`);
  for (const [id, role] of ofType('AWS::IAM::Role'))
    if (!role.Properties.PermissionsBoundary) failures.push(`Rol sin boundary: ${id}`);
  for (const [id, log] of ofType('AWS::Logs::LogGroup'))
    if (log.DeletionPolicy !== 'Retain' || !log.Properties.RetentionInDays)
      failures.push(`Log group sin retención: ${id}`);
  for (const type of ['AWS::IAM::ManagedPolicy', 'AWS::IAM::User', 'AWS::SecretsManager::Secret'])
    if (ofType(type).length) failures.push(`Recurso no previsto: ${type}`);
  for (const [id, policy] of ofType('AWS::IAM::Policy'))
    for (const statement of policy.Properties.PolicyDocument.Statement) {
      const actions = [statement.Action].flat();
      const targets = [statement.Resource].flat();
      if (actions.some((action) => action === '*' || action.endsWith(':*')))
        failures.push(`Acción comodín: ${id}`);
      if (targets.includes('*')) failures.push(`Recurso comodín: ${id}`);
      if (
        actions.some((action) => action.startsWith('secretsmanager:') || action.startsWith('iam:'))
      )
        failures.push(`Acción no prevista: ${id}`);
      const kms = targets.some((target) => typeof target === 'string' && target.includes(':kms:'));
      if (kms && !statement.Condition?.StringEquals?.['kms:EncryptionContext:PARAMETER_ARN'])
        failures.push(`kms sin contexto de parámetro: ${id}`);
    }
  for (const [id, permission] of ofType('AWS::Lambda::Permission'))
    if (permission.Properties.Principal === '*') failures.push(`Invocación pública: ${id}`);
  return failures;
}

const manifest = JSON.parse(readFileSync(new URL('cdk.out/manifest.json', root), 'utf8'));
const template = JSON.parse(
  readFileSync(
    new URL(`cdk.out/${manifest.artifacts.PortfolioApiCloudTest.properties.templateFile}`, root),
    'utf8',
  ),
);
const failures = reviewTemplate(template);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.info(
  'Assembly local revisado: 6 funciones, 3 alarmas, roles con boundary, logs retenidos y IAM acotado.',
);
