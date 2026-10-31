#!/usr/bin/env python3
"""Vincula la revisión con el changeset vivo; solo lectura AWS, nunca ejecuta."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import zipfile
from review_bundle import inventory

PREFIX = 'arn:aws:cloudformation:us-east-1:650387442642:'
BUCKET = 'cdk-papiatest-assets-650387442642-us-east-1'
# Catálogo esperado (contracts/functions.ts): nombre físico -> handler productivo. La variante de
# validación cambia solo el código de las funciones HTTP; un test de tooling verifica la paridad.
CATALOG = {
    'portfolio-api-cloud-test': 'dist/handlers/api.handler',
    'portfolio-api-cloud-test-chat': 'dist/handlers/chat.handler',
    'portfolio-api-cloud-test-process-release': 'dist/handlers/process-release.handler',
    'portfolio-api-cloud-test-generate-og': 'dist/handlers/generate-og.handler',
    'portfolio-api-cloud-test-notify-post': 'dist/handlers/notify-post.handler',
    'portfolio-api-cloud-test-publish-chat-knowledge': 'dist/handlers/publish-chat-knowledge.handler',
}
VALIDATION_HANDLERS = {
    'portfolio-api-cloud-test': 'dist/validation/api.handler',
    'portfolio-api-cloud-test-chat': 'dist/validation/chat.handler',
}
# Identidades retenidas: la función, sus logs, la tabla de control y el rol no se eliminan ni reemplazan.
RETAINED = re.compile(r'(?:Handler|RuntimeLogs|RuntimeControl|RuntimeRole)[0-9A-F]{8}')

def check_catalog(template, validation=None):
    functions = {v['Properties'].get('FunctionName'): v['Properties'].get('Handler') for v in template['Resources'].values() if v['Type'] == 'AWS::Lambda::Function'}
    if len(functions) != len(CATALOG) or set(functions) != set(CATALOG):
        raise ValueError('Paquete de aplicación inesperado')
    for name, handler in functions.items():
        allowed = {CATALOG[name]} if validation is False else {CATALOG[name], VALIDATION_HANDLERS.get(name)}
        if handler not in allowed:
            raise ValueError('Handler inesperado: ' + name)
    retained = [key for key in template['Resources'] if RETAINED.fullmatch(key)]
    if sorted(re.sub(r'[0-9A-F]{8}$', '', key) for key in retained) != ['Handler', 'RuntimeControl', 'RuntimeLogs', 'RuntimeRole']:
        raise ValueError('Identidades retenidas ausentes o duplicadas')

def targets(stack, changeset, kind):
    name = 'portfolio-api-cloud-test' + ('-foundation' if kind == 'foundation' else '')
    if kind not in ('application', 'foundation') or not re.fullmatch(re.escape(PREFIX + 'stack/' + name + '/') + r'[A-Za-z0-9-]+', stack):
        raise ValueError('Stack fuera del destino previsto')
    if not re.fullmatch(re.escape(PREFIX + 'changeSet/' + name + '-') + r'[a-f0-9]{40}-[0-9]+-[0-9]+/[A-Za-z0-9-]+', changeset):
        raise ValueError('Changeset fuera del destino previsto')
    return name

def session_policy(stack, changeset, kind):
    targets(stack, changeset, kind)
    statements = [
        {'Effect':'Allow', 'Action':['cloudformation:DescribeChangeSet','cloudformation:GetTemplate','cloudformation:DescribeStacks','cloudformation:DescribeStackEvents'], 'Resource':stack},
        {'Effect':'Allow', 'Action':'cloudformation:ExecuteChangeSet', 'Resource':stack,
         'Condition':{'StringEquals':{'cloudformation:ChangeSetName':[changeset, changeset.split('/')[-2]]}}},
    ]
    if kind == 'application':
        statements.append({'Effect':'Allow','Action':'s3:GetObject','Resource':'arn:aws:s3:::' + BUCKET + '/*'})
    return {'Version':'2012-10-17','Statement':statements}

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',',':')).encode()).hexdigest()

def redact_parameters(parameters):
    """El recibo se publica como artifact: los valores no booleanos (correos, buckets, ARN de cuenta)
    quedan como sha256 y el digest del recibo sigue atando la ejecución a esos mismos valores."""
    result=[]
    for parameter in parameters:
        item=dict(parameter)
        for field in ('ParameterValue','ResolvedValue'):
            value=item.get(field)
            if isinstance(value,str) and value not in ('true','false'):
                item[field]='sha256:'+hashlib.sha256(value.encode()).hexdigest()
        result.append(item)
    return result

def validate(change, stack_data, template, stack, changeset, kind):
    name=targets(stack,changeset,kind)
    if change.get('StackId') != stack or change.get('ChangeSetId') != changeset or change.get('StackName') != name or change.get('ChangeSetName') != changeset.split('/')[-2]:
        raise ValueError('Identidad del changeset alterada')
    if change.get('Status') != 'CREATE_COMPLETE' or change.get('ExecutionStatus') != 'AVAILABLE' or change.get('NextToken'):
        raise ValueError('Changeset incompleto o no disponible')
    if change.get('ImportExistingResources') or change.get('NotificationARNs'):
        raise ValueError('Alcance adicional no permitido')
    if change.get('ParentChangeSetId') or change.get('RootChangeSetId') not in (None, changeset):
        raise ValueError('Jerarquía de changesets no permitida')
    if any(resource['Type']=='AWS::CloudFormation::Stack' for resource in template['Resources'].values()):
        raise ValueError('Stacks anidadas no permitidas')
    role='PortfolioApiCloudTest' + ('FoundationCloudFormationRole' if kind=='foundation' else 'CloudFormationExecutionRole')
    if stack_data.get('StackId') != stack or stack_data.get('RoleARN') != 'arn:aws:iam::650387442642:role/' + role:
        raise ValueError('Ejecutor CloudFormation inesperado')
    if stack_data.get('StackStatus') not in ('REVIEW_IN_PROGRESS','CREATE_COMPLETE','UPDATE_COMPLETE','UPDATE_ROLLBACK_COMPLETE'):
        raise ValueError('Estado previo de stack no admitido')
    changes=change.get('Changes',[])
    if not changes: raise ValueError('Changeset vacío')
    for item in changes:
        resource=item.get('ResourceChange',{})
        if resource.get('ResourceType')=='AWS::CloudFormation::Stack' or resource.get('ChangeSetId'):
            raise ValueError('Cambios anidados no permitidos')
        destructive=resource.get('Action')=='Remove' or resource.get('Replacement') in ('True','Conditional')
        if resource.get('ResourceType')=='AWS::DynamoDB::Table' and destructive:
            raise ValueError('El control compartido no se elimina ni reemplaza')
        if kind=='application' and destructive and RETAINED.fullmatch(resource.get('LogicalResourceId') or ''):
            raise ValueError('Identidad retenida eliminada o reemplazada: ' + resource['LogicalResourceId'])
    if kind=='application':
        check_catalog(template)
    reviewed={key:change[key] for key in ('StackId','StackName','ChangeSetId','ChangeSetName','Changes','Capabilities') if key in change}
    if 'Parameters' in change: reviewed['Parameters']=redact_parameters(change['Parameters'])
    return reviewed

def aws(*args):
    result=subprocess.run(['aws',*args,'--region','us-east-1','--output','json','--no-cli-pager'],check=True,capture_output=True,text=True)
    return json.loads(result.stdout)

def snapshot(stack,changeset,kind):
    targets(stack,changeset,kind)
    change=aws('cloudformation','describe-change-set','--stack-name',stack,'--change-set-name',changeset)
    stacks=aws('cloudformation','describe-stacks','--stack-name',stack)['Stacks']
    if len(stacks)!=1: raise ValueError('Stack ambigua')
    template=aws('cloudformation','get-template','--stack-name',stack,'--change-set-name',changeset,'--template-stage','Original')['TemplateBody']
    if isinstance(template,str): template=json.loads(template)
    if os.environ.get('REVIEWED_ASSEMBLY'):
        assembly=Path(os.environ['REVIEWED_ASSEMBLY'])
        manifest=json.loads((assembly/'manifest.json').read_text())
        source=manifest['artifacts']['PortfolioApiCloudTest']['properties']['templateFile']
        if template!=json.loads((assembly/source).read_text()): raise ValueError('Template distinto del assembly revisado')
    if os.environ.get('REVIEWED_FOUNDATION') and template!=json.loads(Path(os.environ['REVIEWED_FOUNDATION']).read_text()):
        raise ValueError('Template de fundación distinto del revisado')
    reviewed=validate(change,stacks[0],template,stack,changeset,kind)
    objects=[]
    seen=set()
    for resource in template['Resources'].values():
        if resource['Type']!='AWS::Lambda::Function': continue
        code=resource['Properties']['Code']
        # editorial.zip lo comparten tres funciones: cada objeto se verifica una sola vez.
        identity=(code.get('S3Bucket'), code.get('S3Key'), code.get('S3ObjectVersion'))
        if identity in seen: continue
        seen.add(identity)
        if code['S3Bucket']!=BUCKET or not re.fullmatch(r'[a-f0-9]+\.zip',code['S3Key']):
            raise ValueError('Asset fuera del bucket previsto')
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'asset.zip'
            args=['s3api','get-object','--bucket',BUCKET,'--key',code['S3Key']]
            if code.get('S3ObjectVersion'): args+=['--version-id',code['S3ObjectVersion']]
            metadata=aws(*args,str(path))
            if os.environ.get('REVIEWED_ASSEMBLY'):
                assembly=Path(os.environ['REVIEWED_ASSEMBLY'])
                assets=json.loads((assembly/'PortfolioApiCloudTest.assets.json').read_text())
                sources=[v['source']['path'] for v in assets['files'].values() if any(d['objectKey']==code['S3Key'] for d in v['destinations'].values())]
                if len(sources)!=1: raise ValueError('Asset sin fuente única')
                expected=inventory(assembly/sources[0])
                with zipfile.ZipFile(path) as archive:
                    files=[i for i in archive.infolist() if not i.is_dir()]
                    if len(files)!=len({i.filename for i in files}): raise ValueError('Asset con rutas duplicadas')
                    actual={i.filename:hashlib.sha256(archive.read(i)).hexdigest() for i in files}
                    if actual!=expected: raise ValueError('Los bytes publicados no coinciden con el assembly revisado')
            objects.append({'key':code['S3Key'],'version':metadata.get('VersionId'),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    return {'kind':kind,'change':reviewed,'role':stacks[0]['RoleARN'],'templateHash':digest(template),'objects':objects}

if __name__=='__main__':
    command,stack,changeset,kind,output=sys.argv[1:]
    if command=='policy': value=session_policy(stack,changeset,kind)
    elif command=='snapshot':
        if os.environ.get('GITHUB_ACTIONS')!='true': raise ValueError('La lectura administrada se realiza desde Actions')
        value=snapshot(stack,changeset,kind)
        print('sha256:'+digest(value))
    else: raise ValueError('Comando no válido')
    Path(output).write_text(json.dumps(value,indent=2)+'\n')
