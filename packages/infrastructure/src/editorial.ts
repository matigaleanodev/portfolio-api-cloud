import { ArnPrincipal, type IManagedPolicy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { functions, type FunctionId } from '@portfolio-api-cloud/contracts/functions';
import { productionAccount } from '@portfolio-api-cloud/contracts/configuration';
import { editorialEnvironment } from '@portfolio-api-cloud/contracts/editorial';
import {
  editorialValues,
  type FunctionEnvironment,
  functionParameters,
  parameterName,
  type StorageParameters,
} from './config.js';
import { runtimeFunction, type RuntimeFunction } from './runtime.js';

/** Rol del CI de publicación del frontend; es el único principal externo con resource policy. */
export const RELEASE_INVOKER_ROLE = `arn:aws:iam::${productionAccount}:role/PortfolioGitHubReleaseRole`;

type EditorialFunctionId = keyof typeof editorialEnvironment & FunctionId;

const assets = { editorial: '.tmp/lambda-editorial', og: '.tmp/lambda-og' } as const;

export interface EditorialProps {
  readonly boundary: IManagedPolicy;
  readonly storage: StorageParameters;
}

/**
 * Publicación editorial: sin event sources, schedules ni X-Ray. process-release invoca generate-og y notify-post; el CI de portfolio invoca
 * process-release y publish-chat-knowledge.
 */
export class Editorial extends Construct {
  readonly functions: Record<EditorialFunctionId, RuntimeFunction>;

  constructor(scope: Construct, id: string, props: EditorialProps) {
    super(scope, id);
    const values = editorialValues(scope, props.storage);
    const environmentFor = (key: EditorialFunctionId, extra: FunctionEnvironment = {}) => {
      const available = { ...values, ...extra };
      const { required, optional } = editorialEnvironment[key];
      const missing = required.filter((name) => available[name] === undefined);
      if (missing.length)
        throw new Error(`Configuración editorial sin valor: ${missing.join(', ')}`);
      return Object.fromEntries(
        [...required, ...optional].map((name) => [name, available[name]!]),
      ) as FunctionEnvironment;
    };
    const create = (key: EditorialFunctionId, extra?: FunctionEnvironment) => {
      const contract = functions[key];
      if (contract.artifact !== 'editorial' && contract.artifact !== 'og')
        throw new Error(`Artifact editorial inesperado: ${key}`);
      return runtimeFunction(this, {
        contract,
        boundary: props.boundary,
        ids: {
          function: contract.logicalId,
          logs: `${contract.logicalId}Logs`,
          role: `${contract.logicalId}Role`,
        },
        roleName: `PortfolioApiCloudTestRuntime${contract.logicalId}Role`,
        asset: assets[contract.artifact],
        handler: contract.handler,
        parameters: [parameterName(functionParameters[key], false)],
        environment: environmentFor(key, extra),
      });
    };
    const generateOg = create('generateOg');
    const notifyPost = create('notifyPost');
    const processRelease = create('processRelease', {
      GENERATE_OG_FUNCTION_NAME: generateOg.fn.functionName,
      NOTIFY_POST_FUNCTION_NAME: notifyPost.fn.functionName,
    });
    const publishChatKnowledge = create('publishChatKnowledge');
    processRelease.role.addToPolicy(
      new PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        resources: [generateOg.fn.functionArn, notifyPost.fn.functionArn],
      }),
    );
    for (const target of [processRelease, publishChatKnowledge])
      target.fn.addPermission('ReleaseInvoker', {
        principal: new ArnPrincipal(RELEASE_INVOKER_ROLE),
        action: 'lambda:InvokeFunction',
      });

    this.functions = { processRelease, generateOg, notifyPost, publishChatKnowledge };
  }
}
