import { expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
      Handler: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: 'portfolio-api-cloud-test',
          Handler: 'dist/validation/handler.handler',
        },
      },
    },
  },
};
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
  ['IncludeNestedStacks', true],
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
test('Dado un rol distinto o paquete normal, cuando se revisa el primer despliegue, entonces rechaza ejecución', () => {
  expect(
    validate({
      ...base,
      stackData: { ...base.stackData, RoleARN: 'arn:aws:iam::650387442642:role/other' },
    }).status,
  ).not.toBe(0);
  expect(
    validate({
      ...base,
      template: {
        Resources: {
          Handler: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'portfolio-api-cloud-test',
              Handler: 'dist/handler.handler',
            },
          },
        },
      },
    }).status,
  ).not.toBe(0);
});
test('Dados workflows administrativos, cuando se inspecciona el circuito, entonces exige main, dispatch, activación, environment e identidad separados', () => {
  for (const file of ['foundation-test.yml', 'execute-test.yml', 'validation-secret.yml']) {
    const text = readFileSync('.github/workflows/' + file, 'utf8');
    expect(text).toContain('workflow_dispatch:');
    expect(text).toContain("github.ref == 'refs/heads/main'");
    expect(text).toContain("== 'true'");
    expect(text).toContain('environment: test-');
    expect(text).toContain('get-caller-identity');
    expect(text).toContain('group: portfolio-api-cloud-test-mutation');
    expect(text).not.toMatch(/AdministratorAccess|access-key-id:|secret-access-key:|cdk bootstrap/);
  }
  const workflow = readFileSync('.github/workflows/execute-test.yml', 'utf8');
  expect(workflow.indexOf('"$digest" == "$REVIEWED_DIGEST"')).toBeLessThan(
    workflow.indexOf('aws cloudformation execute-change-set'),
  );
  expect(workflow).toContain('inline-session-policy:');
  expect(workflow).toContain('aws cloudformation wait');
});
test('Dadas identidades de arranque, cuando se inspeccionan las policies, entonces cada rol tiene boundary equivalente y la fundación no puede modificar su propia identidad', () => {
  const resources = JSON.parse(
    readFileSync('infra/delivery-access.template.json', 'utf8'),
  ).Resources;
  for (const name of ['FoundationPlan', 'FoundationCloudFormation', 'GitHubExecute']) {
    const role = resources[name + 'Role'].Properties;
    expect(role.PermissionsBoundary).toEqual({ Ref: name + 'Boundary' });
    expect(role.Policies[0].PolicyDocument).toEqual(
      resources[name + 'Boundary'].Properties.PolicyDocument,
    );
    if (name !== 'FoundationCloudFormation') {
      const environment = name === 'FoundationPlan' ? 'test-foundation-plan' : 'test-execute';
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
d['template']['Resources']['Handler']['Properties']['Code']={'S3Bucket':bucket,'S3Key':key}
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
