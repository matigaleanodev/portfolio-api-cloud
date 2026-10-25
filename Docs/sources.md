# Official sources and evidence

[Español](sources.es.md)

Consulted on **2026-10-24**. Primary vendor documentation only. Dynamic pricing/availability must be rechecked before implementation or deployment. No source establishes this account's free-tier eligibility or measured latency.

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

The audit links the repositories and exact inspected commits. Infrastructure evidence covers the EC2 summary/storage and CloudFormation stack resources inspected on 2026-10-24. GitHub rules were verified by ID and applicable branch name.

- [OpenAI Responses state / retención](https://developers.openai.com/api/docs/guides/conversation-state)
- [Dedicated App token action / permisos](https://github.com/actions/create-github-app-token/blob/v2/action.yml)

- [CDK CLI role versus CloudFormation execution role](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd.html)
- [DefaultStackSynthesizer execution/deploy roles](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.DefaultStackSynthesizer.html)

## Experiment evidence

[Provenance, hashes and samples](runtime-evidence.md) and [method/results](local-runtime.md), collected on 2026-10-24 in WSL. The comparison adapter was [serverless-express](https://github.com/CodeGenieApp/serverless-express). This is local evidence, separate from pricing sources and AWS documentation. Experimental code is discarded rather than published as the initial API structure.

## Local foundation sources

- [HTTP API v2 events and responses](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html)
- [TypeScript strict](https://www.typescriptlang.org/tsconfig/strict.html)
- [Node 22 test runner](https://nodejs.org/docs/latest-v22.x/api/test.html)
- [npm registry: TypeScript 6.0.3](https://registry.npmjs.org/typescript/6.0.3)
- [Current provenance, dependencies and coverage](application.md)

Event format and strict were checked against primary documentation. Versions, engines and licenses were queried through npm metadata; compatibility was verified by running Node 22.23.4 and 24.19.0. Selecting JS compiler 6 avoids the platform binary dependencies reported by TypeScript 7.0.2.

## Node and integration update

- [Current LTS: Node 24.22.1](https://nodejs.org/en/blog/release/v24.22.1)
- [LTS versus Current](https://nodejs.org/en/about/previous-releases)
- [Human identity, credentials and rulesets](integration.md)

As of 2026-10-24, Node 24.22.1 was verified as latest LTS and Node 26 as Current; the updated suite ran on 24.22.1. Historical experiment results remain unchanged.

## Contact increment sources

- [Contract, hashes, adaptations and tests](contact.md)
- [Official Node index: LTS versus Current](https://nodejs.org/dist/index.json)
- [Resend: REST email sending](https://resend.com/docs/api-reference/emails/send-email)
- [body-parser 2.4.0: npm metadata](https://registry.npmjs.org/body-parser/2.4.0)
- [class-validator 0.15.1: npm metadata](https://registry.npmjs.org/class-validator/0.15.1)
- [class-transformer 0.5.1: npm metadata](https://registry.npmjs.org/class-transformer/0.5.1)

Version/license/engine metadata was checked during implementation. New contract evidence uses pinned blobs/versions; these finite cases do not replace managed validation or imply complete API parity.

## Direct dependencies and quota — 2026-10-24

- [rate-limiter-flexible: API and maintenance](https://github.com/animir/node-rate-limiter-flexible)
- [Duration and blocking options](https://github.com/animir/node-rate-limiter-flexible/wiki/Options)
- [npm metadata 11.2.3](https://registry.npmjs.org/rate-limiter-flexible/11.2.3)
- [npm downloads: 2026-09-24–2026-10-23](https://api.npmjs.org/downloads/point/2026-09-24:2026-10-23/rate-limiter-flexible)
- [Official Resend Node SDK](https://resend.com/docs/send-with-nodejs)
- [Resend 6.34.1 metadata](https://registry.npmjs.org/resend/6.34.1)
- [Direct validation](https://github.com/typestack/class-validator)
- [Direct transformation](https://github.com/typestack/class-transformer)
- [body-parser error types](https://github.com/expressjs/body-parser)

Selection retains dated publication/activity/adoption snapshots; downloads are not unique users. Validation calls dependencies directly. The quota change and three ValidationPipe differences are recorded under [contact](contact.md).

## Vitest and local CDK stack — 2026-10-24

Versions verified in npm and installed in the lock: Vitest 5.0.5, aws-cdk 2.1146.1, aws-cdk-lib 2.274.0 and constructs 10.8.1. Development-only; each package retains its license in distribution.

- [Vitest configuration](https://vitest.dev/config/).
- [Vitest projects](https://vitest.dev/config/projects).
- [Vitest mock utilities](https://vitest.dev/api/vi.html).
- [CDK synth](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-synth.html).
- [DefaultStackSynthesizer](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.DefaultStackSynthesizer.html).
- [CDK assertions](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.assertions-readme.html).
- [CDK bootstrap](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html).
