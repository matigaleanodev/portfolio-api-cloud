import { test, expect } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { join } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PortfolioApiStack } from '../../infra/stack.js';
const app = new App({ context: { stage: 'test' } });
const stack = new PortfolioApiStack(app);
const template = Template.fromStack(stack);
test('Dado el ambiente test, cuando se define la stack, entonces apunta únicamente a la cuenta y región acordadas', () => {
  expect(() => new PortfolioApiStack(new App({ context: { stage: 'prod' } }))).toThrow(
    'Solo se admite el ambiente test.',
  );
  expect(() => new PortfolioApiStack(new App())).toThrow('Solo se admite el ambiente test.');
  expect(stack.stackName).toBe('portfolio-api-cloud-test');
  expect(stack.account).toBe('650387442642');
  expect(stack.region).toBe('us-east-1');
});
test('Dado el paquete compilado, cuando se define la Lambda, entonces usa Node 24 ARM64 sin VPC ni URL alternativa', () => {
  template.resourceCountIs('AWS::Lambda::Function', 1);
  template.hasResourceProperties('AWS::Lambda::Function', {
    Runtime: 'nodejs24.x',
    Handler: 'dist/handler.handler',
    Architectures: ['arm64'],
    VpcConfig: Match.absent(),
  });
  template.resourceCountIs('AWS::Lambda::Url', 0);
  template.resourceCountIs('AWS::EC2::NatGateway', 0);
});
test('Dado el presupuesto técnico de test, cuando se configura la ejecución, entonces limita memoria, duración y concurrencia', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    MemorySize: 512,
    Timeout: 28,
    ReservedConcurrentExecutions: Match.absent(),
  });
});
test('Dados errores del SDK, cuando la Lambda ejecuta en AWS, entonces usa NODE_ENV production sin secretos en el template', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    Environment: {
      Variables: { NODE_ENV: 'production', CORS_ORIGIN: { Ref: 'CorsOrigin' } },
    },
  });
  expect(JSON.stringify(template.toJSON())).not.toMatch(
    /RESEND_API_KEY|CONTACT_FROM_EMAIL|CONTACT_TO_EMAIL|OPENAI_API_KEY/,
  );
});
test('Dada una API HTTP regional, cuando se integra con Lambda, entonces conserva payload v2 y un timeout menor a 30 segundos', () => {
  template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
  template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
    ProtocolType: 'HTTP',
    CorsConfiguration: Match.absent(),
  });
  template.hasResourceProperties('AWS::ApiGatewayV2::Integration', {
    IntegrationType: 'AWS_PROXY',
    PayloadFormatVersion: '2.0',
    TimeoutInMillis: 29000,
  });
});
test('Dada la API de test, cuando se delega el enrutamiento al handler, entonces exige IAM y permite únicamente OPTIONS sin firma', () => {
  template.resourceCountIs('AWS::ApiGatewayV2::Route', 2);
  template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
    RouteKey: '$default',
    AuthorizationType: { 'Fn::If': ['PublicIngress', 'NONE', 'AWS_IAM'] },
  });
  template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
    RouteKey: 'OPTIONS /{proxy+}',
    AuthorizationType: 'NONE',
  });
});
test('Dada una ruta /api, cuando se crea el stage, entonces conserva rawPath sin prefijo y aplica límites globales', () => {
  template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
    StageName: '$default',
    AutoDeploy: true,
    DefaultRouteSettings: { ThrottlingRateLimit: 2, ThrottlingBurstLimit: 5 },
  });
});
test('Dada la política de logs de test, cuando se reemplaza la stack, entonces retiene los logs con expiración de catorce días', () => {
  template.hasResource('AWS::Logs::LogGroup', {
    Properties: { RetentionInDays: 14 },
    DeletionPolicy: 'Retain',
    UpdateReplacePolicy: 'Retain',
  });
});
test('Dado el rol de ejecución, cuando se sintetizan permisos, entonces exige una boundary externa y acota logs, control y lectura del secreto', () => {
  template.resourceCountIs('AWS::IAM::Role', 1);
  template.hasResourceProperties('AWS::IAM::Role', {
    PermissionsBoundary: { Ref: 'RuntimePermissionsBoundaryArn' },
    ManagedPolicyArns: Match.absent(),
  });
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        {
          Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          Effect: 'Allow',
          Resource: Match.anyValue(),
        },
      ]),
      Version: '2012-10-17',
    },
  });
  const logId = Object.keys(template.findResources('AWS::Logs::LogGroup'))[0]!;
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        {
          Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          Effect: 'Allow',
          Resource: {
            'Fn::Join': ['', [{ 'Fn::GetAtt': [logId, 'Arn'] }, ':*']],
          },
        },
      ]),
      Version: '2012-10-17',
    },
  });
  const parameters = template.toJSON()['Parameters'] as Record<string, Record<string, unknown>>;
  expect(parameters['RuntimePermissionsBoundaryArn']!['Default']).toBeUndefined();
});
test('Dada la publicación CDK futura, cuando se sintetiza el manifest, entonces separa los roles de deploy, CloudFormation y assets', () => {
  const artifact = app.synth().getStackArtifact(stack.artifactId);
  expect(artifact.assumeRoleArn).toBe(
    'arn:aws:iam::650387442642:role/PortfolioApiCloudTestCdkDeployRole',
  );
  expect(artifact.cloudFormationExecutionRoleArn).toBe(
    'arn:aws:iam::650387442642:role/PortfolioApiCloudTestCloudFormationExecutionRole',
  );
  const manifest = JSON.stringify(app.synth().manifest);
  expect(manifest).not.toContain('AdministratorAccess');
  const assets = JSON.parse(
    readFileSync(join(app.synth().directory, `${stack.artifactId}.assets.json`), 'utf8'),
  ) as {
    files: Record<
      string,
      {
        destinations: Record<string, { assumeRoleArn: string; bucketName: string }>;
      }
    >;
  };
  for (const file of Object.values(assets.files))
    for (const destination of Object.values(file.destinations)) {
      expect(destination.assumeRoleArn).toBe(
        'arn:aws:iam::650387442642:role/PortfolioApiCloudTestFilePublishingRole',
      );
      expect(destination.bucketName).toBe('cdk-papiatest-assets-650387442642-us-east-1');
    }
});
test('Dado el asset de Lambda, cuando se inspecciona su contenido, entonces incluye solo runtime y conserva las licencias de dependencias', () => {
  expect(readdirSync('.tmp/lambda').sort()).toEqual([
    'LICENSE',
    'dist',
    'fallback',
    'node_modules',
    'package.json',
  ]);
  expect(readdirSync('.tmp/lambda/dist')).toContain('handler.js');
  expect(() => readFileSync('.tmp/lambda/node_modules/vitest/package.json')).toThrow();
  expect(() => readFileSync('.tmp/lambda/node_modules/aws-cdk-lib/package.json')).toThrow();
  expect(readFileSync('.tmp/lambda/node_modules/resend/LICENSE', 'utf8')).toContain('MIT');
});

test('Dado almacenamiento de control, cuando se sintetiza, entonces usa una tabla sin datos de aplicación, con TTL y protección de borrado', () => {
  template.resourceCountIs('AWS::DynamoDB::Table', 1);
  template.hasResource('AWS::DynamoDB::Table', {
    Properties: {
      BillingMode: 'PAY_PER_REQUEST',
      DeletionProtectionEnabled: true,
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
    },
    DeletionPolicy: 'Retain',
    UpdateReplacePolicy: 'Retain',
  });
  template.resourceCountIs('AWS::SecretsManager::Secret', 0);
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        {
          Action: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'],
          Resource: {
            'Fn::GetAtt': [Object.keys(template.findResources('AWS::DynamoDB::Table'))[0], 'Arn'],
          },
          Effect: 'Allow',
        },
        {
          Action: 'secretsmanager:GetSecretValue',
          Resource: { Ref: 'RuntimeSecretArn' },
          Effect: 'Allow',
        },
      ]),
    },
  });
});
test('Dadas alarmas locales, cuando se definen, entonces cubren error, throttling y duración sin enviar notificaciones', () => {
  template.resourceCountIs('AWS::CloudWatch::Alarm', 3);
  for (const resource of Object.values(template.findResources('AWS::CloudWatch::Alarm'))) {
    expect(resource.Properties.AlarmActions).toBeUndefined();
    expect(resource.Properties.TreatMissingData).toBe('notBreaching');
  }
  template.resourceCountIs('AWS::SNS::Topic', 0);
});
test('Dada entrada administrada, cuando se configura Lambda, entonces fija API y tabla y usa únicamente ARN de secreto sin valor por defecto', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    Environment: {
      Variables: {
        TRUSTED_API_ID: { Ref: Object.keys(template.findResources('AWS::ApiGatewayV2::Api'))[0] },
        QUOTA_TABLE_NAME: { Ref: Object.keys(template.findResources('AWS::DynamoDB::Table'))[0] },
        RUNTIME_SECRET_ARN: { Ref: 'RuntimeSecretArn' },
      },
    },
  });
  expect(template.toJSON().Parameters.RuntimeSecretArn.Default).toBeUndefined();
  expect(template.toJSON().Parameters.RuntimeSecretArn.NoEcho).toBe(true);
  expect(() => readFileSync('.tmp/lambda/fallback/chat-knowledge.v1.json')).not.toThrow();
});

test('Dado el runtime, cuando se inspecciona su identidad, entonces confía solo en Lambda y no administra IAM ni asume otros roles', () => {
  template.hasResourceProperties('AWS::IAM::Role', {
    RoleName: 'PortfolioApiCloudTestRuntimeRole',
    AssumeRolePolicyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: { Service: 'lambda.amazonaws.com' },
        },
      ],
    },
  });
  const policies = Object.values(template.findResources('AWS::IAM::Policy'));
  expect(policies).toHaveLength(1);
  const statements = policies[0]!.Properties.PolicyDocument.Statement as {
    Action: string | string[];
    Resource: unknown;
  }[];
  expect(statements.flatMap((statement) => statement.Action).sort()).toEqual([
    'dynamodb:GetItem',
    'dynamodb:PutItem',
    'dynamodb:UpdateItem',
    'logs:CreateLogStream',
    'logs:PutLogEvents',
    'secretsmanager:GetSecretValue',
  ]);
  expect(statements.every((statement) => statement.Resource !== '*')).toBe(true);
});

test('Dada invocación desde API Gateway, cuando se sintetizan permisos Lambda, entonces se restringen a la API de esta cuenta y región', () => {
  const apiId = Object.keys(template.findResources('AWS::ApiGatewayV2::Api'))[0]!;
  const permissions = Object.values(template.findResources('AWS::Lambda::Permission'));
  expect(permissions).toHaveLength(2);
  for (const permission of permissions) {
    expect(permission.Properties.Principal).toBe('apigateway.amazonaws.com');
    expect(permission.Properties.Action).toBe('lambda:InvokeFunction');
    const parts = permission.Properties.SourceArn['Fn::Join'][1] as unknown[];
    expect(parts).toContain(':execute-api:us-east-1:650387442642:');
    expect(parts).toContainEqual({ Ref: apiId });
  }
});

test('Dados recursos de control y alarmas, cuando se nombran, entonces el diseño de permisos puede acotarlos a test', () => {
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TableName: 'portfolio-api-cloud-test-control',
  });
  expect(
    Object.values(template.findResources('AWS::CloudWatch::Alarm'))
      .map((resource) => resource.Properties.AlarmName)
      .sort(),
  ).toEqual([
    'portfolio-api-cloud-test-duration',
    'portfolio-api-cloud-test-errors',
    'portfolio-api-cloud-test-throttles',
  ]);
  for (const type of [
    'AWS::EC2::VPC',
    'AWS::SQS::Queue',
    'AWS::ApiGatewayV2::DomainName',
    'AWS::IAM::ManagedPolicy',
    'AWS::S3::Bucket',
  ]) {
    template.resourceCountIs(type, 0);
  }
});

test('Dados parámetros externos, cuando se sintetizan, entonces no incluyen valores de credenciales ni defaults privados', () => {
  const parameters = template.toJSON().Parameters;
  expect(parameters.RuntimePermissionsBoundaryArn.AllowedPattern).toBe(
    'arn:aws:iam::650387442642:policy/PortfolioApiCloudTestRuntimeBoundary',
  );
  expect(parameters.RuntimeSecretArn.AllowedPattern).toContain('secret:portfolio-api-cloud/test/');
  expect(parameters.CorsOrigin.Default).toBe('');
  expect(Object.keys(template.toJSON().Outputs)).toEqual(['ApiEndpoint']);
  const manifest = app.synth().manifest;
  expect(JSON.stringify(manifest)).not.toMatch(/AdministratorAccess/);
});
