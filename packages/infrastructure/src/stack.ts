import {
  Duration,
  CfnCondition,
  Fn,
  CfnParameter,
  DefaultStackSynthesizer,
  RemovalPolicy,
  Stack,
} from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { ManagedPolicy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { FilterPattern, MetricFilter } from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import { productionAccount, productionRegion } from '@portfolio-api-cloud/contracts/configuration';
import { functions } from '@portfolio-api-cloud/contracts/functions';
import { essentialAlarms } from './alarms.js';
import { functionParameters, httpEnvironment, parameterName, storageParameters } from './config.js';
import { Editorial } from './editorial.js';
import { httpApi } from './http-api.js';
import { runtimeFunction } from './runtime.js';

export const PRODUCTION_ACCOUNT = productionAccount;
export const PRODUCTION_REGION = productionRegion;
export const VALIDATION_SCENARIOS = ['success', 'error', 'pending-body', 'ambiguous'] as const;

const roleArn = (name: string) =>
  `arn:aws:iam::${PRODUCTION_ACCOUNT}:role/PortfolioApiCloudTest${name}`;

export class PortfolioApiStack extends Stack {
  constructor(scope: Construct) {
    if (scope.node.tryGetContext('stage') !== 'production')
      throw new Error('Solo se admite el ambiente production.');
    super(scope, 'PortfolioApiCloudTest', {
      stackName: 'portfolio-api-cloud-test',
      env: { account: PRODUCTION_ACCOUNT, region: PRODUCTION_REGION },
      synthesizer: new DefaultStackSynthesizer({
        qualifier: 'papiatest',
        deployRoleArn: roleArn('CdkDeployRole'),
        cloudFormationExecutionRole: roleArn('CloudFormationExecutionRole'),
        fileAssetPublishingRoleArn: roleArn('FilePublishingRole'),
        generateBootstrapVersionRule: true,
      }),
    });
    const scenario = scope.node.tryGetContext('validationScenario') as unknown;
    if (
      scenario !== undefined &&
      !(VALIDATION_SCENARIOS as readonly string[]).includes(String(scenario))
    )
      throw new Error('Invalid validation scenario');
    const validation = scenario !== undefined;

    const boundaryArn = new CfnParameter(this, 'RuntimePermissionsBoundaryArn', {
      type: 'String',
      allowedPattern: `arn:aws:iam::${PRODUCTION_ACCOUNT}:policy/PortfolioApiCloudTestRuntimeBoundary`,
      description:
        'Boundary de runtime previamente creada y revisada; no se provisiona por esta stack.',
    });
    const boundary = ManagedPolicy.fromManagedPolicyArn(
      this,
      'RuntimeBoundary',
      boundaryArn.valueAsString,
    );
    const cors = new CfnParameter(this, 'CorsOrigin', {
      type: 'String',
      default: '',
      description: 'Origen permitido; CORS se deshabilita si no se define.',
    });
    const certificate = new CfnParameter(this, 'CertificateArn', {
      type: 'String',
      default: '',
      allowedPattern: '|arn:aws:acm:us-east-1:650387442642:certificate/[a-f0-9-]+',
    });
    const hasDomain = new CfnCondition(this, 'HasCustomDomain', {
      expression: Fn.conditionNot(Fn.conditionEquals(certificate.valueAsString, '')),
    });
    const disableDefault = new CfnParameter(this, 'DisableDefaultEndpoint', {
      type: 'String',
      default: 'false',
      allowedValues: ['false', 'true'],
    });
    const closeDefaultEndpoint = new CfnCondition(this, 'CloseDefaultEndpoint', {
      expression: Fn.conditionEquals(disableDefault.valueAsString, 'true'),
    });
    const alarmTopic = new CfnParameter(this, 'AlarmTopicArn', {
      type: 'String',
      default: '',
      allowedPattern: '|arn:aws:sns:us-east-1:650387442642:portfolio-api-cloud-alerts',
    });
    const hasAlarmTopic = new CfnCondition(this, 'HasAlarmTopic', {
      expression: Fn.conditionNot(Fn.conditionEquals(alarmTopic.valueAsString, '')),
    });
    const publicAccess = new CfnParameter(this, 'PublicAccess', {
      type: 'String',
      default: 'false',
      allowedValues: ['false', 'true'],
      description: 'Public business routes only after candidate validation.',
    });
    const publicCondition = new CfnCondition(this, 'PublicIngress', {
      expression: Fn.conditionEquals(publicAccess.valueAsString, 'true'),
    });

    const control = new Table(this, 'RuntimeControl', {
      tableName: 'portfolio-api-cloud-test-control',
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.RETAIN,
      deletionProtection: true,
    });

    const storage = storageParameters(this);
    const shared = {
      CORS_ORIGIN: cors.valueAsString,
      QUOTA_TABLE_NAME: control.tableName,
      ...httpEnvironment(this, storage, validation),
    };
    const apiParameter = parameterName(functionParameters.api, validation);
    const chatParameter = parameterName(functionParameters.chat, validation);
    const handler = runtimeFunction(this, {
      contract: functions.api,
      boundary,
      ids: { function: functions.api.logicalId, logs: 'RuntimeLogs', role: 'RuntimeRole' },
      roleName: 'PortfolioApiCloudTestRuntimeRole',
      asset: validation ? '.tmp/lambda-validation-api' : '.tmp/lambda-api',
      handler: validation ? 'dist/validation/api.handler' : functions.api.handler,
      // La API carga el parámetro de chat solo para variantes de ruta no canónicas.
      parameters: [apiParameter, chatParameter],
      environment: { ...shared, CHAT_PARAMETER_NAME: chatParameter },
    });
    const chat = runtimeFunction(this, {
      contract: functions.chat,
      boundary,
      ids: { function: functions.chat.logicalId, logs: 'ChatLogs', role: 'ChatRole' },
      roleName: 'PortfolioApiCloudTestRuntimeChatRole',
      asset: validation ? '.tmp/lambda-validation-chat' : '.tmp/lambda-chat',
      handler: validation ? 'dist/validation/chat.handler' : functions.chat.handler,
      parameters: [chatParameter],
      environment: shared,
    });
    for (const { role } of [handler, chat])
      role.addToPolicy(
        new PolicyStatement({
          actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'],
          resources: [control.tableArn],
        }),
      );

    // La variante de validación reemplaza solo el código y la configuración HTTP.
    new Editorial(this, 'Editorial', { boundary, storage });

    httpApi(this, {
      handler: handler.fn,
      chat: chat.fn,
      publicCondition,
      hasDomain,
      closeDefaultEndpoint,
      certificateArn: certificate.valueAsString,
    });

    // Misma métrica en ambos log groups HTTP: una sola métrica personalizada.
    const failures = [
      ['HttpServerFailures', handler.logs],
      ['ChatHttpServerFailures', chat.logs],
    ] as const;
    const filters = failures.map(
      ([id, logGroup]) =>
        new MetricFilter(this, id, {
          logGroup,
          filterPattern: FilterPattern.literal(
            '{ $.event = "http_request" && $.statusCode >= 500 }',
          ),
          metricNamespace: 'PortfolioApiCloud',
          metricName: 'HttpServerFailures',
          metricValue: '1',
          defaultValue: 0,
        }),
    );
    essentialAlarms(
      this,
      Fn.conditionIf(
        hasAlarmTopic.logicalId,
        [alarmTopic.valueAsString],
        Fn.ref('AWS::NoValue'),
      ) as unknown as string[],
      filters[0]!.metric({ period: Duration.minutes(5), statistic: 'Sum' }),
    );
  }
}
