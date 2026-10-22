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
