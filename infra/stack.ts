import { Alarm, ComparisonOperator, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import {
  CfnCondition,
  Fn,
  CfnOutput,
  CfnParameter,
  DefaultStackSynthesizer,
  Duration,
  RemovalPolicy,
  Stack,
  Token,
} from 'aws-cdk-lib';
import {
  CfnApi,
  CfnDomainName,
  CfnApiMapping,
  CfnRoute,
  HttpApi,
  HttpMethod,
  HttpNoneAuthorizer,
  HttpStage,
} from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpIamAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Architecture, Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays, MetricFilter, FilterPattern } from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

export const PRODUCTION_ACCOUNT = '650387442642';
export const PRODUCTION_REGION = 'us-east-1';

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

    const boundary = new CfnParameter(this, 'RuntimePermissionsBoundaryArn', {
      type: 'String',
      allowedPattern: `arn:aws:iam::${PRODUCTION_ACCOUNT}:policy/PortfolioApiCloudTestRuntimeBoundary`,
      description:
        'Boundary de runtime previamente creada y revisada; no se provisiona por esta stack.',
    });

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
    const disableDefaultCondition = new CfnCondition(this, 'CloseDefaultEndpoint', {
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
    const alarmActions = Fn.conditionIf(
      hasAlarmTopic.logicalId,
      [alarmTopic.valueAsString],
      Fn.ref('AWS::NoValue'),
    ) as unknown as string[];

    const publicAccess = new CfnParameter(this, 'PublicAccess', {
      type: 'String',
      default: 'false',
      allowedValues: ['false', 'true'],
      description: 'Public business routes only after candidate validation.',
    });
    const publicCondition = new CfnCondition(this, 'PublicIngress', {
      expression: Fn.conditionEquals(publicAccess.valueAsString, 'true'),
    });

    const secretArn = new CfnParameter(this, 'RuntimeSecretArn', {
      type: 'String',
      noEcho: true,
      allowedPattern:
        'arn:aws:secretsmanager:us-east-1:650387442642:secret:portfolio-api-cloud/test/[A-Za-z0-9/_+=.@-]+',
      description: 'Secreto por ambiente previamente provisionado; sin valores en synth.',
    });
    const control = new Table(this, 'RuntimeControl', {
      tableName: 'portfolio-api-cloud-test-control',
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.RETAIN,
      deletionProtection: true,
    });
    const logs = new LogGroup(this, 'RuntimeLogs', {
      logGroupName: '/aws/lambda/portfolio-api-cloud-test',
      retention: RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const runtimeRole = new Role(this, 'RuntimeRole', {
      roleName: 'PortfolioApiCloudTestRuntimeRole',
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      permissionsBoundary: ManagedPolicy.fromManagedPolicyArn(
        this,
        'RuntimeBoundary',
        boundary.valueAsString,
      ),
    });

    runtimeRole.addToPolicy(
      new PolicyStatement({
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [`${logs.logGroupArn}:*`],
      }),
    );

    runtimeRole.addToPolicy(
      new PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'],
        resources: [control.tableArn],
      }),
    );
    runtimeRole.addToPolicy(
      new PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [secretArn.valueAsString],
      }),
    );
    const scenario = scope.node.tryGetContext('validationScenario') as unknown;
    if (
      scenario !== undefined &&
      !['success', 'error', 'pending-body', 'ambiguous'].includes(String(scenario))
    )
      throw new Error('Invalid validation scenario');
    const handler = new Function(this, 'Handler', {
      functionName: 'portfolio-api-cloud-test',
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      handler: scenario ? 'dist/validation/handler.handler' : 'dist/handler.handler',
      code: Code.fromAsset(scenario ? '.tmp/lambda-validation' : '.tmp/lambda'),
      role: runtimeRole,
      logGroup: logs,
      memorySize: 512,
      timeout: Duration.seconds(28),
      // Cuota regional 10: no hay reserva compatible sin ampliar la cuota a más de 100.
      // El gateway y DynamoDB limitan el ingreso y el gasto compartido.
      environment: {
        NODE_ENV: 'production',
        CORS_ORIGIN: cors.valueAsString,
        QUOTA_TABLE_NAME: control.tableName,
        RUNTIME_SECRET_ARN: secretArn.valueAsString,
      },
    });

    for (const [name, metric, threshold] of [
      ['Errors', handler.metricErrors({ period: Duration.minutes(5) }), 1],
      ['Throttles', handler.metricThrottles({ period: Duration.minutes(5) }), 1],
      [
        'Duration',
        handler.metricDuration({ period: Duration.minutes(5), statistic: 'p95' }),
        24_000,
      ],
    ] as const) {
      const alarm = new Alarm(this, `Runtime${name}Alarm`, {
        alarmName: `portfolio-api-cloud-test-${name.toLowerCase()}`,
        metric,
        threshold,
        evaluationPeriods: 1,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: TreatMissingData.NOT_BREACHING,
      });
      (alarm.node.defaultChild as import('aws-cdk-lib/aws-cloudwatch').CfnAlarm).alarmActions =
        alarmActions;
    }
    const httpFailures = new MetricFilter(this, 'HttpServerFailures', {
      logGroup: logs,
      filterPattern: FilterPattern.literal('{ $.event = "http_request" && $.statusCode >= 500 }'),
      metricNamespace: 'PortfolioApiCloud',
      metricName: 'HttpServerFailures',
      metricValue: '1',
      defaultValue: 0,
    });
    const httpAlarm = new Alarm(this, 'HttpServerFailuresAlarm', {
      alarmName: 'portfolio-api-cloud-test-http-errors',
      metric: httpFailures.metric({ period: Duration.minutes(5), statistic: 'Sum' }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    (httpAlarm.node.defaultChild as import('aws-cdk-lib/aws-cloudwatch').CfnAlarm).alarmActions =
      alarmActions;
    const integration = new HttpLambdaIntegration('HandlerIntegration', handler, {
      timeout: Duration.seconds(29),
    });

    // El handler resuelve mayúsculas y errores de ruta; IAM aísla test hasta completar sus protecciones.
    const api = new HttpApi(this, 'Api', {
      apiName: 'portfolio-api-cloud-test',
      createDefaultStage: false,
      defaultIntegration: integration,
      defaultAuthorizer: new HttpIamAuthorizer(),
    });

    const defaultRoute = api.node.findChild('DefaultRoute').node.defaultChild as CfnRoute;
    defaultRoute.addPropertyOverride(
      'AuthorizationType',
      Fn.conditionIf(publicCondition.logicalId, 'NONE', 'AWS_IAM'),
    );

    handler.addEnvironment('TRUSTED_API_ID', api.apiId);
    handler.addEnvironment(
      'TRUSTED_CUSTOM_DOMAIN',
      Token.asString(Fn.conditionIf(hasDomain.logicalId, 'api.matiasgaleano.dev', '')),
    );
    (api.node.defaultChild as CfnApi).disableExecuteApiEndpoint = Fn.conditionIf(
      disableDefaultCondition.logicalId,
      true,
      false,
    ) as unknown as boolean;
    const domain = new CfnDomainName(this, 'CustomDomain', {
      domainName: 'api.matiasgaleano.dev',
      tags: { Project: 'portfolio-api-cloud' },
      domainNameConfigurations: [
        {
          certificateArn: certificate.valueAsString,
          endpointType: 'REGIONAL',
          securityPolicy: 'TLS_1_2',
        },
      ],
    });
    domain.cfnOptions.condition = hasDomain;
    const mapping = new CfnApiMapping(this, 'CustomDomainMapping', {
      apiId: api.apiId,
      domainName: domain.ref,
      stage: '$default',
    });
    mapping.cfnOptions.condition = hasDomain;

    api.addRoutes({
      path: '/{proxy+}',
      methods: [HttpMethod.OPTIONS],
      integration,
      authorizer: new HttpNoneAuthorizer(),
    });

    const stage = new HttpStage(this, 'DefaultStage', {
      httpApi: api,
      stageName: '$default',
      autoDeploy: true,
      throttle: { rateLimit: 2, burstLimit: 5 },
    });

    mapping.addDependency(
      stage.node.defaultChild as import('aws-cdk-lib/aws-apigatewayv2').CfnStage,
    );
    new CfnOutput(this, 'RegionalDomainTarget', {
      value: domain.attrRegionalDomainName,
      condition: hasDomain,
    });
    new CfnOutput(this, 'ApiEndpoint', { value: api.apiEndpoint });
  }
}
