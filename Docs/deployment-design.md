# Test delivery and recovery design

> Initial design and validation record. Current production delivery, names and historical recovery are documented in [Integration and delivery](ci-cd.md).

[Español](deployment-design.es.md) · 2026-10-25.

**Current increment:** [first installation with doubles and Actions delivery](managed-validation.md), deployed and verified on AWS with simulated providers. [First private deployment result](first-private-deploy.md). Design and audit sections retain their earlier context.

## Audit and scope

TypeScript CDK and the grouped stack already existed. I kept the IAM-protected HTTP API v2, one Lambda outside a VPC, the control table, external secrets and runtime limits. I completed scoped table/alarm names, identity and invocation assertions, and assembly preservation. I added no provisioning stack or second API.

Phase 5 is covered as reviewable local design and implementation. Phase 6 keeps the existing protected human merge and adds plan tests and CI retention. AWS preparation, deployment and managed validation remain separate. The permissions below are the design contract for phase 7, not installed policies or verified effective access.

## Environment configuration and separation

Only `test` exists: account `650387442642`, region `us-east-1`, stack `portfolio-api-cloud-test`, qualifier `papiatest`. The constructor rejects missing or different stages. There are no production defaults or automatic branch-based selection.

`CorsOrigin` is public configuration, empty by default. `RuntimeSecretArn` is a mandatory external reference restricted to `portfolio-api-cloud/test/`; its JSON value stays in Secrets Manager. `RuntimePermissionsBoundaryArn` requires the exact expected policy, without a default. Table `portfolio-api-cloud-test-control`, function/log group and three alarms have test-specific names. The API ID comes from a CloudFormation reference.

Test contact destinations, subscriptions, R2 and provider credentials must be isolated. The table remains shared across runtime revisions: recovering code does not reset quotas or reservations. Keep the derivation secret stable throughout active windows.

## Trust and delegation

All following roles belong to the personal account. Their names are prefixed with `PortfolioApiCloudTest`.

| Role                        | Trusted principal                       | Delegation and scope                                                          |
| --------------------------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| GitHubDeployRole            | GitHub OIDC provider with exact aud/sub | only sts:AssumeRole into CdkDeployRole and FilePublishingRole                 |
| CdkDeployRole               | exact GitHubDeployRole ARN              | prepare/read test stack change sets and PassRole to the exact executor        |
| FilePublishingRole          | exact GitHubDeployRole ARN              | publish/read dedicated bucket assets; no CloudFormation or PassRole           |
| CloudFormationExecutionRole | cloudformation.amazonaws.com service    | manage this stack's resources; PassRole only to runtime                       |
| RuntimeRole                 | lambda.amazonaws.com service            | own logs, control operations and exact secret read; no AssumeRole or PassRole |

Expected OIDC trust for GitHubDeployRole:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::650387442642:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:matigaleanodev@99203645/portfolio-api-cloud@1432631186:environment:test-plan"
        }
      }
    }
  ]
}
```

With an environment, sub does not itself establish the branch. The environment must allow main only; the workflow additionally requires the exact repository, main, manual dispatch and TEST_PLAN_ENABLED=true. main now exists; effective environments and roles leave activation pending; dev is not enabled as a shortcut. Do not trust the whole account or use wildcards in Principal/sub. CI receives no OIDC. [OIDC and environments](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws).

CdkDeployRole PassRole requires Resource `arn:aws:iam::650387442642:role/PortfolioApiCloudTestCloudFormationExecutionRole` and StringEquals `iam:PassedToService=cloudformation.amazonaws.com`. The executor may only pass `arn:aws:iam::650387442642:role/PortfolioApiCloudTestRuntimeRole` with `iam:PassedToService=lambda.amazonaws.com`. GitHub and the publisher receive no PassRole. [IAM delegation](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_passrole.html).

## Responsibility-specific policies and boundaries

Phase 7 administrative implementation must translate this matrix into policies and check every action/condition against the exact template and AWS authorization reference. Do not expand to AdministratorAccess to resolve a denial.

| Identity                 | Planned Allow                                                                                                                                                                                                                                                      | Resource/condition                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub                   | sts:AssumeRole                                                                                                                                                                                                                                                     | the two exact roles above; no direct application resource actions                                                                                                    |
| Deploy                   | cloudformation:CreateChangeSet, DescribeChangeSet, DeleteChangeSet, DescribeStacks, DescribeStackEvents, GetTemplate, GetTemplateSummary                                                                                                                           | stack arn:aws:cloudformation:us-east-1:650387442642:stack/portfolio-api-cloud-test/_; creation conditions exact RoleArn and ChangeSetName portfolio-api-cloud-test-_ |
| Deploy                   | ssm:GetParameter                                                                                                                                                                                                                                                   | arn:aws:ssm:us-east-1:650387442642:parameter/cdk-bootstrap/papiatest/version                                                                                         |
| Deploy                   | s3:GetObject, GetBucketLocation and ListBucket                                                                                                                                                                                                                     | dedicated bucket and objects only; no deletion                                                                                                                       |
| Publisher                | s3:GetBucketLocation, ListBucket; GetObject, PutObject                                                                                                                                                                                                             | dedicated bucket for bucket actions; objects for object actions; no DeleteObject                                                                                     |
| Executor                 | lambda:CreateFunction, GetFunction, GetFunctionConfiguration, UpdateFunctionCode, UpdateFunctionConfiguration, DeleteFunction, AddPermission, RemovePermission, GetPolicy, PutFunctionConcurrency, DeleteFunctionConcurrency, TagResource, UntagResource, ListTags | portfolio-api-cloud-test function in the expected account/region                                                                                                     |
| Executor                 | dynamodb:CreateTable, DescribeTable, UpdateTable, DeleteTable, DescribeTimeToLive, UpdateTimeToLive, TagResource, UntagResource, ListTagsOfResource                                                                                                                | portfolio-api-cloud-test-control table; deletion remains protected and retained                                                                                      |
| Executor                 | logs:CreateLogGroup, DescribeLogGroups, PutRetentionPolicy, DeleteRetentionPolicy, TagResource, UntagResource, ListTagsForResource                                                                                                                                 | /aws/lambda/portfolio-api-cloud-test group; separate DescribeLogGroups if Resource * is required                                                                     |
| Executor                 | cloudwatch:PutMetricAlarm, DeleteAlarms, DescribeAlarms                                                                                                                                                                                                            | alarm:portfolio-api-cloud-test-*; separate reads without ARN support                                                                                                 |
| Executor                 | apigateway:GET, POST, PATCH, PUT, DELETE                                                                                                                                                                                                                           | us-east-1, /apis and /apis/* by action; generated ID, review tag/condition support before provisioning                                                               |
| Executor                 | iam:GetRole, CreateRole, DeleteRole, PutRolePolicy, GetRolePolicy, DeleteRolePolicy, TagRole, UntagRole                                                                                                                                                            | RuntimeRole only; CreateRole requires the exact runtime iam:PermissionsBoundary                                                                                      |
| Runtime and its boundary | logs:CreateLogStream, PutLogEvents; dynamodb:GetItem, PutItem, UpdateItem; secretsmanager:GetSecretValue                                                                                                                                                           | own streams, exact table, exact configured secret                                                                                                                    |

The executor also needs s3:GetObject on bucket assets to install code. It cannot read secrets or DynamoDB data, create access keys, or modify pipeline/bootstrap roles or boundary policies. If an update needs PutRolePermissionsBoundary, permit only the same boundary; do not allow DeleteRolePermissionsBoundary, AttachRolePolicy or mutation of that policy. The current stack does not need to update RuntimeRole trust after creation.

GitHub/deploy/publisher require external administrative boundaries limiting respectively AssumeRole, preparation and S3 to this matrix. The executor needs its own boundary, distinct from runtime, limiting the services/resources above and requiring a boundary on role creation. Review identity policies together with boundaries: a boundary limits permissions and does not grant them. Preserve existing organizational/SSO denials and analyze resource policies; this design does not bypass Architect restrictions. [CDK boundaries](https://docs.aws.amazon.com/cdk/v2/guide/customize-permissions-boundaries.html).

Preparation grants no ExecuteChangeSet, CreateStack, UpdateStack, DeleteStack or RollbackStack. Future execution needs a separate explicit review of the exact change set ARN and identity. Resource * exceptions only belong to actions without ARN support and must be separated/documented. API Gateway generates previously unknown IDs: the regional /apis/* prefix does not guarantee per-API isolation; supported conditions and the environment must be reviewed before activating the executor. [CloudFormation permissions](https://docs.aws.amazon.com/service-authorization/latest/reference/list_cloudformation.html).

## Minimum bootstrap design

Dedicated bucket `cdk-papiatest-assets-650387442642-us-east-1`, all four public access blocks, BucketOwnerEnforced ownership, SSE-S3 encryption, TLS requirement and versioning. Retain bucket/objects; do not add a CMK, ECR, Docker publisher, lookup role or cross-account trust for this ZIP. Outputs BucketName, BucketDomainName and BootstrapVersion. Version parameter `/cdk-bootstrap/papiatest/version` with a version compatible with the pinned assembly. Provision the roles/policies/boundaries above outside the application stack and review them before use.

Do not use the standard template with AdministratorAccess or interpret a dedicated qualifier as permission isolation. Prepare and execute foundation only through separate manual GitHub Actions workflows after establishing the initial trust identity. The final administrative definition must check compatibility with the pinned CLI and its auxiliary reads; local tests do not establish effective compatibility. [Customization](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-customizing.html), [security](https://docs.aws.amazon.com/cdk/v2/guide/best-practices-security.html).

## Verifiable preservation and recovery

CI retains the assembly after tests and synth; the plan retains its own before authentication. SHA/run/attempt-based name and 30-day GitHub retention, without overwriting. The bundle contains the cdk.out files referenced by the manifest (templates and assets, excluding unrelated historical copies), the lock, revision/Node and SHA-256 checksums for every file. Creation rejects existing destinations, incomplete revisions, a different Node version, another environment, symlinks and known private names; verify rejects changed, missing or extra files and mismatched revisions.

Hashes detect accidental changes and do not authenticate a bundle whose inventory was also replaced. Recover from the reviewed run/repository/commit, verify the artifact digest and compare its revision with GitHub. Contents are public and contain no Secrets Manager values or credentials. Review a fresh assembly before publishing it; a name filter does not demonstrate absence of every possible arbitrary secret.

To rehearse local recovery, download the corresponding artifact into a new directory and run:

```bash
python3 scripts/review_bundle.py verify /path/to/bundle REVIEWED_FULL_SHA
```

Use the retained assembly for future preparation without rebuilding or synthesizing another revision. Revalidate account, region, external parameters, identity and change set before execution. Successful verify does not trigger execution. Runtime recovery needs the same shared control and a compatible secret; do not restore old counters.

Designed bucket retention: at least 90 days for current assets and previous versions, with cleanup only after identifying active references and a recovery revision. Do not blindly expire active assets. GitHub's 30 days are not a historical archive: before expiration, preserve the active and previous revision bundles through a controlled process. Test logs remain 14 days; the table is retained with logical/physical TTL. External data retention and restoration remain with their owner. [GitHub artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data).

## Criteria for subsequent phases

| Phase | Preparation included                                        | Evidence still required                                                                                                                                           |
| ----- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7     | IAM matrix, trust, boundaries, bootstrap/test configuration | personal identity, effective inventory, reviewed final policies, isolated providers and separate provisioning                                                     |
| 8     | retained bundle and manual plan without execution           | reviewed change set ARN, assets/digest, parameters, permissions and separate execution                                                                            |
| 9     | acceptance checklist                                        | SigV4 and anonymous rejection; six contracts; proxies/IP; real concurrent quotas; failures/timeouts; invalid secret; corrupt/expired fallback; privacy and alarms |
| 10    | local integrity verification and code recovery              | test recovery rehearsal and routing with EC2 running, original digests/config, in-flight effects and cutover runbook                                              |
| 11–14 | existing order preserved                                    | refresh knowledge immediately before production; deploy, stabilize, then finish the other API migrations and preserve EC2                                         |

Start phase 9 with simulated providers/destinations, without real deliveries or paid generation. Measure INIT, per-route latency, billed duration, errors, throttling and auxiliary costs. Establish thresholds from those samples before exposure; do not invent acceptance values or RTO/RPO. Current alarms have no actions: their existence does not demonstrate an operational notification.

Traffic recovery must preserve one write destination per request, without POST/DELETE replay. Returning to EC2 does not undo accepted emails or subscriptions. General editorial refresh and model/pricing review remain in their planned steps.

## Subsequent local preparation for phases 6–10

[Test operations](test-operations.md) and the [foundation template](../infra/production-foundation.template.json) materialize policies/boundaries and minimal bootstrap. They include GetEncryptionConfiguration/GetParameters for CLI reads and disable V2 API administration by default. The plan recovers the reviewed artifact by run/digest and checks promotion to main without rebuilding. Observer audit completed; no test resources provisioned. Managed doubles, changeset execution, test recovery and production return remain pending under that runbook.

## Verified OIDC subject

The repository's effective configuration returns `use_immutable_subject=true` and the prefix `repo:matigaleanodev@99203645/portfolio-api-cloud@1432631186`. GitHub includes immutable owner and repository IDs for repositories created after July 15, 2026. Each trust pins this prefix and its exact environment with `StringEquals` and the `sts.amazonaws.com` audience; neither wildcards nor the previous name-only subject are accepted.

The first fictitious-configuration authentication exposed the mismatch: initial access expected the previous subject and STS rejected `AssumeRoleWithWebIdentity` before secret creation. The correction aligns both access trusts and the foundation trust with the emitted identity, preserving policies, boundaries and main-only environments. [Current OIDC format](https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims).

## Recovered assembly metadata

The bundle also preserves each manifest artifact's `additionalMetadataFile`. CDK requires this metadata to load a stack from its retained assembly; omitting it causes `ENOENT` before asset publishing. Creation validates these references with the same path and symlink restrictions as templates/assets. Recovery rejects an assembly whose referenced metadata is missing, even when its checksum inventory is consistent. Unreferenced historical files remain excluded.

The plan requires exactly one stack in the assembly and passes RuntimePermissionsBoundaryArn and RuntimeSecretArn without a stack prefix. The CDK selector PortfolioApiCloudTest differs from the physical name portfolio-api-cloud-test; using the selector as the parameter prefix caused the CLI to ignore both values before change set creation.

CDK can set IncludeNestedStacks=true for a flat stack. Review checks the effective hierarchy: it rejects AWS::CloudFormation::Stack in the template or changes, child change set ARNs on resources, ParentChangeSetId and a foreign RootChangeSetId. The indicator alone adds no resources; imports and notifications remain blocked and the template must match the assembly exactly.

## First private installation compatibility

The CloudFormation stage provider and the observed ApiGatewayV2 denial require `apigateway:TagResource`. That exact action is granted in both policy and boundary on the same regional/per-ID test `/apis/` tree. The attempt using HTTP verbs and `/tags/` ARNs was still denied; those additional ARNs were removed. The catalogue used by cfn-lint 1.57.2 does not recognize this action: its two W3037 findings are recorded without disabling the rule. Configuration reads declared by the Lambda provider remain limited to the owned function; no KMS permissions or access to other functions are added.

The simulated-provider variant omits `ReservedConcurrentExecutions`. The verified account has a regional quota of 10, and Lambda requires leaving 100 executions unreserved to configure a reservation. IAM keeps the installation private and verification uses sequential requests; API Gateway retains 2 requests/s and burst 5. Normal synthesis keeps a reservation of 5 and requires a compatible quota before real providers or public traffic. The regional quota is unchanged and no concurrency is provisioned. [Lambda reservation rule](https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html).

The provider read contract also requires table backup/contributor-insights/streaming/policy metadata, log-group protection/index policies, alarm tags and attached-role policies. These reads and tagging operations retain the same owned-resource scope. DescribeResourcePolicies and DescribeIndexPolicies share the regional discovery exception without an ARN with DescribeLogGroups, restricted to us-east-1; it grants neither log-event reads nor policy changes on other applications.
