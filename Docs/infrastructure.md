# Test stack in code

[Español](infrastructure.es.md) · 2026-10-24.

AWS CDK v2 is selected for this repository. Pinned local development dependencies: CLI **2.1146.1**, aws-cdk-lib **2.274.0**, constructs **10.8.1**. No global install. [Stack](../infra/stack.ts), [entry](../infra/app.ts), [tests](../test/infra/stack.test.ts).

`PortfolioApiCloudTest` synthesizes physical stack `portfolio-api-cloud-test` in personal account `650387442642`, `us-east-1`. Context stages other than test are rejected.

The stack defines one Node.js 24 ARM64 Event Function outside a VPC, 512 MiB, 28 seconds, reserved concurrency 5 and handler `dist/handler.handler`; HTTP API AWS_PROXY payload 2.0 with 29-second integration timeout and `$default` stage; global throttle 2/s and burst 5. `$default` requires IAM/SigV4 and delegates routing to the handler to preserve case handling and contract errors. Only `OPTIONS /{proxy+}` permits anonymous preflight. CORS remains in application code. No parallel Function URL.

Runtime logs retain for 14 days and survive stack deletion/replacement. The runtime role can only create streams/write events in that log group and requires an external permissions boundary. NODE_ENV is production to avoid Resend error-detail logging. Nonsecret CorsOrigin defaults empty.

This IAM-isolated test endpoint is not the public frontend contract: even health requires a signed request. Distributed quota/deadline remain prerequisites for public business exposure. Gateway throttles and concurrency are not per-IP quotas or spending caps.

No DB, NAT, VPC, domain, frontend, alarms or new providers are introduced. Health works; contact has no AWS secret configuration and returns controlled 500 when sending without it. Secure secret retrieval and permissions remain pending. No keys enter parameters/context/templates/outputs. Starters returns 200; chat retains profile/FAQ without providers and editorial 503 without knowledge. The stack configures no R2/OpenAI and carries no editorial fallback. [Local contract](chat.md). Subscriptions without PORTFOLIO_CLOUD_API_URL yields controlled 500 on invocation; that configuration is not added to the stack. [Local contract](subscriptions.md).

```bash
npm ci --ignore-scripts
npm run test:infra
npm run cdk -- synth --no-lookups --context stage=test
```

Preparation compiles and stages `.tmp/lambda` with dist, package.json, LICENSE and locked production dependencies, sharing the exact packaging function used by `test:package`. Sources/tests/.env/private files/CDK/Vitest are excluded; dependency licenses are preserved. CDK stages a ZIP asset and writes the local template/manifest/asset to cdk.out. Synth neither uploads S3 assets nor creates a change set.

Application typechecking keeps exactOptionalPropertyTypes. Infrastructure/tests use a separate tsconfig disabling only that option because these CDK declarations are incompatible with it. Both retain strict/noUncheckedIndexedAccess and declaration checking without skipLibCheck.

## AWS prerequisites

Synthesizer qualifier: papiatest; expected bucket: `cdk-papiatest-assets-650387442642-us-east-1`; bootstrap version parameter: `/cdk-bootstrap/papiatest/version`. References do not verify or create these resources.

Roles: PortfolioApiCloudTestGitHubDeployRole (OIDC), PortfolioApiCloudTestCdkDeployRole (deploy), PortfolioApiCloudTestCloudFormationExecutionRole (CloudFormation), PortfolioApiCloudTestFilePublishingRole (file assets), PortfolioApiCloudTestRuntimeRole (Lambda, defined by this stack). Deployment and CloudFormation roles are separate in the assembly.

Required RuntimePermissionsBoundaryArn has no default and accepts only `arn:aws:iam::650387442642:policy/PortfolioApiCloudTestRuntimeBoundary`. Review policy content, trust, PassRole and constrained bootstrap before execution; do not bootstrap with default AdministratorAccess. No Docker asset publishing role is needed.

The preparation workflow remains manually gated. Its command supplies the expected boundary ARN; the actual policy, reviewed bootstrap and configured roles are required before activation; it was not executed. [CI/CD](ci-cd.md). Eleven assertions and synth do not verify effective permissions, drift or deployed behavior.
