import { expect, test } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PortfolioApiStack } from '../../packages/infrastructure/src/stack.js';
import { RELEASE_INVOKER_ROLE } from '../../packages/infrastructure/src/editorial.js';
import { environmentKeys, secretKeys } from '@portfolio-api-cloud/contracts/configuration';
import { functions } from '@portfolio-api-cloud/contracts/functions';
import { editorialEnvironment } from '@portfolio-api-cloud/contracts/editorial';

const app = new App({ context: { stage: 'production' } });
const stack = new PortfolioApiStack(app);
const template = Template.fromStack(stack);
const json = template.toJSON() as {
  Parameters: Record<string, Record<string, unknown>>;
  Resources: Record<string, { Type: string; Properties: Record<string, any>; [key: string]: any }>;
};
const resources = Object.entries(json.Resources);
const ofType = (type: string) => resources.filter(([, resource]) => resource.Type === type);
const functionId = (name: string) =>
  ofType('AWS::Lambda::Function').find(([, r]) => r.Properties.FunctionName === name)![0];
const fnProps = (name: string) => json.Resources[functionId(name)]!.Properties;
const roleOf = (name: string) => fnProps(name).Role['Fn::GetAtt'][0] as string;
const statementsOf = (name: string) => {
  const role = roleOf(name);
  return ofType('AWS::IAM::Policy')
    .filter(([, policy]) => policy.Properties.Roles.some((r: { Ref: string }) => r.Ref === role))
    .flatMap(([, policy]) => policy.Properties.PolicyDocument.Statement) as {
    Action: string | string[];
    Resource: unknown;
    Condition?: Record<string, Record<string, unknown>>;
  }[];
};
const catalog = Object.values(functions);
const parameter = (segment: string) =>
  `arn:aws:ssm:us-east-1:650387442642:parameter/portfolio/prod/${segment}`;
const parameterAccess: Record<string, string[]> = {
  'portfolio-api-cloud-test': ['api', 'chat'],
  'portfolio-api-cloud-test-chat': ['chat'],
  'portfolio-api-cloud-test-process-release': ['editorial'],
  'portfolio-api-cloud-test-generate-og': ['editorial'],
  'portfolio-api-cloud-test-notify-post': ['notifications'],
  'portfolio-api-cloud-test-publish-chat-knowledge': ['editorial'],
};

test('Dado el ambiente production, cuando se define la stack, entonces apunta únicamente a la cuenta y región acordadas', () => {
  expect(() => new PortfolioApiStack(new App({ context: { stage: 'prod' } }))).toThrow(
    'Solo se admite el ambiente production.',
  );
  expect(stack.stackName).toBe('portfolio-api-cloud-test');
  expect(stack.account).toBe('650387442642');
  expect(stack.region).toBe('us-east-1');
});

test('Dada la stack de dev, cuando se sintetiza la versión integrada, entonces retiene identidades y nombres físicos', () => {
  // IDs lógicos del template de dev: cambiar cualquiera reemplazaría la API en servicio.
  for (const [id, type, name] of [
    ['Handler886CB40B', 'AWS::Lambda::Function', 'portfolio-api-cloud-test'],
    ['RuntimeLogs92941AA6', 'AWS::Logs::LogGroup', '/aws/lambda/portfolio-api-cloud-test'],
    ['RuntimeRoleFD8790A4', 'AWS::IAM::Role', 'PortfolioApiCloudTestRuntimeRole'],
    ['RuntimeControlE474B2D1', 'AWS::DynamoDB::Table', 'portfolio-api-cloud-test-control'],
    ['ApiF70053CD', 'AWS::ApiGatewayV2::Api', 'portfolio-api-cloud-test'],
    ['DefaultStageEE28A986', 'AWS::ApiGatewayV2::Stage', '$default'],
    ['ApiDefaultRoute1D83B0D8', 'AWS::ApiGatewayV2::Route', '$default'],
    [
      'HttpServerFailuresAlarm0D4882E5',
      'AWS::CloudWatch::Alarm',
      'portfolio-api-cloud-test-http-errors',
    ],
  ] as const) {
    const resource = json.Resources[id];
    expect(resource?.Type, id).toBe(type);
    const props = resource!.Properties;
    expect(
      props.FunctionName ??
        props.LogGroupName ??
        props.RoleName ??
        props.TableName ??
        props.Name ??
        props.StageName ??
        props.RouteKey ??
        props.AlarmName,
    ).toBe(name);
  }
  for (const id of ['CustomDomain', 'CustomDomainMapping', 'HttpServerFailuresCE194EC0'])
    expect(json.Resources[id], id).toBeDefined();
});

test('Dado el catálogo, cuando se definen las funciones, entonces usa nombres, handlers, memoria, timeout y arquitectura del contrato', () => {
  template.resourceCountIs('AWS::Lambda::Function', 6);
  for (const contract of catalog) {
    expect(fnProps(contract.functionName)).toMatchObject({
      Handler: contract.handler,
      Runtime: 'nodejs24.x',
      MemorySize: contract.memorySize,
      Timeout: contract.timeoutSeconds,
      Architectures: [contract.architecture],
    });
    expect(
      functionId(contract.functionName).startsWith(contract.logicalId) ||
        functionId(contract.functionName).startsWith(`Editorial${contract.logicalId}`),
    ).toBe(true);
  }
  expect(fnProps('portfolio-api-cloud-test-generate-og').Architectures).toEqual(['x86_64']);
  template.resourceCountIs('AWS::Lambda::Url', 0);
  template.resourceCountIs('AWS::Lambda::EventSourceMapping', 0);
  template.resourceCountIs('AWS::Events::Rule', 0);
  template.resourceCountIs('AWS::Scheduler::Schedule', 0);
});

test('Dada la cuota regional de 10, cuando se configura la concurrencia, entonces ninguna función reserva capacidad ni activa X-Ray', () => {
  for (const contract of catalog) {
    expect(fnProps(contract.functionName).ReservedConcurrentExecutions).toBeUndefined();
    expect(fnProps(contract.functionName).TracingConfig).toBeUndefined();
    expect(fnProps(contract.functionName).VpcConfig).toBeUndefined();
  }
});

test('Dados los artifacts, cuando se vinculan assets, entonces editorial.zip se comparte y og, api y chat son propios', () => {
  const keys = Object.fromEntries(
    catalog.map((c) => [c.functionName, fnProps(c.functionName).Code.S3Key as string]),
  );
  expect(new Set(Object.values(keys)).size).toBe(4);
  expect(keys['portfolio-api-cloud-test-process-release']).toBe(
    keys['portfolio-api-cloud-test-notify-post'],
  );
  expect(keys['portfolio-api-cloud-test-process-release']).toBe(
    keys['portfolio-api-cloud-test-publish-chat-knowledge'],
  );
  for (const contract of catalog) {
    const file = `${contract.handler.replace(/\.[^.]+$/, '')}.js`;
    expect(existsSync(join(`.tmp/lambda-${contract.artifact}`, file)), file).toBe(true);
  }
});

test('Dada la configuración sensible, cuando se declara, entonces cada función recibe su parámetro SSM y ningún secreto', () => {
  for (const contract of catalog) {
    const variables = fnProps(contract.functionName).Environment.Variables;
    expect(variables.RUNTIME_PARAMETER_NAME).toBe(
      `/portfolio/prod/${parameterAccess[contract.functionName]![0]}`,
    );
    expect(variables.NODE_ENV).toBe('production');
    expect(variables.RUNTIME_SECRET_ARN).toBeUndefined();
  }
  expect(fnProps('portfolio-api-cloud-test').Environment.Variables.CHAT_PARAMETER_NAME).toBe(
    '/portfolio/prod/chat',
  );
  const text = JSON.stringify(json);
  for (const key of [...secretKeys, 'RESEND_API_KEY', 'R2_ACCESS_KEY_ID'])
    expect(text).not.toContain(key);
  expect(text).not.toContain('secretsmanager');
  expect(json.Parameters.RuntimeSecretArn).toBeUndefined();
  expect(json.Parameters.PortfolioCloudApiUrl).toBeUndefined();
  template.resourceCountIs('AWS::SecretsManager::Secret', 0);
  template.resourceCountIs('AWS::SSM::Parameter', 0);
});

test('Dados los buckets R2, cuando se despliega, entonces una regla impide usar el bucket de medios para suscriptores', () => {
  expect(
    (template.toJSON() as { Rules: Record<string, unknown> }).Rules.PrivateSubscribersBucket,
  ).toEqual({
    Assertions: [
      {
        Assert: {
          'Fn::Not': [{ 'Fn::Equals': [{ Ref: 'R2Bucket' }, { Ref: 'R2SubscribersBucket' }] }],
        },
        AssertDescription: 'R2SubscribersBucket debe ser distinto de R2Bucket.',
      },
    ],
  });
});

test('Dadas las variables de entorno, cuando se comparan con los contratos, entonces cada función recibe exactamente sus claves', () => {
  const allowed = new Set<string>(environmentKeys);
  for (const contract of [functions.api, functions.chat])
    for (const key of Object.keys(fnProps(contract.functionName).Environment.Variables))
      expect(allowed.has(key), `${contract.functionName}: ${key}`).toBe(true);
  for (const [key, { required, optional }] of Object.entries(editorialEnvironment)) {
    const contract = functions[key as keyof typeof editorialEnvironment];
    expect(Object.keys(fnProps(contract.functionName).Environment.Variables).sort()).toEqual(
      ['NODE_ENV', 'RUNTIME_PARAMETER_NAME', ...required, ...optional].sort(),
    );
  }
});

test('Dada configuración no sensible, cuando se declara, entonces llega por parámetros sin defaults privados', () => {
  const required = [
    'ContactFromEmail',
    'ContactToEmail',
    'AiDailyBudgetMicrousd',
    'AiPricingValidUntil',
    'R2Endpoint',
    'R2Bucket',
    'R2SubscribersBucket',
    'MediaBaseUrl',
    'BlogFromEmail',
  ];
  for (const name of required) expect(json.Parameters[name]!.Default, name).toBeUndefined();
  const allowed = (name: string, value: string) =>
    new RegExp(`^(?:${json.Parameters[name]!.AllowedPattern as string})$`).test(value);
  expect(allowed('ContactFromEmail', 'Portfolio <contacto@example.com>')).toBe(true);
  expect(allowed('BlogFromEmail', 'not-an-address')).toBe(false);
  expect(allowed('R2Endpoint', 'https://account.r2.cloudflarestorage.com')).toBe(true);
  for (const value of ['', 'http://r2.example.com'])
    expect(allowed('R2Endpoint', value)).toBe(false);
  expect(allowed('MediaBaseUrl', 'https://media.example.com')).toBe(true);
  expect(allowed('R2SubscribersBucket', 'Invalid_Bucket')).toBe(false);
  for (const value of ['0', '1000001', ''])
    expect(allowed('AiDailyBudgetMicrousd', value)).toBe(false);
  expect(allowed('AiPricingValidUntil', '2026-11-20T00:00:00.000Z')).toBe(true);
  const variables = (name: string) =>
    fnProps(`portfolio-api-cloud-test-${name}`).Environment.Variables;
  expect(variables('process-release')).toMatchObject({
    R2_ENDPOINT: { Ref: 'R2Endpoint' },
    R2_BUCKET: { Ref: 'R2Bucket' },
    R2_REGION: 'auto',
    RELEASE_STAGE_MAX_ATTEMPTS: '2',
    GENERATE_OG_FUNCTION_NAME: { Ref: functionId('portfolio-api-cloud-test-generate-og') },
    NOTIFY_POST_FUNCTION_NAME: { Ref: functionId('portfolio-api-cloud-test-notify-post') },
  });
  expect(variables('generate-og')).toMatchObject({
    MEDIA_BASE_URL: { Ref: 'MediaBaseUrl' },
    OG_OBJECT_PREFIX: 'og',
  });
  expect(variables('notify-post')).toMatchObject({
    SUBSCRIBERS_R2_ENDPOINT: { Ref: 'R2Endpoint' },
    SUBSCRIBERS_R2_BUCKET: { Ref: 'R2SubscribersBucket' },
    R2_BUCKET: { Ref: 'R2Bucket' },
    BLOG_FROM_EMAIL: { Ref: 'BlogFromEmail' },
  });
  expect(variables('publish-chat-knowledge')).toMatchObject({
    CHAT_KNOWLEDGE_OBJECT_KEY: 'artifacts/chat/knowledge.json',
  });
  const http = fnProps('portfolio-api-cloud-test').Environment.Variables;
  expect(fnProps('portfolio-api-cloud-test-chat').Environment.Variables).toMatchObject({
    ...Object.fromEntries(
      Object.entries(http).filter(
        ([k]) => !['RUNTIME_PARAMETER_NAME', 'CHAT_PARAMETER_NAME'].includes(k),
      ),
    ),
  });
  expect(http).toMatchObject({
    CORS_ORIGIN: { Ref: 'CorsOrigin' },
    SUBSCRIBERS_R2_ENDPOINT: { Ref: 'R2Endpoint' },
    SUBSCRIBERS_R2_BUCKET: { Ref: 'R2SubscribersBucket' },
    TRUSTED_API_ID: { Ref: 'ApiF70053CD' },
    TRUSTED_CUSTOM_DOMAIN: { 'Fn::If': ['HasCustomDomain', 'api.matiasgaleano.dev', ''] },
  });
});

test('Dadas las rutas, cuando se integran, entonces chat canónico va a Chat con la misma autorización condicional y el resto a Handler', () => {
  const routeKeys = ofType('AWS::ApiGatewayV2::Route')
    .map(([, r]) => r.Properties.RouteKey)
    .sort();
  expect(routeKeys).toEqual([
    '$default',
    'GET /api/chat/starters',
    'HEAD /api/chat/starters',
    'OPTIONS /{proxy+}',
    'POST /api/chat',
  ]);
  const integrations = Object.fromEntries(
    ofType('AWS::ApiGatewayV2::Integration').map(([id, r]) => [
      id,
      r.Properties.IntegrationUri['Fn::GetAtt'][0],
    ]),
  );
  for (const [, route] of ofType('AWS::ApiGatewayV2::Route')) {
    const key = route.Properties.RouteKey as string;
    const target = integrations[route.Properties.Target['Fn::Join'][1][1].Ref];
    expect(target, key).toBe(
      key.includes('/api/chat') ? functionId('portfolio-api-cloud-test-chat') : 'Handler886CB40B',
    );
    expect(route.Properties.AuthorizationType, key).toEqual(
      key.startsWith('OPTIONS') ? 'NONE' : { 'Fn::If': ['PublicIngress', 'NONE', 'AWS_IAM'] },
    );
  }
  for (const [, integration] of ofType('AWS::ApiGatewayV2::Integration'))
    expect(integration.Properties).toMatchObject({
      IntegrationType: 'AWS_PROXY',
      PayloadFormatVersion: '2.0',
      TimeoutInMillis: 29000,
    });
});

test('Dado el stage, cuando se configura, entonces conserva el límite 2/5 sin access logs ni log groups de API Gateway', () => {
  template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
    StageName: '$default',
    AutoDeploy: true,
    DefaultRouteSettings: { ThrottlingRateLimit: 2, ThrottlingBurstLimit: 5 },
    AccessLogSettings: Match.absent(),
  });
  for (const [, group] of ofType('AWS::Logs::LogGroup'))
    expect(group.Properties.LogGroupName.startsWith('/aws/lambda/')).toBe(true);
});

test('Dados los log groups, cuando se reemplaza la stack, entonces cada función tiene el suyo retenido con catorce días', () => {
  const groups = ofType('AWS::Logs::LogGroup');
  expect(groups).toHaveLength(6);
  for (const [, group] of groups) {
    expect(group.DeletionPolicy).toBe('Retain');
    expect(group.UpdateReplacePolicy).toBe('Retain');
    expect(group.Properties.RetentionInDays).toBe(14);
  }
  for (const contract of catalog)
    expect(fnProps(contract.functionName).LoggingConfig.LogGroup.Ref).toBe(
      groups.find(
        ([, g]) => g.Properties.LogGroupName === `/aws/lambda/${contract.functionName}`,
      )![0],
    );
});

test('Dados los roles, cuando se sintetizan, entonces hay uno por función con la boundary runtime y confianza solo de Lambda', () => {
  const roles = ofType('AWS::IAM::Role');
  expect(roles).toHaveLength(6);
  expect(roles.map(([, r]) => r.Properties.RoleName).sort()).toEqual(
    [
      'PortfolioApiCloudTestRuntimeRole',
      'PortfolioApiCloudTestRuntimeChatRole',
      'PortfolioApiCloudTestRuntimeProcessReleaseRole',
      'PortfolioApiCloudTestRuntimeGenerateOgRole',
      'PortfolioApiCloudTestRuntimeNotifyPostRole',
      'PortfolioApiCloudTestRuntimePublishChatKnowledgeRole',
    ].sort(),
  );
  for (const [, role] of roles) {
    expect(role.Properties.PermissionsBoundary).toEqual({ Ref: 'RuntimePermissionsBoundaryArn' });
    expect(role.Properties.ManagedPolicyArns).toBeUndefined();
    expect(role.Properties.AssumeRolePolicyDocument.Statement).toEqual([
      { Action: 'sts:AssumeRole', Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' } },
    ]);
  }
  expect(new Set(catalog.map((c) => roleOf(c.functionName))).size).toBe(6);
  expect(json.Parameters.RuntimePermissionsBoundaryArn!.Default).toBeUndefined();
});

test('Dado IAM por función, cuando se inspeccionan permisos, entonces cada rol accede solo a sus logs, parámetros e integraciones', () => {
  const control = { 'Fn::GetAtt': ['RuntimeControlE474B2D1', 'Arn'] };
  for (const contract of catalog) {
    const statements = statementsOf(contract.functionName);
    const actions = statements.flatMap((s) => s.Action).sort();
    const http = ['portfolio-api-cloud-test', 'portfolio-api-cloud-test-chat'].includes(
      contract.functionName,
    );
    const invoker = contract.functionName === 'portfolio-api-cloud-test-process-release';
    expect(actions, contract.functionName).toEqual(
      [
        'kms:Decrypt',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'ssm:GetParameter',
        ...(http ? ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'] : []),
        ...(invoker ? ['lambda:InvokeFunction'] : []),
      ].sort(),
    );
    const arns = parameterAccess[contract.functionName]!.map(parameter);
    const read = statements.find((s) => s.Action === 'ssm:GetParameter')!;
    expect([read.Resource].flat()).toEqual(arns);
    const decrypt = statements.find((s) => s.Action === 'kms:Decrypt')!;
    expect(decrypt.Resource).toBe('arn:aws:kms:us-east-1:650387442642:key/*');
    expect(decrypt.Condition).toEqual({
      StringEquals: {
        'kms:ViaService': 'ssm.us-east-1.amazonaws.com',
        'kms:EncryptionContext:PARAMETER_ARN': arns.length === 1 ? arns[0] : arns,
      },
    });
    const logs = statements.find(
      (s) => Array.isArray(s.Action) && s.Action[0] === 'logs:CreateLogStream',
    )!;
    const group = (logs.Resource as { 'Fn::Join': [string, [{ 'Fn::GetAtt': [string] }]] })[
      'Fn::Join'
    ][1][0]['Fn::GetAtt'][0];
    expect(json.Resources[group]!.Properties.LogGroupName).toBe(
      `/aws/lambda/${contract.functionName}`,
    );
    if (http)
      expect(statements.find((s) => [s.Action].flat()[0] === 'dynamodb:GetItem')!.Resource).toEqual(
        control,
      );
    for (const statement of statements) {
      expect([statement.Resource].flat()).not.toContain('*');
      expect([statement.Action].flat().every((a) => !a.endsWith('*'))).toBe(true);
    }
  }
  const invoke = statementsOf('portfolio-api-cloud-test-process-release').find(
    (s) => s.Action === 'lambda:InvokeFunction',
  )!;
  expect(invoke.Resource).toEqual([
    { 'Fn::GetAtt': [functionId('portfolio-api-cloud-test-generate-og'), 'Arn'] },
    { 'Fn::GetAtt': [functionId('portfolio-api-cloud-test-notify-post'), 'Arn'] },
  ]);
});

test('Dadas las resource policies, cuando se otorgan invocaciones, entonces API Gateway queda acotado a la API y el CI solo a dos funciones', () => {
  const permissions = ofType('AWS::Lambda::Permission').map(([, p]) => p.Properties);
  const release = permissions.filter((p) => p.Principal === RELEASE_INVOKER_ROLE);
  expect(release.map((p) => p.FunctionName['Fn::GetAtt'][0]).sort()).toEqual(
    [
      functionId('portfolio-api-cloud-test-process-release'),
      functionId('portfolio-api-cloud-test-publish-chat-knowledge'),
    ].sort(),
  );
  for (const permission of release) expect(permission.Action).toBe('lambda:InvokeFunction');
  const gateway = permissions.filter((p) => p.Principal !== RELEASE_INVOKER_ROLE);
  expect(gateway).toHaveLength(5);
  for (const permission of gateway) {
    expect(permission.Principal).toBe('apigateway.amazonaws.com');
    const parts = permission.SourceArn['Fn::Join'][1] as unknown[];
    expect(parts).toContain(':execute-api:us-east-1:650387442642:');
    expect(parts).toContainEqual({ Ref: 'ApiF70053CD' });
    expect(['Handler886CB40B', functionId('portfolio-api-cloud-test-chat')]).toContain(
      permission.FunctionName['Fn::GetAtt'][0],
    );
  }
});

test('Dadas las alarmas esenciales, cuando se configuran, entonces son exactamente tres dentro de la capa gratuita', () => {
  const alarms = Object.fromEntries(
    ofType('AWS::CloudWatch::Alarm').map(([id, a]) => [
      a.Properties.AlarmName,
      { id, ...a.Properties },
    ]),
  ) as Record<string, Record<string, any>>;
  expect(Object.keys(alarms).sort()).toEqual([
    'portfolio-api-cloud-test-account-errors',
    'portfolio-api-cloud-test-account-throttles',
    'portfolio-api-cloud-test-http-errors',
  ]);
  for (const alarm of Object.values(alarms)) {
    expect(alarm.AlarmActions).toEqual({
      'Fn::If': ['HasAlarmTopic', [{ Ref: 'AlarmTopicArn' }], { Ref: 'AWS::NoValue' }],
    });
    expect(alarm).toMatchObject({
      TreatMissingData: 'notBreaching',
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      Statistic: 'Sum',
      Period: 300,
      Threshold: 1,
    });
    // Una métrica por alarma: sin metric math ni dimensiones.
    expect(alarm.Metrics).toBeUndefined();
    expect(alarm.Dimensions).toBeUndefined();
  }
  expect(alarms['portfolio-api-cloud-test-http-errors']).toMatchObject({
    id: 'HttpServerFailuresAlarm0D4882E5',
    Namespace: 'PortfolioApiCloud',
    MetricName: 'HttpServerFailures',
    EvaluationPeriods: 3,
    DatapointsToAlarm: 2,
  });
  expect(alarms['portfolio-api-cloud-test-account-throttles']).toMatchObject({
    Namespace: 'AWS/Lambda',
    MetricName: 'Throttles',
    EvaluationPeriods: 3,
    DatapointsToAlarm: 2,
  });
  expect(alarms['portfolio-api-cloud-test-account-errors']).toMatchObject({
    Namespace: 'AWS/Lambda',
    MetricName: 'Errors',
    EvaluationPeriods: 1,
    DatapointsToAlarm: 1,
  });
  template.resourceCountIs('AWS::SNS::Topic', 0);
});

test('Dados errores HTTP 5xx, cuando se filtran logs, entonces api y chat publican una sola métrica personalizada', () => {
  const filters = ofType('AWS::Logs::MetricFilter');
  expect(filters).toHaveLength(2);
  expect(filters.map(([, f]) => f.Properties.LogGroupName.Ref).sort()).toEqual(
    [
      'RuntimeLogs92941AA6',
      fnProps('portfolio-api-cloud-test-chat').LoggingConfig.LogGroup.Ref,
    ].sort(),
  );
  for (const [, filter] of filters)
    expect(filter.Properties).toMatchObject({
      FilterPattern: '{ $.event = "http_request" && $.statusCode >= 500 }',
      MetricTransformations: [
        {
          MetricNamespace: 'PortfolioApiCloud',
          MetricName: 'HttpServerFailures',
          MetricValue: '1',
        },
      ],
    });
  for (const [, filter] of filters)
    expect(filter.Properties.MetricTransformations[0].Dimensions).toBeUndefined();
});

test('Dado el dominio definitivo, cuando se sintetiza, entonces mantiene TLS 1.2, mapping raíz y cierre controlado de execute-api', () => {
  template.hasResourceProperties('AWS::ApiGatewayV2::DomainName', {
    DomainName: 'api.matiasgaleano.dev',
    DomainNameConfigurations: [
      {
        CertificateArn: { Ref: 'CertificateArn' },
        EndpointType: 'REGIONAL',
        SecurityPolicy: 'TLS_1_2',
      },
    ],
  });
  template.hasResourceProperties('AWS::ApiGatewayV2::ApiMapping', { Stage: '$default' });
  template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
    DisableExecuteApiEndpoint: { 'Fn::If': ['CloseDefaultEndpoint', true, false] },
    CorsConfiguration: Match.absent(),
  });
  expect(Object.keys(template.toJSON().Outputs)).toEqual(['RegionalDomainTarget', 'ApiEndpoint']);
});

test('Dado el control compartido, cuando se sintetiza, entonces la tabla conserva TTL, borrado protegido y retención', () => {
  template.resourceCountIs('AWS::DynamoDB::Table', 1);
  template.hasResource('AWS::DynamoDB::Table', {
    Properties: {
      BillingMode: 'PAY_PER_REQUEST',
      DeletionProtectionEnabled: true,
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
    },
    DeletionPolicy: 'Retain',
    UpdateReplacePolicy: 'Retain',
  });
});

test('Dada la publicación CDK, cuando se sintetiza el manifest, entonces separa los roles de deploy, CloudFormation y assets', () => {
  const assembly = app.synth();
  const artifact = assembly.getStackArtifact(stack.artifactId);
  expect(artifact.assumeRoleArn).toBe(
    'arn:aws:iam::650387442642:role/PortfolioApiCloudTestCdkDeployRole',
  );
  expect(artifact.cloudFormationExecutionRoleArn).toBe(
    'arn:aws:iam::650387442642:role/PortfolioApiCloudTestCloudFormationExecutionRole',
  );
  const assets = JSON.parse(
    readFileSync(join(assembly.directory, `${stack.artifactId}.assets.json`), 'utf8'),
  ) as {
    files: Record<
      string,
      { destinations: Record<string, { assumeRoleArn: string; bucketName: string }> }
    >;
  };
  expect(Object.keys(assets.files).length).toBeGreaterThanOrEqual(4);
  for (const file of Object.values(assets.files))
    for (const destination of Object.values(file.destinations)) {
      expect(destination.assumeRoleArn).toBe(
        'arn:aws:iam::650387442642:role/PortfolioApiCloudTestFilePublishingRole',
      );
      expect(destination.bucketName).toBe('cdk-papiatest-assets-650387442642-us-east-1');
    }
  expect(JSON.stringify(assembly.manifest)).not.toContain('AdministratorAccess');
  for (const type of [
    'AWS::EC2::VPC',
    'AWS::SQS::Queue',
    'AWS::IAM::ManagedPolicy',
    'AWS::S3::Bucket',
  ])
    template.resourceCountIs(type, 0);
});
