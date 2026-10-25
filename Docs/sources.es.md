# Fuentes oficiales y evidencia

[English](sources.md)

Consulta: **24/10/2026**. Documentación primaria de proveedores. Revalidar precios y disponibilidad antes de implementar/desplegar. Ninguna fuente prueba elegibilidad gratuita de la cuenta ni latencia medida de esta API.

- [CDK overview / introducción](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
- [CDK bootstrap](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-env.html)
- [CDK boundaries](https://docs.aws.amazon.com/cdk/v2/guide/customize-permissions-boundaries.html)
- [CDK deploy methods / métodos](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-deploy.html)
- [CDK diff methods / métodos](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-diff.html)
- [CDK license Apache-2.0 / licencia](https://github.com/aws/aws-cdk/blob/main/LICENSE)
- [SAM overview / introducción](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html)
- [SAM license Apache-2.0 / licencia](https://github.com/aws/serverless-application-model/blob/develop/LICENSE)
- [Serverless v4 upgrade/auth/license / cambios](https://www.serverless.com/framework/docs/guides/upgrading-v4)
- [Serverless pricing / precios](https://www.serverless.com/pricing)
- [Serverless terms / términos](https://www.serverless.com/legal/terms)
- [SST current engine / motor actual](https://sst.dev/docs/)
- [SST state / estado](https://sst.dev/docs/state/)
- [SST Console pricing / precios](https://sst.dev/docs/console/)
- [SST MIT license / licencia](https://github.com/anomalyco/sst/blob/dev/LICENSE)
- [Nest serverless/startup examples / arranque](https://docs.nestjs.com/faq/serverless)
- [HTTP API quotas / límites](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html)
- [HTTP versus REST API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html)
- [REST response streaming / streaming de respuesta](https://docs.aws.amazon.com/apigateway/latest/developerguide/response-transfer-mode.html)
- [Lambda quotas / límites](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html)
- [Lambda native Web Functions](https://docs.aws.amazon.com/lambda/latest/dg/web-functions.html)
- [Web Functions runtimes](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-runtimes.html)
- [CloudFormation WebFunction](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-lambda-webfunction.html)
- [Function URL versus Gateway](https://docs.aws.amazon.com/lambda/latest/dg/furls-http-invoke-decision.html)
- [Public endpoints / endpoints públicos](https://docs.aws.amazon.com/lambda/latest/dg/security-public-endpoints.html)
- [Lambda pricing / precios](https://aws.amazon.com/lambda/pricing/)
- [API Gateway pricing / precios](https://aws.amazon.com/api-gateway/pricing/)
- [CloudWatch pricing / precios](https://aws.amazon.com/cloudwatch/pricing/)
- [Secrets Manager pricing / precios](https://aws.amazon.com/secrets-manager/pricing/)
- [DynamoDB on-demand pricing / precios](https://aws.amazon.com/dynamodb/pricing/)
- [EC2 T3 list prices / precios de lista](https://aws.amazon.com/ec2/instance-types/t3/)
- [VPC IPv4/NAT pricing / precios](https://aws.amazon.com/vpc/pricing/)
- [EBS pricing / precios](https://aws.amazon.com/ebs/pricing/)
- [App Runner pricing / precios](https://aws.amazon.com/apprunner/pricing/)
- [App Runner overview / introducción](https://docs.aws.amazon.com/apprunner/latest/dg/what-is-apprunner.html)
- [Fargate pricing / precios](https://aws.amazon.com/fargate/pricing/)
- [Default chat model pricing / precio del modelo default](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
- [GitHub rulesets and bypass / reglas](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
- [GitHub rules API, nonexistent branch / rama inexistente](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch)

La auditoría enlaza los repositorios y commits inspeccionados. La evidencia de infraestructura corresponde al resumen y almacenamiento EC2 y a los recursos del stack CloudFormation, consultados el 24/10/2026. Las reglas GitHub se verificaron por ID y por nombre de rama.

- [OpenAI Responses state / retención](https://developers.openai.com/api/docs/guides/conversation-state)
- [Dedicated App token action / permisos](https://github.com/actions/create-github-app-token/blob/v2/action.yml)

- [CDK CLI role versus CloudFormation execution role](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd.html)
- [DefaultStackSynthesizer execution/deploy roles](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.DefaultStackSynthesizer.html)

## Evidencia propia del experimento

[Procedencia, hashes y muestras](runtime-evidence.es.md) y [método/resultados](local-runtime.es.md), obtenidos el 24/10/2026 en WSL. El adaptador de comparación fue [serverless-express](https://github.com/CodeGenieApp/serverless-express). Son evidencia local, separada de fuentes de precios y documentación AWS. El código experimental se descarta; no se publica como estructura inicial de la API.

## Fuentes de la base local

- [Eventos y respuesta HTTP API v2](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html)
- [TypeScript strict](https://www.typescriptlang.org/tsconfig/strict.html)
- [Runner de tests Node 22](https://nodejs.org/docs/latest-v22.x/api/test.html)
- [Registro npm: TypeScript 6.0.3](https://registry.npmjs.org/typescript/6.0.3)
- [Procedencia, dependencias y cobertura actual](application.es.md)

El formato de eventos y strict se contrastaron con documentación primaria. Versiones, engines y licencias se consultaron en metadata npm; la compatibilidad se comprobó ejecutando Node 22.23.4 y 24.19.0. La selección del compilador JS 6 evita dependencias binarias por plataforma que reporta TypeScript 7.0.2.

## Actualización de Node e integración

- [LTS vigente: Node 24.22.1](https://nodejs.org/en/blog/release/v24.22.1)
- [LTS frente a Current](https://nodejs.org/en/about/previous-releases)
- [Identidad humana, credenciales y rulesets](integration.es.md)

Al 24/10/2026 se verificó Node 24.22.1 como última LTS y Node 26 como Current; se ejecutó la nueva suite en 24.22.1. Los resultados históricos del experimento no se modifican.

## Fuentes del incremento de contacto

- [Contrato, hashes, adaptaciones y pruebas](contact.es.md)
- [Índice oficial Node: LTS frente a Current](https://nodejs.org/dist/index.json)
- [Resend: envío REST de email](https://resend.com/docs/api-reference/emails/send-email)
- [body-parser 2.4.0: metadata npm](https://registry.npmjs.org/body-parser/2.4.0)
- [class-validator 0.15.1: metadata npm](https://registry.npmjs.org/class-validator/0.15.1)
- [class-transformer 0.5.1: metadata npm](https://registry.npmjs.org/class-transformer/0.5.1)

Metadata de versiones/licencias/engines consultada al implementar. La evidencia contractual nueva usa blobs y versiones fijados; sus casos finitos no reemplazan validación administrada ni implican paridad de toda la API.

## Dependencias directas y cuota — 24/10/2026

- [rate-limiter-flexible: API y mantenimiento](https://github.com/animir/node-rate-limiter-flexible)
- [Opciones de duración y bloqueo](https://github.com/animir/node-rate-limiter-flexible/wiki/Options)
- [Metadata npm 11.2.3](https://registry.npmjs.org/rate-limiter-flexible/11.2.3)
- [Descargas npm: 24/9–23/10/2026](https://api.npmjs.org/downloads/point/2026-09-24:2026-10-23/rate-limiter-flexible)
- [SDK oficial Resend para Node](https://resend.com/docs/send-with-nodejs)
- [Resend 6.34.1: metadata](https://registry.npmjs.org/resend/6.34.1)
- [Validación directa](https://github.com/typestack/class-validator)
- [Transformación directa](https://github.com/typestack/class-transformer)
- [Tipos y errores de body-parser](https://github.com/expressjs/body-parser)

La selección conserva snapshots fechados de publicación/actividad/adopción; las descargas no son usuarios únicos. La validación usa directamente las dependencias. El cambio de cuota y tres diferencias respecto de ValidationPipe están registrados en [contacto](contact.es.md).

## Vitest y stack CDK local — 24/10/2026

Versiones verificadas en npm e instaladas en el lock: Vitest 5.0.5, aws-cdk 2.1146.1, aws-cdk-lib 2.274.0 y constructs 10.8.1. Solo desarrollo; la licencia de cada paquete permanece en su distribución.

- [Vitest configuration](https://vitest.dev/config/).
- [Vitest projects](https://vitest.dev/config/projects).
- [Vitest mock utilities](https://vitest.dev/api/vi.html).
- [CDK synth](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-synth.html).
- [DefaultStackSynthesizer](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.DefaultStackSynthesizer.html).
- [CDK assertions](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.assertions-readme.html).
- [CDK bootstrap](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html).

## Suscripciones — 25/10/2026

[Blobs fijados, hashes, versiones de referencia y resultados](subscriptions.es.md). La integración usa fetch y AbortSignal.timeout disponibles en Node 24, sin dependencia nueva. La última LTS se revalidó en el [registro oficial](https://nodejs.org/en/blog/release): 24.22.1; Node 26 continúa Current.

## Chat — 2026-10-25

[Contratos, hashes y pruebas](chat.es.md)

- [OpenAI Docs: Responses/text](https://developers.openai.com/api/docs/guides/text)
- [Node 24.22.1 LTS](https://nodejs.org/en/blog/release)
- [S3 SDK 3.1156.0](https://registry.npmjs.org/@aws-sdk/client-s3/3.1156.0)
- [reflect-metadata 0.2.2](https://registry.npmjs.org/reflect-metadata/0.2.2)
