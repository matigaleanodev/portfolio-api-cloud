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
        if resource.get('ResourceType')=='AWS::DynamoDB::Table' and (resource.get('Action')=='Remove' or resource.get('Replacement') in ('True','Conditional')):
            raise ValueError('El control compartido no se elimina ni reemplaza')
    if kind=='application':
        functions=[v['Properties'] for v in template['Resources'].values() if v['Type']=='AWS::Lambda::Function']
        if len(functions)!=1 or functions[0]['FunctionName']!='portfolio-api-cloud-test' or functions[0]['Handler'] not in ('dist/validation/handler.handler', 'dist/handler.handler'):
            raise ValueError('Paquete de aplicación inesperado')
    return {key:change[key] for key in ('StackId','StackName','ChangeSetId','ChangeSetName','Changes','Parameters','Capabilities') if key in change}

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
    for resource in template['Resources'].values():
        if resource['Type']!='AWS::Lambda::Function': continue
        code=resource['Properties']['Code']
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
