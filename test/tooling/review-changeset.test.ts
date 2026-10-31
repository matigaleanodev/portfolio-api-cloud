import { expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { functions } from '@portfolio-api-cloud/contracts/functions';
const prefix = 'arn:aws:cloudformation:us-east-1:650387442642:';
const stack = prefix + 'stack/portfolio-api-cloud-test/observed-id';
const changeset =
  prefix + 'changeSet/portfolio-api-cloud-test-' + 'a'.repeat(40) + '-123-1/observed-id';
const base = {
  change: {
    StackId: stack,
    StackName: 'portfolio-api-cloud-test',
    ChangeSetId: changeset,
    ChangeSetName: changeset.split('/')[1],
    Status: 'CREATE_COMPLETE',
    ExecutionStatus: 'AVAILABLE',
    Changes: [{ ResourceChange: { ResourceType: 'AWS::Lambda::Function', Action: 'Add' } }],
  },
  stackData: {
    StackId: stack,
    RoleARN: 'arn:aws:iam::650387442642:role/PortfolioApiCloudTestCloudFormationExecutionRole',
    StackStatus: 'REVIEW_IN_PROGRESS',
  },
  template: {
    Resources: {
      ...Object.fromEntries(
        Object.values(functions).map((contract) => [
          contract.logicalId === 'Handler' ? 'Handler886CB40B' : `${contract.logicalId}0000AAAA`,
          {
            Type: 'AWS::Lambda::Function',
            Properties: { FunctionName: contract.functionName, Handler: contract.handler },
          },
        ]),
      ),
      RuntimeLogs92941AA6: { Type: 'AWS::Logs::LogGroup', Properties: {} },
      RuntimeRoleFD8790A4: { Type: 'AWS::IAM::Role', Properties: {} },
      RuntimeControlE474B2D1: { Type: 'AWS::DynamoDB::Table', Properties: {} },
    } as Record<string, { Type: string; Properties: Record<string, unknown> }>,
  },
};
const withHandler = (name: string, handler: string) => ({
  ...base,
  template: {
    Resources: Object.fromEntries(
      Object.entries(base.template.Resources).map(([id, resource]) => [
        id,
        resource.Properties.FunctionName === name
          ? { ...resource, Properties: { ...resource.Properties, Handler: handler } }
          : resource,
      ]),
    ),
  },
});
function validate(input: unknown, command = 'validate') {
  return spawnSync(
    'python3',
    [
      '-c',
      `import sys,json;sys.path.insert(0,'scripts');from review_changeset import validate,session_policy;d=json.load(sys.stdin); print(json.dumps(${command === 'validate' ? "validate(d['change'],d['stackData'],d['template'],d['change']['StackId'],d['change']['ChangeSetId'],'application')" : "session_policy(d['change']['StackId'],d['change']['ChangeSetId'],'application')"}))`,
    ],
    { input: JSON.stringify(input), encoding: 'utf8' },
  );
}
test('Dado un changeset observado, cuando se revisa y restringe su sesión, entonces conserva ARN exacto y condición de changeset sin PassRole ni preparación', () => {
  expect(validate(base).status).toBe(0);
  const result = validate(base, 'policy');
  expect(result.status).toBe(0);
  const p = JSON.parse(result.stdout);
  expect(p.Statement[1].Resource).toBe(stack);
  expect(p.Statement[1].Condition.StringEquals['cloudformation:ChangeSetName']).toEqual([
    changeset,
    changeset.split('/')[1],
  ]);
  expect(result.stdout).not.toMatch(/iam:PassRole|CreateChangeSet|UpdateStack|AdministratorAccess/);
});
for (const [key, value] of [
  ['Status', 'CREATE_PENDING'],
  ['ExecutionStatus', 'OBSOLETE'],
  ['NextToken', 'page'],
  ['ImportExistingResources', true],
  ['NotificationARNs', ['arn:aws:sns:fake']],
  ['Changes', []],
] as const)
  test(`Dado un changeset con ${key} no admisible, cuando se revisa, entonces se bloquea`, () => {
    expect(validate({ ...base, change: { ...base.change, [key]: value } }).status).not.toBe(0);
  });
for (const key of ['StackId', 'ChangeSetId'] as const)
  test(`Dado ${key} de otra instalación, cuando se restringe la sesión, entonces falla sin AWS`, () => {
    expect(
      validate(
        {
          ...base,
          change: {
            ...base.change,
            [key]: base.change[key].replace('portfolio-api-cloud-test', 'production'),
          },
        },
        'policy',
      ).status,
    ).not.toBe(0);
  });
for (const action of [
  { Action: 'Remove' },
  { Action: 'Modify', Replacement: 'True' },
  { Action: 'Modify', Replacement: 'Conditional' },
])
  test(`Dado control compartido con ${JSON.stringify(action)}, cuando se revisa, entonces impide perder cuotas`, () => {
    expect(
      validate({
        ...base,
        change: {
          ...base.change,
          Changes: [{ ResourceChange: { ResourceType: 'AWS::DynamoDB::Table', ...action } }],
        },
      }).status,
    ).not.toBe(0);
  });
test('Dado un rol distinto o paquete desconocido, cuando se revisa el primer despliegue, entonces rechaza ejecución', () => {
  expect(
    validate({
      ...base,
      stackData: { ...base.stackData, RoleARN: 'arn:aws:iam::650387442642:role/other' },
    }).status,
  ).not.toBe(0);
  expect(validate(withHandler('portfolio-api-cloud-test', 'dist/unknown.handler')).status).not.toBe(
    0,
  );
  expect(
    validate(withHandler('portfolio-api-cloud-test-process-release', 'dist/validation/api.handler'))
      .status,
  ).not.toBe(0);
  // Validación: solo cambia el código de las funciones HTTP.
  expect(
    validate(withHandler('portfolio-api-cloud-test', 'dist/validation/api.handler')).status,
  ).toBe(0);
});

test('Dado el catálogo, cuando falta, sobra o se renombra una función, entonces rechaza el paquete', () => {
  const resources = { ...base.template.Resources };
  delete resources['NotifyPost0000AAAA'];
  expect(validate({ ...base, template: { Resources: resources } }).status).not.toBe(0);
  expect(
    validate({
      ...base,
      template: {
        Resources: {
          ...base.template.Resources,
          Extra: {
            Type: 'AWS::Lambda::Function',
            Properties: { FunctionName: 'portfolio-api-cloud-test-extra', Handler: 'x.handler' },
          },
        },
      },
    }).status,
  ).not.toBe(0);
  const renamed = { ...base.template.Resources };
  renamed['Handler11111111'] = renamed['Handler886CB40B']!;
  delete renamed['Handler886CB40B'];
  renamed['Other'] = { Type: 'AWS::Logs::LogGroup', Properties: {} };
  delete renamed['RuntimeLogs92941AA6'];
  expect(validate({ ...base, template: { Resources: renamed } }).status).not.toBe(0);
});

for (const id of [
  'Handler886CB40B',
  'RuntimeLogs92941AA6',
  'RuntimeRoleFD8790A4',
  'RuntimeControlE474B2D1',
])
  for (const action of [{ Action: 'Remove' }, { Action: 'Modify', Replacement: 'True' }])
    test(`Dada la identidad retenida ${id} con ${JSON.stringify(action)}, cuando se revisa, entonces se bloquea`, () => {
      expect(
        validate({
          ...base,
          change: {
            ...base.change,
            Changes: [
              {
                ResourceChange: {
                  ResourceType: 'AWS::Lambda::Function',
                  LogicalResourceId: id,
                  ...action,
                },
              },
            ],
          },
        }).status,
      ).not.toBe(0);
    });

test('Dadas funciones nuevas o modificaciones sin reemplazo, cuando se revisa, entonces se admiten', () => {
  expect(
    validate({
      ...base,
      change: {
        ...base.change,
        Changes: [
          {
            ResourceChange: {
              ResourceType: 'AWS::Lambda::Function',
              LogicalResourceId: 'Handler886CB40B',
              Action: 'Modify',
              Replacement: 'False',
            },
          },
          {
            ResourceChange: {
              ResourceType: 'AWS::IAM::Policy',
              LogicalResourceId: 'RuntimeRoleDefaultPolicy31263C89',
              Action: 'Modify',
              Replacement: 'True',
            },
          },
          {
            ResourceChange: {
              ResourceType: 'AWS::Lambda::Function',
              LogicalResourceId: 'EditorialNotifyPost0000AAAA',
              Action: 'Add',
            },
          },
        ],
      },
    }).status,
  ).toBe(0);
});

test('Dado el catálogo del script, cuando se compara con los contratos, entonces nombres y handlers coinciden', () => {
  const result = spawnSync(
    'python3',
    [
      '-c',
      "import sys,json;sys.path.insert(0,'scripts');import review_changeset as r;print(json.dumps([r.CATALOG,r.VALIDATION_HANDLERS]))",
    ],
    { encoding: 'utf8' },
  );
  const [catalog, validation] = JSON.parse(result.stdout);
  expect(catalog).toEqual(
    Object.fromEntries(Object.values(functions).map((c) => [c.functionName, c.handler])),
  );
  expect(validation).toEqual({
    [functions.api.functionName]: 'dist/validation/api.handler',
    [functions.chat.functionName]: 'dist/validation/chat.handler',
  });
});

test('Dados workflows administrativos, cuando se inspecciona el circuito, entonces exige main, dispatch, activación, environment e identidad separados', () => {
  for (const file of [
    'plan-foundation-production.yml',
    'build-and-deploy.yml',
    'sync-parameters.yml',
  ]) {
    const text = readFileSync('.github/workflows/' + file, 'utf8');
    expect(text).toContain('workflow_dispatch:');
    expect(text).toContain("github.ref == 'refs/heads/main'");
    expect(text).toContain("== 'true'");
    expect(text).toMatch(/environment: production(?:-|\n)/);
    expect(text).toContain('get-caller-identity');
    if (file !== 'sync-parameters.yml')
      expect(text).toContain('group: portfolio-api-cloud-production-mutation');
    expect(text).not.toMatch(/AdministratorAccess|access-key-id:|secret-access-key:|cdk bootstrap/);
  }
  const workflow = readFileSync('.github/workflows/build-and-deploy.yml', 'utf8');
  expect(workflow.indexOf('"$digest" == "$REVIEWED_DIGEST"')).toBeLessThan(
    workflow.indexOf('aws cloudformation execute-change-set'),
  );
  expect(workflow).toContain('inline-session-policy:');
  expect(workflow).toContain('aws cloudformation wait');
});
test('Dadas identidades de arranque, cuando se inspeccionan las policies, entonces cada rol tiene boundary equivalente y la fundación no puede modificar su propia identidad', () => {
  const resources = JSON.parse(
    readFileSync('packages/infrastructure/templates/delivery-access.template.json', 'utf8'),
  ).Resources;
  for (const name of ['FoundationPlan', 'FoundationCloudFormation', 'GitHubExecute']) {
    const role = resources[name + 'Role'].Properties;
    expect(role.PermissionsBoundary).toEqual({ Ref: name + 'Boundary' });
    expect(role.Policies[0].PolicyDocument).toEqual(
      resources[name + 'Boundary'].Properties.PolicyDocument,
    );
    if (name !== 'FoundationCloudFormation') {
      const environment =
        name === 'FoundationPlan' ? 'production-foundation-plan' : 'production-execute';
      expect(role.AssumeRolePolicyDocument.Statement).toEqual([
        {
          Effect: 'Allow',
          Action: 'sts:AssumeRoleWithWebIdentity',
          Principal: {
            Federated:
              'arn:aws:iam::650387442642:oidc-provider/token.actions.githubusercontent.com',
          },
          Condition: {
            StringEquals: {
              'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
              'token.actions.githubusercontent.com:sub': `repo:matigaleanodev@99203645/portfolio-api-cloud@1432631186:environment:${environment}`,
            },
          },
        },
      ]);
    }
  }
  const policy = JSON.stringify(
    resources.FoundationCloudFormationBoundary.Properties.PolicyDocument,
  );
  expect(policy).not.toContain('FoundationPlanRole');
  expect(policy).not.toContain('GitHubExecuteRole');
  expect(policy).not.toContain('iam:PassRole');
  expect(policy).not.toContain('"Resource":"*"');
});

test('Dado el assembly revisado, cuando se inspeccionan template y bytes publicados, entonces detecta alteración antes de ejecución sin consultar AWS real', () => {
  const program = `
import copy,json,os,sys,tempfile,zipfile
from pathlib import Path
sys.path.insert(0,'scripts')
import review_changeset as review
d=json.load(sys.stdin)
bucket=review.BUCKET
key='a'*64+'.zip'
for r in d['template']['Resources'].values():\n  if r['Type']=='AWS::Lambda::Function': r['Properties']['Code']={'S3Bucket':bucket,'S3Key':key}
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory);(root/'asset').mkdir();(root/'asset'/'payload.txt').write_text('reviewed bytes')
 (root/'template.json').write_text(json.dumps(d['template']))
 (root/'manifest.json').write_text(json.dumps({'artifacts':{'PortfolioApiCloudTest':{'properties':{'templateFile':'template.json'}}}}))
 (root/'PortfolioApiCloudTest.assets.json').write_text(json.dumps({'files':{'a':{'source':{'path':'asset'},'destinations':{'target':{'objectKey':key}}}}}))
 os.environ['REVIEWED_ASSEMBLY']=str(root)
 altered=False
 def aws(*args):
  if args[0]=='s3api':
   with zipfile.ZipFile(args[-1],'w') as archive:archive.writestr('payload.txt','altered bytes' if altered else 'reviewed bytes')
   return {'VersionId':'v1'}
  if args[1]=='describe-change-set':return d['change']
  if args[1]=='describe-stacks':return {'Stacks':[d['stackData']]}
  if args[1]=='get-template':return {'TemplateBody':d['template']}
  raise AssertionError(args)
 review.aws=aws
 first=review.snapshot(d['change']['StackId'],d['change']['ChangeSetId'],'application')
 assert len(first['objects'])==1
 altered=True
 try:review.snapshot(d['change']['StackId'],d['change']['ChangeSetId'],'application')
 except ValueError:pass
 else:raise AssertionError('No detectó asset alterado')
 altered=False;d['template']['Description']='changed'
 try:review.snapshot(d['change']['StackId'],d['change']['ChangeSetId'],'application')
 except ValueError:pass
 else:raise AssertionError('No detectó template alterado')
`;
  const result = spawnSync('python3', ['-c', program], {
    input: JSON.stringify(base),
    encoding: 'utf8',
  });
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
});

test('Dado el indicador jerárquico de CDK sin stacks anidadas, cuando se revisa un changeset plano, entonces admite solo la raíz propia', () => {
  for (const root of [undefined, changeset]) {
    expect(
      validate({
        ...base,
        change: { ...base.change, IncludeNestedStacks: true, RootChangeSetId: root },
      }).status,
    ).toBe(0);
  }
});

test('Dadas jerarquías reales en template, cambios o relaciones, cuando se revisan, entonces se rechazan aunque el indicador no esté activo', () => {
  const nested = changeset + '-child';
  const cases = [
    {
      ...base,
      template: {
        Resources: {
          ...base.template.Resources,
          Child: { Type: 'AWS::CloudFormation::Stack' },
        },
      },
    },
    {
      ...base,
      change: {
        ...base.change,
        Changes: [
          { ResourceChange: { ResourceType: 'AWS::CloudFormation::Stack', Action: 'Add' } },
        ],
      },
    },
    {
      ...base,
      change: {
        ...base.change,
        Changes: [
          { ResourceChange: { ...base.change.Changes[0]!.ResourceChange, ChangeSetId: nested } },
        ],
      },
    },
    { ...base, change: { ...base.change, ParentChangeSetId: nested } },
    { ...base, change: { ...base.change, RootChangeSetId: nested } },
  ];
  for (const [index, input] of cases.entries()) {
    expect(validate(input).status, `Jerarquía no admitida ${index}`).not.toBe(0);
  }
});

test('Dada una actualización revertida y estable, cuando se prepara otro changeset, entonces conserva la revisión sin exigir una recreación', () => {
  const result = validate({
    ...base,
    stackData: { ...base.stackData, StackStatus: 'UPDATE_ROLLBACK_COMPLETE' },
  });
  expect(result.status, result.stderr).toBe(0);
});

test('Dados parámetros con datos personales o de cuenta, cuando se arma el recibo, entonces solo conserva sus sha256 y los booleanos', () => {
  const values: Record<string, string> = {
    ContactFromEmail: 'Portfolio <from@example.com>',
    BlogFromEmail: 'blog@example.com',
    R2Bucket: 'media-bucket',
    CertificateArn: 'arn:aws:acm:us-east-1:650387442642:certificate/abc',
    PublicAccess: 'false',
    DisableDefaultEndpoint: 'true',
  };
  const parameters = Object.entries(values).map(([ParameterKey, ParameterValue]) => ({
    ParameterKey,
    ParameterValue,
  }));
  const run = (input: Record<string, string>) =>
    validate({
      ...base,
      change: {
        ...base.change,
        Parameters: Object.entries(input).map(([ParameterKey, ParameterValue]) => ({
          ParameterKey,
          ParameterValue,
        })),
      },
    });
  const result = run(values);
  expect(result.status, result.stderr).toBe(0);
  for (const value of Object.values(values).filter((v) => !['true', 'false'].includes(v)))
    expect(result.stdout).not.toContain(value);
  const reviewed = JSON.parse(result.stdout).Parameters as {
    ParameterKey: string;
    ParameterValue: string;
  }[];
  const byKey = Object.fromEntries(reviewed.map((p) => [p.ParameterKey, p.ParameterValue]));
  expect(byKey.PublicAccess).toBe('false');
  expect(byKey.DisableDefaultEndpoint).toBe('true');
  expect(byKey.R2Bucket).toBe(
    'sha256:' + createHash('sha256').update('media-bucket').digest('hex'),
  );
  expect(parameters).toHaveLength(6);
  // Un valor distinto cambia el hash: el digest del recibo sigue atando la ejecución.
  expect(JSON.parse(run({ ...values, R2Bucket: 'other-bucket' }).stdout).Parameters).not.toEqual(
    reviewed,
  );
});
