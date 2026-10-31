import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const foundation = JSON.parse(
  readFileSync('packages/infrastructure/templates/production-foundation.template.json', 'utf8'),
);
const resources = foundation.Resources;
const statements = (name: string) => resources[name].Properties.PolicyDocument.Statement;
const actions = (name: string): string[] =>
  statements(name).flatMap((statement: { Action?: string[] }) => statement.Action ?? []);
const prefix = 'arn:aws:iam::650387442642:';

test('Dados roles externos, cuando se revisa la delegación, entonces cada identidad tiene boundary equivalente y trust exacto', () => {
  for (const [role, boundary] of [
    ['GitHubDeployRole', 'GitHub'],
    ['CdkDeployRole', 'Deploy'],
    ['FilePublishingRole', 'Publisher'],
    ['CloudFormationExecutionRole', 'Execution'],
  ]) {
    const properties = resources[role!].Properties;
    expect(properties.PermissionsBoundary).toEqual({ Ref: `${boundary}Boundary` });
    expect(properties.Policies[0].PolicyDocument).toEqual(
      resources[`${boundary}Boundary`].Properties.PolicyDocument,
    );
  }
  const oidc = resources.GitHubDeployRole.Properties.AssumeRolePolicyDocument.Statement[0];
  expect(oidc.Principal.Federated).toBe(
    `${prefix}oidc-provider/token.actions.githubusercontent.com`,
  );
  expect(oidc.Condition.StringEquals).toEqual({
    'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
    'token.actions.githubusercontent.com:sub':
      'repo:matigaleanodev@99203645/portfolio-api-cloud@1432631186:environment:production-plan',
  });
  for (const name of ['CdkDeployRole', 'FilePublishingRole']) {
    expect(resources[name].Properties.AssumeRolePolicyDocument.Statement[0].Principal).toEqual({
      AWS: `${prefix}role/PortfolioApiCloudTestGitHubDeployRole`,
    });
  }
});

test('Dada la preparación, cuando se inspeccionan sus permisos, entonces no puede ejecutar ni pasar otro rol o servicio', () => {
  expect(actions('GitHubBoundary')).toEqual(['sts:AssumeRole', 'ssm:GetParameters']);
  // Guard previo al changeset: metadatos de los parámetros productivos, sin descifrar.
  expect(statements('GitHubBoundary')[1]).toEqual({
    Sid: 'VerifyRuntimeParameters',
    Effect: 'Allow',
    Action: ['ssm:GetParameters'],
    Resource: ['api', 'chat', 'editorial', 'notifications'].map(
      (s) => `arn:aws:ssm:us-east-1:650387442642:parameter/portfolio/prod/${s}`,
    ),
  });
  expect(JSON.stringify(resources.GitHubBoundary)).not.toContain('kms:');
  expect(statements('GitHubBoundary')[0].Resource).toEqual([
    `${prefix}role/PortfolioApiCloudTestCdkDeployRole`,
    `${prefix}role/PortfolioApiCloudTestFilePublishingRole`,
  ]);
  for (const name of ['GitHubBoundary', 'DeployBoundary', 'PublisherBoundary']) {
    expect(actions(name)).not.toEqual(expect.arrayContaining(['cloudformation:ExecuteChangeSet']));
    expect(actions(name)).not.toEqual(expect.arrayContaining(['cloudformation:UpdateStack']));
    expect(actions(name)).not.toEqual(expect.arrayContaining(['cloudformation:CreateStack']));
  }
  for (const [name, role, service] of [
    ['DeployBoundary', 'CloudFormationExecutionRole', 'cloudformation.amazonaws.com'],
    // Prefijo exclusivo de roles de runtime; CreateRole/PutRolePolicy exigen la boundary runtime.
    ['ExecutionBoundary', 'Runtime*', 'lambda.amazonaws.com'],
  ]) {
    const passes = statements(name!).filter((item: { Action?: string[] }) =>
      item.Action?.includes('iam:PassRole'),
    );
    expect(passes).toHaveLength(1);
    expect(passes[0].Resource).toEqual([`${prefix}role/PortfolioApiCloudTest${role}`]);
    expect(passes[0].Condition).toEqual({ StringEquals: { 'iam:PassedToService': service } });
  }
  const create = statements('DeployBoundary').find((s: { Sid: string }) => s.Sid === 'PrepareOnly');
  expect(create.Condition.StringEquals['cloudformation:RoleArn']).toBe(
    `${prefix}role/PortfolioApiCloudTestCloudFormationExecutionRole`,
  );
  expect(create.Condition.StringLike['cloudformation:ChangeSetName']).toBe(
    'portfolio-api-cloud-test-*',
  );
});

test('Dado el ejecutor, cuando administra IAM, entonces solo crea o modifica roles de runtime con su boundary y no la altera', () => {
  const create = statements('ExecutionBoundary').find(
    (s: { Sid: string }) => s.Sid === 'CreateBoundedRuntime',
  );
  expect(create.Action).toEqual([
    'iam:CreateRole',
    'iam:PutRolePermissionsBoundary',
    'iam:PutRolePolicy',
    'iam:DeleteRolePolicy',
  ]);
  expect(create.Resource).toEqual([`${prefix}role/PortfolioApiCloudTestRuntime*`]);
  expect(create.Condition).toEqual({
    StringEquals: {
      'iam:PermissionsBoundary': `${prefix}policy/PortfolioApiCloudTestRuntimeBoundary`,
    },
  });
  const manage = statements('ExecutionBoundary').find(
    (s: { Sid: string }) => s.Sid === 'ManageRuntimeRole',
  );
  expect(manage.Action).not.toContain('iam:PutRolePolicy');
  expect(manage.Action).not.toContain('iam:AttachRolePolicy');
  // El prefijo no alcanza identidades de entrega, fundación ni sync.
  const runtime = `${prefix}role/PortfolioApiCloudTestRuntime`;
  for (const name of [
    'PortfolioApiCloudTestCdkDeployRole',
    'PortfolioApiCloudTestCloudFormationExecutionRole',
    'PortfolioApiCloudTestFilePublishingRole',
    'PortfolioApiCloudTestGitHubDeployRole',
    'PortfolioApiCloudTestFoundationPlanRole',
    'PortfolioApiCloudTestFoundationCloudFormationRole',
    'PortfolioApiCloudTestGitHubExecuteRole',
    'PortfolioApiCloudParametersSyncRole',
  ])
    expect(`${prefix}role/${name}`.startsWith(runtime), name).toBe(false);
  expect(actions('ExecutionBoundary')).not.toContain('iam:DeleteRolePermissionsBoundary');
  expect(actions('ExecutionBoundary')).not.toContain('iam:CreatePolicyVersion');
  for (const action of [
    'secretsmanager:GetSecretValue',
    'dynamodb:PutItem',
    'ssm:GetParameter',
    'ssm:PutParameter',
    'kms:Decrypt',
    'lambda:InvokeFunction',
  ])
    expect(actions('ExecutionBoundary')).not.toContain(action);
});

test('Dadas las funciones nuevas, cuando el ejecutor las administra, entonces AddPermission queda limitado por función y principal', () => {
  const lambda = 'arn:aws:lambda:us-east-1:650387442642:function:portfolio-api-cloud-test';
  const manage = statements('ExecutionBoundary').find(
    (s: { Sid: string }) => s.Sid === 'ManageFunction',
  );
  expect(manage.Resource).toEqual([lambda, `${lambda}-*`]);
  expect(manage.Action).not.toContain('lambda:AddPermission');
  expect(manage.Action).not.toContain('lambda:RemovePermission');
  const permits = statements('ExecutionBoundary').filter((s: { Action?: string[] }) =>
    s.Action?.includes('lambda:AddPermission'),
  );
  expect(permits.map((s: Record<string, unknown>) => [s.Resource, s.Condition])).toEqual([
    [
      [lambda, `${lambda}-chat`],
      { StringEquals: { 'lambda:Principal': 'apigateway.amazonaws.com' } },
    ],
    [
      [`${lambda}-process-release`, `${lambda}-publish-chat-knowledge`],
      { StringEquals: { 'lambda:Principal': `${prefix}role/PortfolioGitHubReleaseRole` } },
    ],
  ]);
  const logs = statements('ExecutionBoundary').find(
    (s: { Sid: string }) => s.Sid === 'ManageLogGroup',
  );
  expect(logs.Resource).toEqual([
    'arn:aws:logs:us-east-1:650387442642:log-group:/aws/lambda/portfolio-api-cloud-test*',
  ]);
  // Sin access logs: no hay entregas de logs ni resource policies de CloudWatch Logs.
  for (const action of [
    'logs:CreateLogDelivery',
    'logs:PutResourcePolicy',
    'logs:ListLogDeliveries',
  ])
    expect(actions('ExecutionBoundary')).not.toContain(action);
  expect(JSON.stringify(foundation)).not.toContain('/aws/apigateway/');
  expect(logs.Action).toEqual(
    expect.arrayContaining(['logs:PutMetricFilter', 'logs:DeleteMetricFilter']),
  );
  expect(logs.Action).not.toContain('logs:DeleteLogGroup');
  expect(
    statements('ExecutionBoundary').find((s: { Sid: string }) => s.Sid === 'ManageAlarms').Resource,
  ).toEqual(['arn:aws:cloudwatch:us-east-1:650387442642:alarm:portfolio-api-cloud-test-*']);
});

test('Dado el runtime, cuando se revisa su techo, entonces conserva logs propios, control, parámetros SSM e invocaciones editoriales', () => {
  const runtime = statements('RuntimeBoundary').filter(
    (s: Record<string, unknown>) => !('Fn::If' in s),
  );
  expect(runtime.flatMap((s: { Action: string[] }) => s.Action).sort()).toEqual(
    [
      'logs:CreateLogStream',
      'logs:PutLogEvents',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
      'ssm:GetParameter',
      'kms:Decrypt',
      'lambda:InvokeFunction',
    ].sort(),
  );
  const sid = (name: string) => runtime.find((s: { Sid: string }) => s.Sid === name);
  const suffixes = [
    '',
    '-chat',
    '-process-release',
    '-generate-og',
    '-notify-post',
    '-publish-chat-knowledge',
  ];
  expect(sid('WriteOwnLogs').Resource).toEqual(
    suffixes.map(
      (suffix) =>
        `arn:aws:logs:us-east-1:650387442642:log-group:/aws/lambda/portfolio-api-cloud-test${suffix}:log-stream:*`,
    ),
  );
  const parameters = [
    ...['api', 'chat', 'editorial', 'notifications'].map((s) => `/portfolio/prod/${s}`),
    ...['api', 'chat'].map((s) => `/portfolio/validation/${s}`),
  ].map((name) => `arn:aws:ssm:us-east-1:650387442642:parameter${name}`);
  expect(sid('ReadRuntimeParameters').Resource).toEqual(parameters);
  expect(sid('DecryptRuntimeParameters')).toMatchObject({
    Resource: ['arn:aws:kms:us-east-1:650387442642:key/*'],
    Condition: {
      StringEquals: {
        'kms:ViaService': 'ssm.us-east-1.amazonaws.com',
        'kms:EncryptionContext:PARAMETER_ARN': parameters,
      },
    },
  });
  expect(sid('InvokeEditorialStages').Resource).toEqual([
    'arn:aws:lambda:us-east-1:650387442642:function:portfolio-api-cloud-test-generate-og',
    'arn:aws:lambda:us-east-1:650387442642:function:portfolio-api-cloud-test-notify-post',
  ]);
  // Ninguna identidad de la fundación escribe parámetros ni cifra con aws/ssm.
  expect(JSON.stringify(foundation)).not.toMatch(
    /"ssm:PutParameter"|"ssm:DeleteParameter"|"kms:Encrypt"|"kms:GenerateDataKey"/,
  );
  expect(foundation.Parameters.RuntimeSecretArn).toBeUndefined();
});

test('Dado el corte a SSM, cuando se evalúa el secreto anterior, entonces solo se lee durante la transición y vacío no concede nada', () => {
  expect(
    statements('RuntimeBoundary').filter((s: Record<string, unknown>) => 'Fn::If' in s),
  ).toEqual([
    {
      'Fn::If': [
        'HasPreviousRuntimeSecret',
        {
          Sid: 'ReadPreviousSecretDuringCutover',
          Effect: 'Allow',
          Action: ['secretsmanager:GetSecretValue'],
          Resource: [{ Ref: 'PreviousRuntimeSecretArn' }],
        },
        { Ref: 'AWS::NoValue' },
      ],
    },
  ]);
  const allowed = (value: string) =>
    new RegExp(`^(?:${foundation.Parameters.PreviousRuntimeSecretArn.AllowedPattern})$`).test(
      value,
    );
  const arn = (name: string) => `arn:aws:secretsmanager:us-east-1:650387442642:secret:${name}`;
  // Obligatorio durante la transición: un ARN del secreto anterior o `none` explícito.
  expect(foundation.Parameters.PreviousRuntimeSecretArn.Default).toBeUndefined();
  expect(allowed('none')).toBe(true);
  expect(allowed('')).toBe(false);
  expect(allowed(arn('portfolio-api-cloud/test/production-AbC123'))).toBe(true);
  expect(allowed(arn('portfolio/prod/app-properties-AbC123'))).toBe(false);
  expect(foundation.Conditions.HasPreviousRuntimeSecret).toEqual({
    'Fn::Not': [{ 'Fn::Equals': [{ Ref: 'PreviousRuntimeSecretArn' }, 'none'] }],
  });
  const workflow = readFileSync('.github/workflows/plan-foundation-production.yml', 'utf8');
  const input = workflow.slice(
    workflow.indexOf('previous_runtime_secret_arn:'),
    workflow.indexOf('change_set_type:'),
  );
  expect(input).toContain('required: true');
  expect(input).not.toContain('default:');
  expect(workflow).toContain('[[ "$PREVIOUS_RUNTIME_SECRET_ARN" == none ||');
});

test('Dado un ID generado, cuando no se eligió excepción regional ni ID concreto, entonces la propuesta no concede administración API', () => {
  expect(foundation.Parameters.AllowRegionalApiBootstrap.Default).toBe('false');
  expect(foundation.Parameters.TestApiId.Default).toBe('unassigned');
  const api = statements('ExecutionBoundary').filter((s: Record<string, unknown>) => 'Fn::If' in s);
  expect(api).toHaveLength(2);
  for (const statement of api) expect(statement['Fn::If'][2]).toEqual({ Ref: 'AWS::NoValue' });
  expect(api[0]['Fn::If'][1].Condition).toEqual({
    StringEquals: { 'apigateway:Request/ApiName': 'portfolio-api-cloud-test' },
  });
  expect(api[1]['Fn::If'][1].Action).toContain('apigateway:TagResource');
  expect(api[1]['Fn::If'][1].Resource['Fn::If']).toEqual([
    'HasApiId',
    [
      { 'Fn::Sub': 'arn:aws:apigateway:us-east-1::/apis/${TestApiId}' },
      { 'Fn::Sub': 'arn:aws:apigateway:us-east-1::/apis/${TestApiId}/*' },
    ],
    ['arn:aws:apigateway:us-east-1::/apis/*'],
  ]);
});

test('Dado el bootstrap mínimo, cuando se inspecciona, entonces retiene assets cifrados y no crea secretos, runtime, ECR ni roles lookup', () => {
  const bucket = resources.AssetBucket;
  expect(bucket.DeletionPolicy).toBe('Retain');
  expect(bucket.Properties.VersioningConfiguration.Status).toBe('Enabled');
  expect(Object.values(bucket.Properties.PublicAccessBlockConfiguration)).toEqual([
    true,
    true,
    true,
    true,
  ]);
  expect(
    bucket.Properties.BucketEncryption.ServerSideEncryptionConfiguration[0]
      .ServerSideEncryptionByDefault.SSEAlgorithm,
  ).toBe('AES256');
  expect(bucket.Properties.LifecycleConfiguration).toBeUndefined();
  expect(resources.BootstrapVersionParameter.Properties.Value).toBe('6');
  expect(foundation.Outputs.BootstrapVersion.Value).toBe('6');
  expect(
    (Object.values(resources) as { Type: string }[]).filter((r) => r.Type === 'AWS::IAM::Role'),
  ).toHaveLength(4);
  for (const resource of Object.values(resources) as { Type: string }[]) {
    expect([
      'AWS::ECR::Repository',
      'AWS::Lambda::Function',
      'AWS::SecretsManager::Secret',
      'AWS::IAM::OIDCProvider',
    ]).not.toContain(resource.Type);
  }
  for (const name of ['DeployBoundary', 'PublisherBoundary']) {
    expect(actions(name)).toContain('s3:GetEncryptionConfiguration');
    expect(actions(name)).not.toContain('s3:DeleteObject');
  }
});

test('Dadas las policies revisables, cuando se comprueba tamaño y excepciones, entonces caben en IAM y no hay Allow administrativo', () => {
  for (const [name, resource] of Object.entries(resources) as [
    string,
    { Type: string; Properties: { PolicyDocument: unknown } },
  ][]) {
    if (resource.Type !== 'AWS::IAM::ManagedPolicy') continue;
    expect(JSON.stringify(resource.Properties.PolicyDocument).length, name).toBeLessThanOrEqual(
      6144,
    );
    for (const statement of statements(name)) {
      expect(statement.Action ?? []).not.toContain('*');
      if (statement.Resource?.includes('*')) {
        expect(statement.Action).toEqual([
          'logs:DescribeLogGroups',
          'logs:DescribeResourcePolicies',
          'logs:DescribeIndexPolicies',
        ]);
        expect(statement.Condition.StringEquals['aws:RequestedRegion']).toBe('us-east-1');
      }
    }
  }
});
