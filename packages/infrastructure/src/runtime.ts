import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { type IManagedPolicy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Architecture, Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import { productionAccount, productionRegion } from '@portfolio-api-cloud/contracts/configuration';
import type { FunctionContract } from '@portfolio-api-cloud/contracts/functions';
import { parameterArn, type FunctionEnvironment } from './config.js';

export interface RuntimeFunctionProps {
  readonly contract: FunctionContract;
  readonly boundary: IManagedPolicy;
  /** IDs lógicos; Handler/RuntimeLogs/RuntimeRole se conservan para no reemplazar la API. */
  readonly ids: { readonly function: string; readonly logs: string; readonly role: string };
  readonly roleName: string;
  readonly asset: string;
  readonly handler: string;
  /** Parámetros SSM legibles; el primero es RUNTIME_PARAMETER_NAME. */
  readonly parameters: readonly string[];
  readonly environment: FunctionEnvironment;
}

export interface RuntimeFunction {
  readonly fn: Function;
  readonly role: Role;
  readonly logs: LogGroup;
}

/** Lectura de parámetros SecureString con la clave administrada aws/ssm, sin KeyId fijo. */
export function parameterStatements(names: readonly string[]): PolicyStatement[] {
  const arns = names.map(parameterArn);
  return [
    new PolicyStatement({ actions: ['ssm:GetParameter'], resources: arns }),
    new PolicyStatement({
      actions: ['kms:Decrypt'],
      resources: [`arn:aws:kms:${productionRegion}:${productionAccount}:key/*`],
      conditions: {
        StringEquals: {
          'kms:ViaService': `ssm.${productionRegion}.amazonaws.com`,
          'kms:EncryptionContext:PARAMETER_ARN': arns.length === 1 ? arns[0] : arns,
        },
      },
    }),
  ];
}

/**
 * Función Node 24 con log group explícito retenido y rol propio acotado por la boundary runtime.
 * Sin reservedConcurrentExecutions: la concurrencia regional se comparte entre proyectos y Lambda
 * exige conservar 10 sin reservar; una reserva solo es viable con una cuota mayor.
 */
export function runtimeFunction(scope: Construct, props: RuntimeFunctionProps): RuntimeFunction {
  const { contract } = props;
  const logs = new LogGroup(scope, props.ids.logs, {
    logGroupName: `/aws/lambda/${contract.functionName}`,
    retention: RetentionDays.TWO_WEEKS,
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const role = new Role(scope, props.ids.role, {
    roleName: props.roleName,
    assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    permissionsBoundary: props.boundary,
  });
  role.addToPolicy(
    new PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [`${logs.logGroupArn}:*`],
    }),
  );
  for (const statement of parameterStatements(props.parameters)) role.addToPolicy(statement);
  const fn = new Function(scope, props.ids.function, {
    functionName: contract.functionName,
    runtime: Runtime.NODEJS_24_X,
    architecture: contract.architecture === 'arm64' ? Architecture.ARM_64 : Architecture.X86_64,
    handler: props.handler,
    code: Code.fromAsset(props.asset),
    role,
    logGroup: logs,
    memorySize: contract.memorySize,
    timeout: Duration.seconds(contract.timeoutSeconds),
    environment: {
      NODE_ENV: 'production',
      RUNTIME_PARAMETER_NAME: props.parameters[0]!,
      ...props.environment,
    } as Record<string, string>,
  });
  return { fn, role, logs };
}
