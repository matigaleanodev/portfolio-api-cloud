# Test stack in code

[Español](infrastructure.es.md) · 2026-10-24.

**Current increment:** [first installation with doubles and Actions delivery](managed-validation.md), implemented locally. main/v0.1.0 exist; provisioning, execution and managed validation remain pending.

**Current phase 4 status:** [runtime controls](runtime-hardening.md), locally implemented and tested: shared quotas, GLOBAL AI budget, session/origin limits, cancellation, versioned fallback, configuration and observability. Initial migration references retain their historical evidence; they do not establish AWS validation.

AWS CDK v2 is selected for this repository. Pinned local development dependencies: CLI **2.1146.1**, aws-cdk-lib **2.274.0**, constructs **10.8.1**. No global install. [Stack](../infra/stack.ts), [entry](../infra/app.ts), [tests](../test/infra/stack.test.ts).

`PortfolioApiCloudTest` synthesizes physical stack `portfolio-api-cloud-test` in personal account `650387442642`, `us-east-1`. Context stages other than test are rejected.

The stack defines one Node.js 24 ARM64 Event Function outside a VPC, 512 MiB, 28 seconds, reserved concurrency 5 and handler `dist/handler.handler`; HTTP API AWS_PROXY payload 2.0 with 29-second integration timeout and `$default` stage; global throttle 2/s and burst 5. `$default` requires IAM/SigV4 and delegates routing to the handler to preserve case handling and contract errors. Only `OPTIONS /{proxy+}` permits anonymous preflight. CORS remains in application code. No parallel Function URL.

Runtime logs retain for 14 days and survive stack deletion/replacement. The runtime role scopes log writes, control operations on its table and reads of the exact secret ARN; an external permissions boundary remains mandatory. NODE_ENV is production to avoid Resend error-detail logging. Nonsecret CorsOrigin defaults empty.

This IAM-isolated test endpoint is not the public frontend contract: even health requires a signed request. Distributed quota/deadline remain prerequisites for public business exposure. Gateway throttles and concurrency are not per-IP quotas or spending caps.

No application DB, NAT, VPC, domain or frontend is added. One DynamoDB on-demand control table has TTL/deletion protection; runtime reads an external secret by ARN and defines three alarms without actions. The handler validates startup and returns business 503 for missing configuration; health remains liveness. The asset includes a real curated versioned fallback. [Controls and prerequisites](runtime-hardening.md).

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

RuntimeSecretArn is mandatory without a default, restricted to portfolio-api-cloud/test/ in the fixed account/region. Runtime policy adds only GetItem/PutItem/UpdateItem on its table and GetSecretValue on that ARN. Neither the boundary nor the secret is created by the stack; effective permissions require review before preparing a change set.

## Phase 5 local completion

Table named portfolio-api-cloud-test-control and alarms portfolio-api-cloud-test-errors/throttles/duration scope the IAM design. The 18 assertions cover resources, exact runtime trust, allowed actions, invocation scope and absent additional resources. [External roles/bootstrap and preservation design](deployment-design.md). No external roles are provisioned or effective permissions established.

## Test preparation

[Audit, reviewable external foundation and phases 6–10 runbook](test-operations.md). Roles/bootstrap/secret provisioning, deployment, managed validation and recovery remain unexecuted.

One AWS installation retains existing test names and starts validation with simulated providers; no parallel production stack or local AWS deployment emulation is added. Regional API Gateway scope is chosen for the personal account, with effects on existing APIs explicit in [operations](test-operations.md). main and v0.1.0 do not automatically deploy.
