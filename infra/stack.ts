import {
  CfnOutput,
  CfnParameter,
  DefaultStackSynthesizer,
  Duration,
  RemovalPolicy,
  Stack,
} from 'aws-cdk-lib';
import { HttpApi, HttpMethod, HttpNoneAuthorizer, HttpStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpIamAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Architecture, Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

export const TEST_ACCOUNT = '650387442642';
export const TEST_REGION = 'us-east-1';

const roleArn = (name: string) => `arn:aws:iam::${TEST_ACCOUNT}:role/PortfolioApiCloudTest${name}`;

export class PortfolioApiStack extends Stack {
  constructor(scope: Construct) {
    if (scope.node.tryGetContext('stage') !== 'test')
      throw new Error('Solo se admite el ambiente test.');
    super(scope, 'PortfolioApiCloudTest', {
      stackName: 'portfolio-api-cloud-test',
      env: { account: TEST_ACCOUNT, region: TEST_REGION },
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
      allowedPattern: `arn:aws:iam::${TEST_ACCOUNT}:policy/PortfolioApiCloudTestRuntimeBoundary`,
      description:
        'Boundary de runtime previamente creada y revisada; no se provisiona por esta stack.',
    });

    const cors = new CfnParameter(this, 'CorsOrigin', {
      type: 'String',
      default: '',
      description: 'Origen de pruebas; vacío deshabilita CORS.',
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

    const handler = new Function(this, 'Handler', {
      functionName: 'portfolio-api-cloud-test',
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      handler: 'dist/handler.handler',
      code: Code.fromAsset('.tmp/lambda'),
      role: runtimeRole,
      logGroup: logs,
      memorySize: 512,
      timeout: Duration.seconds(28),
      reservedConcurrentExecutions: 5,
      environment: { NODE_ENV: 'production', CORS_ORIGIN: cors.valueAsString },
    });

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

    api.addRoutes({
      path: '/{proxy+}',
      methods: [HttpMethod.OPTIONS],
      integration,
      authorizer: new HttpNoneAuthorizer(),
    });

    new HttpStage(this, 'DefaultStage', {
      httpApi: api,
      stageName: '$default',
      autoDeploy: true,
      throttle: { rateLimit: 2, burstLimit: 5 },
    });

    new CfnOutput(this, 'ApiEndpoint', { value: api.apiEndpoint });
  }
}
