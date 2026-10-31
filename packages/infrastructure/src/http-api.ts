import { CfnCondition, CfnOutput, Duration, Fn, Stack, Token } from 'aws-cdk-lib';
import {
  type CfnApi,
  CfnApiMapping,
  CfnDomainName,
  type CfnRoute,
  type CfnStage,
  HttpApi,
  HttpMethod,
  HttpNoneAuthorizer,
  HttpStage,
} from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpIamAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { Function } from 'aws-cdk-lib/aws-lambda';
import { routes } from '@portfolio-api-cloud/contracts/routes';

export const API_NAME = 'portfolio-api-cloud-test';
export const CUSTOM_DOMAIN = 'api.matiasgaleano.dev';

export interface HttpApiProps {
  readonly handler: Function;
  readonly chat: Function;
  readonly publicCondition: CfnCondition;
  readonly hasDomain: CfnCondition;
  readonly closeDefaultEndpoint: CfnCondition;
  readonly certificateArn: string;
}

/** API HTTP con IDs lógicos retenidos; rutas canónicas de chat explícitas y el resto en $default. */
export function httpApi(stack: Stack, props: HttpApiProps) {
  const authorization = Fn.conditionIf(props.publicCondition.logicalId, 'NONE', 'AWS_IAM');
  const integration = new HttpLambdaIntegration('HandlerIntegration', props.handler, {
    timeout: Duration.seconds(29),
  });
  // El handler resuelve mayúsculas, slash final y errores de ruta; IAM aísla hasta exponer.
  const api = new HttpApi(stack, 'Api', {
    apiName: API_NAME,
    createDefaultStage: false,
    defaultIntegration: integration,
    defaultAuthorizer: new HttpIamAuthorizer(),
  });
  (api.node.findChild('DefaultRoute').node.defaultChild as CfnRoute).addPropertyOverride(
    'AuthorizationType',
    authorization,
  );

  const chatIntegration = new HttpLambdaIntegration('ChatIntegration', props.chat, {
    timeout: Duration.seconds(29),
  });
  // HTTP API selecciona por ruta y método exactos: HEAD necesita su propia ruta.
  for (const route of [routes.chat, routes.chatStarters])
    for (const method of route.methods)
      for (const created of api.addRoutes({
        path: route.path,
        methods: [method as HttpMethod],
        integration: chatIntegration,
      }))
        (created.node.defaultChild as CfnRoute).addPropertyOverride(
          'AuthorizationType',
          authorization,
        );

  api.addRoutes({
    path: '/{proxy+}',
    methods: [HttpMethod.OPTIONS],
    integration,
    authorizer: new HttpNoneAuthorizer(),
  });

  for (const fn of [props.handler, props.chat]) {
    fn.addEnvironment('TRUSTED_API_ID', api.apiId);
    fn.addEnvironment(
      'TRUSTED_CUSTOM_DOMAIN',
      Token.asString(Fn.conditionIf(props.hasDomain.logicalId, CUSTOM_DOMAIN, '')),
    );
  }
  (api.node.defaultChild as CfnApi).disableExecuteApiEndpoint = Fn.conditionIf(
    props.closeDefaultEndpoint.logicalId,
    true,
    false,
  ) as unknown as boolean;

  const domain = new CfnDomainName(stack, 'CustomDomain', {
    domainName: CUSTOM_DOMAIN,
    tags: { Project: 'portfolio-api-cloud' },
    domainNameConfigurations: [
      {
        certificateArn: props.certificateArn,
        endpointType: 'REGIONAL',
        securityPolicy: 'TLS_1_2',
      },
    ],
  });
  domain.cfnOptions.condition = props.hasDomain;
  const mapping = new CfnApiMapping(stack, 'CustomDomainMapping', {
    apiId: api.apiId,
    domainName: domain.ref,
    stage: '$default',
  });
  mapping.cfnOptions.condition = props.hasDomain;

  // Límite del stage; revisar junto con la cuota de concurrencia de la cuenta.
  const stage = new HttpStage(stack, 'DefaultStage', {
    httpApi: api,
    stageName: '$default',
    autoDeploy: true,
    throttle: { rateLimit: 2, burstLimit: 5 },
  });
  const cfnStage = stage.node.defaultChild as CfnStage;

  mapping.addDependency(cfnStage);
  new CfnOutput(stack, 'RegionalDomainTarget', {
    value: domain.attrRegionalDomainName,
    condition: props.hasDomain,
  });
  new CfnOutput(stack, 'ApiEndpoint', { value: api.apiEndpoint });
  return { api };
}
