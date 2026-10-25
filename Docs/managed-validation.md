# First installation with simulated providers

[Español](managed-validation.es.md) · 2026-10-25.

## Verified state

The first private installation is deployed and passed a short check of all six contracts, IAM and the shared quota. [Result, provenance and limits](first-private-deploy.md). Delivery environments restrict access to branch main and all four flags are false.

main/dev and remote matched 6f993417a0a9785b7ee3dbf120a9493a99e23c22 at the start. Release v0.1.0 keeps its original assembly. The new asset changes the package and requires another revision and integrated CI artifact promoted to main. It is not the v0.1.0 assembly and does not move its tag.

## Runtime and packages

src/validation/handler.ts reuses createManagedHandler. Secrets Manager and DynamoDB retain their real clients. Only contact, subscriptions and AI counting/generation use simulated functions. Contact accepts an injected SendEmail; the normal handler keeps Resend. The doubles have no fallback to fetch, Resend or R2. They use the versioned editorial fallback without renewing its date.

The entrypoint requires function portfolio-api-cloud-test, us-east-1, table portfolio-api-cloud-test-control, a configured API and a secret under the test prefix in the expected account. Before every business request it checks the validated snapshot, including refreshes: RESEND_API_KEY and OPENAI_API_KEY exactly validation-only, email and HTTPS URL destinations under .invalid, and no R2 keys. The derivation key stays stable and private. The configuration workflow generates a random value and uses fictitious credentials only; its admission amount is synthetic and separate from the real budget.

The normal build excludes src/validation. tsconfig.validation.json compiles the separate variant; stageRuntimePackage writes validation.json at the package root. The handler requires version 1 and success, error, pending-body or ambiguous. The scenario belongs to reviewed bytes; headers, query and sessionId cannot change it. pending-body stalls body reading; ambiguous permits an AI reservation before simulating an unknown generation result, without releasing the reservation or replaying the effect.

CDK selects the variant through --context validationScenario=success using the same stack, function, table and IAM. It creates no additional installation. CI remains without AWS credentials and generates test-assembly with that success variant. Other scenarios require another reviewed synthesis/artifact; HTTP cannot activate them remotely. Without context, synth keeps the normal package. Initial preparation rejects a recovered normal handler.

Both packages run outside the checkout behind a network fence. The validation smoke imports its actual entrypoint and simulates SDK send only inside the test; deployed Lambda does not contain storage mocks. The suite covers six routes, invalid/refreshed configuration, errors, cancellation and ambiguous reservations. These results do not demonstrate managed SigV4, permissions or DynamoDB concurrency.

## GitHub Actions delivery circuit

All infrastructure and application deployments use manual dispatch from main. Workflows share portfolio-api-cloud-test-mutation, do not cancel active runs, and check account/role before mutation. Each environment must allow main only. Activation requires an explicit variable; workflows remain disabled while prerequisites are absent.

| Workflow              | Control and prepared operation                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| validation-secret.yml | TEST_SECRET_ENABLED, test-foundation-plan: creates portfolio-api-cloud/test/validation once, without retrieving values or replacing an existing key                           |
| foundation-test.yml   | TEST_FOUNDATION_ENABLED, test-foundation-plan: checks template SHA256, secret ARN and CREATE/UPDATE, then prepares foundation without execution                               |
| deploy-test.yml       | TEST_PLAN_ENABLED, test-plan: recovers CI by run/ID/SHA/digest, requires main promotion, verifies package/roles, publishes assets and prepares application without rebuilding |
| execute-test.yml      | TEST_EXECUTE_ENABLED, test-execute: accepts target kind, StackId, ChangeSetId and reviewed receipt digest; restricts the session and executes that change set once            |

Foundation sets AllowRegionalApiBootstrap=true and TestApiId=unassigned for first creation, matching the selected regional scope. This permission can affect other regional APIs; the reviewed template does not modify them. Record the generated ID and later consider narrowing it while keeping one installation. RuntimeSecretArn remains a reference, never a secret value in Git or artifacts.

After preparation, review_changeset.py obtains DescribeChangeSet, GetTemplate and DescribeStacks. It requires CREATE_COMPLETE/AVAILABLE, exact ARN/name/role, nonempty changes and no imports, hierarchies or notifications. It blocks table deletion or replacement, including conditional replacement. It compares the live template with reviewed sources and S3 ZIP files with the recovered asset. The receipt retains visible changes/parameters, canonical template hash, role, S3 version and byte SHA256. It reads neither secrets nor business logs.

Execution recalculates the live receipt and requires equality with the reviewed digest. Its session policy limits ExecuteChangeSet to the exact stack ARN and cloudformation:ChangeSetName; it grants neither preparation nor PassRole. The base identity only reads these stacks/assets and executes, separately from preparation. An idempotency token is used, CREATE_COMPLETE/UPDATE_COMPLETE is awaited and the result is retained. CloudFormation success still leaves six contracts and readiness to validate. [CloudFormation permissions](https://docs.aws.amazon.com/service-authorization/latest/reference/list_cloudformation.html), [execution and idempotency](https://docs.aws.amazon.com/cli/latest/reference/cloudformation/execute-change-set.html).

## Establishing trust

infra/delivery-access.template.json materializes three external roles and three boundaries equivalent to their identity policies:

| Role                                              | Trust and ceiling                                                                                                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PortfolioApiCloudTestFoundationPlanRole           | repository OIDC/environment test-foundation-plan; foundation stack preparation, PassRole only to its executor, CreateSecret only for validation configuration  |
| PortfolioApiCloudTestFoundationCloudFormationRole | CloudFormation service; dedicated bucket/SSM, four roles and five exact policies from test-foundation.template.json; CreateRole requires its matching boundary |
| PortfolioApiCloudTestGitHubExecuteRole            | repository OIDC/environment test-execute; read/execute the two expected stacks and read the bucket; each session narrows access to observed ARNs               |

Foundation cannot administer these starting identities. None uses AdministratorAccess, permanent credentials or generic administrative access. Runtime remains in the CDK application stack. The three access policies passed Access Analyzer without findings during initial review. The current foundation records two cfn-lint 1.57.2 W3037 findings for the tagging permission required by ApiGatewayV2, with no other findings. These validators do not replace managed execution.

Initial access was installed with a verified administrative SSO identity. Foundation and application preparation and execution used Actions with reviewed change sets. OIDC subjects use effective immutable repository/owner IDs and main-only environments. Administrative initialization does not replace the regular deployment path.

## First execution plan (historical)

1. Identify the existing Actions workflow/identity capable of provisioning the access template; review effective policies and the exact change set before execution. Provisioning cannot start without that trust origin.
2. Integrate the new revision with passing CI and promote it to main. Configure test-foundation-plan, test-plan and test-execute with main restrictions and viable reviewers. Retain SHA/digest/run/artifact separately from workflow SHA.
3. Create only the fictitious secret through validation-secret.yml. Retain its returned ARN and derivation key; a second execution fails instead of overwriting it. Future fictitious pricing refresh needs a reviewed change preserving that key.
4. Prepare foundation using its template digest, observed RuntimeSecretArn, CREATE, AllowRegionalApiBootstrap=true and TestApiId=unassigned. Expected changes: versioned/encrypted/TLS bucket, SSM version 6, four roles and five boundaries. Review the receipt and execute separately.
5. Prepare application from the new success CI artifact and expected role variables. Expected changes: one ARM64 Node24 Lambda, 512 MiB/28 seconds/no reservation in the simulated variant, IAM HTTP API/stage, retained control table, 14-day logs, runtime role/policy and three alarms without actions. The secret and table are not application data.
6. Review the receipt and exact ARNs, then execute with the separate identity. Verify gateway/IAM, six simulated contracts, shared quotas/reservations, privacy and recovery using the test-operations matrix. Health only proves liveness.

The initial path completed with the artifact and change set recorded in the first private deployment result. Plan references describe the earlier design; the exhaustive failure/load/recovery matrix remains before production.
