import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const foundation = JSON.parse(readFileSync('infra/test-foundation.template.json', 'utf8'));
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
      'repo:matigaleanodev@99203645/portfolio-api-cloud@1432631186:environment:test-plan',
  });
  for (const name of ['CdkDeployRole', 'FilePublishingRole']) {
    expect(resources[name].Properties.AssumeRolePolicyDocument.Statement[0].Principal).toEqual({
      AWS: `${prefix}role/PortfolioApiCloudTestGitHubDeployRole`,
    });
  }
});

test('Dada la preparación, cuando se inspeccionan sus permisos, entonces no puede ejecutar ni pasar otro rol o servicio', () => {
  expect(actions('GitHubBoundary')).toEqual(['sts:AssumeRole']);
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
    ['ExecutionBoundary', 'RuntimeRole', 'lambda.amazonaws.com'],
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

test('Dado el ejecutor, cuando administra IAM, entonces solo puede crear el runtime con su boundary y no alterarla', () => {
  const create = statements('ExecutionBoundary').find(
    (s: { Sid: string }) => s.Sid === 'CreateBoundedRuntime',
  );
  expect(create.Resource).toEqual([`${prefix}role/PortfolioApiCloudTestRuntimeRole`]);
  expect(create.Condition.StringEquals['iam:PermissionsBoundary']).toBe(
    `${prefix}policy/PortfolioApiCloudTestRuntimeBoundary`,
  );
  expect(actions('ExecutionBoundary').filter((action) => action.startsWith('iam:'))).not.toEqual(
    expect.arrayContaining(['iam:DeleteRolePermissionsBoundary', 'iam:CreatePolicyVersion']),
  );
  expect(actions('ExecutionBoundary')).not.toContain('secretsmanager:GetSecretValue');
  expect(actions('ExecutionBoundary')).not.toContain('dynamodb:PutItem');
});

test('Dado el runtime, cuando se revisa su techo, entonces conserva control, logs y un secreto exacto sin privilegios de entrega', () => {
  expect(actions('RuntimeBoundary').sort()).toEqual(
    [
      'logs:CreateLogStream',
      'logs:PutLogEvents',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
      'secretsmanager:GetSecretValue',
    ].sort(),
  );
  expect(
    statements('RuntimeBoundary').find((s: { Sid: string }) => s.Sid === 'ReadExactSecret')
      .Resource,
  ).toEqual([{ Ref: 'RuntimeSecretArn' }]);
  expect(foundation.Parameters.RuntimeSecretArn.Default).toBeUndefined();
  expect(foundation.Parameters.RuntimeSecretArn.AllowedPattern).toContain(
    '650387442642:secret:portfolio-api-cloud/test/',
  );
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
        expect(statement.Action).toEqual(['logs:DescribeLogGroups']);
        expect(statement.Condition.StringEquals['aws:RequestedRegion']).toBe('us-east-1');
      }
    }
  }
});
