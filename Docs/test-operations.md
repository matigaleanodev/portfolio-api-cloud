# Test environment operation and validation

> Initial design and validation record. Current production delivery, names and historical recovery are documented in [Integration and delivery](ci-cd.md).

[Español](test-operations.es.md) · 2026-10-25.

**Current increment:** [first installation with doubles and Actions delivery](managed-validation.md), deployed and verified on AWS with simulated providers. [First private deployment result](first-private-deploy.md). Design and audit sections retain their earlier context.

## Status and sequence

Protected delivery is operational on dev. This local update pins Ubuntu 24.04 and actions/checkout 7.0.1, setup-node 7.1.0 and upload-artifact 7.0.2; their official manifests use Node 24 and require runner 2.327.1 or later. Application Node remains 24.22.1. The ubuntu-latest migration to 26.04 is rolling out from October 19 to November 19, 2026. Pinning the image avoids depending on that transition; a remote run of this increment remains pending. [Checkout](https://github.com/actions/checkout/releases/tag/v7.0.1), [setup-node](https://github.com/actions/setup-node/releases/tag/v7.1.0), [artifact](https://github.com/actions/upload-artifact/releases/tag/v7.0.2), [runner](https://github.com/actions/runner-images/issues/14748).

Phases 7–10 have reviewable local preparation. This does not establish installed bootstrap, deployment, managed validation or a verified remote recovery. The [design](deployment-design.md) preserves separate GitHub OIDC, CDK deploy, S3 publishing, CloudFormation and runtime responsibilities.

## Promotion to main

The October 25 remote audit confirms dev at 832be8883aaae40b660d7605bf87cd8bb1ff82df and no main branch. Active rulesets cover both branches: updates permits user 99203645 to integrate only through PRs; quality requires GitHub Actions verify, an updated base, resolved conversations and merge commits, without bypass. No creation rule appears; that alone does not prove a future creation request will succeed.

The prepared path is to integrate this increment into dev, initialize main at an exact integrated dev SHA with successful CI, recheck effective rules and then use dev→main PRs merged through the workflow. Initialization does not alter rulesets or establish a permanent exception. Record the creation SHA, actor and CI. If creation is rejected, stop that operation and inspect the reason. Do not weaken rules or switch the plan to dev.

Before activating the plan, test-plan must exist and allow only main, with the documented role/secret variables. TEST_PLAN_ENABLED is a repository variable because the job condition is evaluated before entering the environment. An environment OIDC sub does not prove the branch; both workflow and environment must enforce main. Environment review must be feasible for the actual reviewers: do not prohibit self-approval when the only reviewer also starts every run.

## Reviewable external foundation

[infra/test-foundation.template.json](../infra/production-foundation.template.json) materializes the bucket, bootstrap parameter, four external roles and five boundaries. Runtime remains owned by the application CDK stack. It creates no secrets, OIDC provider, ECR, lookup role, CMK or application resources. The GitHub OIDC provider must exist and be reviewed separately.

The template checks account 650387442642 and us-east-1. RuntimeSecretArn is mandatory and exact; no secret values are accepted. The runtime boundary permits only its log streams, control-table GetItem/PutItem/UpdateItem and GetSecretValue on that reference. Using a customer-managed Secrets Manager key would require reviewing kms:Decrypt separately; this proposal does not grant it.

Identity policies and boundaries have matching ceilings for each role. GitHub only assumes deploy/publisher. Deploy prepares changesets for the test stack, requires the exact executor and changeset naming, reads bootstrap version/assets and passes only that executor to CloudFormation. Publisher only reads/writes its dedicated bucket, without deletion. Executor manages only test resources and creates/passes RuntimeRole with the exact runtime boundary. It cannot alter boundaries or delivery roles.

Installed CLI 2.1146.1 calls GetBucketEncryption while publishing; s3:GetEncryptionConfiguration is included on the exact bucket. Deploy and CloudFormation may need GetParameters for BootstrapVersion. The current assembly requires bootstrap version 6 and minimum CLI 2.1146.1; the proposed parameter is 6 with BucketName, BucketDomainName and BootstrapVersion outputs. Synthesizer lookup metadata does not establish a lookup role: this flow performs no lookups. Effective service compatibility remains unverified.

Only logs:DescribeLogGroups uses Resource * in this proposal, restricted by region. The bucket policy uses Deny s3:* with Principal * for insecure transport; it grants no public access. Other wildcards are test resource suffixes or the explicit API scope below. Deploy has no ExecuteChangeSet/CreateStack/UpdateStack/DeleteStack, preserving the execution boundary.

### API Gateway with a generated ID

AllowRegionalApiBootstrap=false and TestApiId=unassigned are the defaults: no API Gateway administration is granted. This is not a foundation ready to deploy the application.

For an identified test API, TestApiId scopes /apis/ID and its children; verify stack ownership first. To create the first API of the current stack, AllowRegionalApiBootstrap=true permits POST /apis only with ApiName=portfolio-api-cloud-test, but /apis/* administration remains regional. It could affect other HTTP/WebSocket APIs in us-east-1 outside the reviewed template. Names and tags do not provide demonstrated isolation.

The API Gateway reference documents tag inheritance for V1 resources; it does not establish inheritance for V2 routes/integrations. Do not add apparently restrictive conditions without demonstrating that AWS evaluates them. The decision for the first installation is to use the regional variant, given a personal account with a single operator. API creation retains its name constraint; permissions on existing APIs remain regional and do not isolate the current production API. Operations are restricted to the reviewed application template. Record the generated ID; later narrowing to exact TestApiId is possible without creating another installation. Denials never trigger automatic elevation. [V2 authorization](https://docs.aws.amazon.com/service-authorization/latest/reference/list_apigatewayv2.html), [tag inheritance](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-tagging-supported-resources.html).

The bucket retains SSE-S3 encryption, versioning, BucketOwnerEnforced ownership, public access blocking and TLS. No automatic expiration is configured: inventory active references and the recovery revision before cleanup, retaining necessary versions for at least 90 days. Retain and versioning do not replace a recovery procedure.

## Prepare a changeset from the chosen artifact

The plan remains manual, main-only and inactive while prerequisites are missing. It requires reviewed run ID, artifact ID, full SHA and sha256 digest. Metadata/ZIP are downloaded from the exact repository with a read-only GitHub token, before AWS authentication.

recover_bundle.py requires completed successful push CI on main/dev, ci.yml, matching repository, revision, run and attempt, an unexpired artifact and the expected test-assembly name. It compares the digest with GitHub and ZIP bytes, rejects external/absolute paths, links, duplicates and excessive expansion, then checks the existing inventory. Synthetic PR merge artifacts are rejected. This does not authenticate provenance outside GitHub or replace human digest review.

The recovered SHA must be an ancestor of the main revision running the control: an unpromoted dev artifact fails. The retained lock must match the workflow lock; Node, minimum CLI, account/region, stack, roles and asset bucket are checked before OIDC. It neither rebuilds nor synthesizes the recovered revision. Source CI already performed tests and synth; recovery does not renew fallback dates.

The test-plan control artifact name uses the workflow SHA; review.json retains the recovered application SHA. Record both. S3 publishing and CreateChangeSet are mutations even though prepare-change-set does not execute application resources.

Before preparation, retain SHA/digest/run, asset inventory, workflow SHA, STS identity, nonsecret parameters and exact ARNs. Afterwards obtain full ChangeSetId and StackId; privately retain DescribeChangeSet, changes, replacements and roles; wait for CREATE_COMPLETE/AVAILABLE. Do not execute after failed preparation, scope changes or control-table replacement. An empty changeset is not a successful deployment.

## Separate execution

Deploy cannot execute. The next step must use a reviewed execution identity and a temporary policy allowing ExecuteChangeSet only on the observed stack ARN with exact cloudformation:ChangeSetName. Immediately recheck identity, region, account, changeset, AVAILABLE status, executor, parameters, asset hashes and revision. Do not grant CreateChangeSet, UpdateStack or new PassRole as a shortcut. This foundation creates no execution identity for that step.

Record command, idempotency token where applicable, actor, time, ARN and events/results without payloads or secrets. CREATE_COMPLETE/UPDATE_COMPLETE, IAM endpoint and effective configuration are subsequent evidence; acceptance of ExecuteChangeSet alone does not prove a completed deployment. Identify drift operations before using them: cdk diff can prepare a changeset and is not treated as harmless reading.

## Doubles for managed validation

Locally implemented variant: a validation-only entrypoint packaged as a separate asset with its own digest and handler, deployed only to the test stack. It reuses createManagedHandler with real Secrets Manager and DynamoDB plus explicit contact, subscription and AI doubles. It adds no simulator service or public provider selector.

The entrypoint and packager are implemented and verified locally; see the current [first installation plan](managed-validation.md). They must require exact test function/table and secret references, reject destinations outside .invalid domains and non-dummy credentials, and prohibit fallback to real transports. Contact needs an explicit SendEmail dependency in managed composition; subscriptions/AI already have injectable request. The first pass omits remote R2 and uses packaged fallback. Later R2 scenarios need an explicit injected reader, without real R2 credentials. The normal package must exclude entrypoint, scenarios and doubles; test both packages with networking blocked.

Doubles cover success, errors, pending bodies and ambiguous outcomes without external requests. Scenario selection belongs to reviewed test package/configuration, never visitor headers, query or sessionId. Record that this asset tests gateway/IAM/Secrets/Dynamo and behavior with simulated providers; it does not test Resend, R2 or OpenAI availability or their real SDK transports.

### Execution and evidence matrix

| Group       | Required managed scenarios and evidence                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ingress/IAM | Valid SigV4; anonymous rejection; caller lacking execute-api:Invoke rejected; six routes; anonymous OPTIONS; no Function URL; allowed/denied CORS and gateway errors                 |
| Contracts   | health 200, contact 204 without body, starters 200, chat 201, subscribe/unsubscribe 200 with DELETE body; validation and 400/413/429/500/502/503; one simulated effect per operation |
| IP/quotas   | sourceIp versus forged XFF, IPv6 and shared origin; real concurrency from controlled clients; per-method quotas; CAS/contention; logical TTL without waiting for physical deletion   |
| AI          | Direct FAQ; five responses per session/origin; session rotation; global admission across instances; retained ambiguous reservations; budget only in private secret                   |
| Failures    | Invalid secret and expired refresh in isolated fixture; denied/timed-out storage; pending bodies/cancellation; corrupt/expired fallback in separate package; no replay               |
| Observation | Logs without IP/email/prompt/history/secrets; own correlation; three alarm metrics/states; currently empty actions; no operational notification claim                                |
| Performance | Cold samples with demonstrated INIT, warm samples separately, per-route latency, billed duration, memory, errors/throttling, auxiliary requests and S3/Secrets/Dynamo/log costs      |

For each scenario retain fixture version, SHA/digest, client/identity, controlled origin, nonsecret configuration, time, sample size, expected and observed result. Retain no personal payloads. Real IP quotas may require multiple controlled origins and separate windows; never forge sourceIp through headers. Storage/secret failure scenarios require reviewed temporary fixtures/permissions, without altering active shared control.

Set latency/error/cost acceptance thresholds after the initial sample and before accepting the environment. Leave them unset without data. Existing alarm thresholds are local technical signals, not acceptance criteria or delivered alerts. Inspect states without sending notifications. Real providers, model/pricing and private account retention require a later specific pass.

## Test recovery and return preparation

Test rehearsal: choose a compatible retained earlier revision; recover its ZIP by run/digest, verify bytes and promotion, compare parameters/changeset, preserve shared control table, QUOTA_KEY_SECRET and compatible secret, then prepare and execute separately. Never restore old counters or release ambiguous reservations. If old code cannot use current control/secrets or fallback exceeds 30 days, do not claim business recovery. Health can remain liveness without proving all six contracts recovered.

After return, repeat simulated contracts, concurrency/quotas, privacy and observation; record actual decision-to-availability time and any loss/effect. This increment establishes no RTO/RPO commitment or completed remote rehearsal. Local hash recovery does not replace that rehearsal.

Before production cutover, complete this private record with inventory verified by its owner:

| Item          | Required state                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Ingress       | Frontend/API URLs, exact selection mechanism, caches/TTL and actual destination verification             |
| EC2           | Instance/region, working containers, retained image references/digests, Compose/scripts and dependencies |
| Configuration | Private location and recovery mechanism; secrets outside Git/public artifacts                            |
| Access        | Working SSM, Tunnel/Traefik and certificates verified by their owner                                     |
| Return        | Trigger, responsible operator, return path, in-flight requests and health/contract checks                |

This increment does not inventory or modify production. Cutover keeps EC2 running, one write destination per request and no POST/DELETE replay. Stop switching on an ambiguous outcome and resolve it with the owner; returning to EC2 does not reverse accepted emails/subscriptions. No shadow traffic with effects. EC2 shutdown still follows all three migrations, stabilization and recoverable backup; general editorial renewal remains phase 11 immediately before production.

## Effective audit on 2026-10-25

STS identity was verified with Observer in the personal account and us-east-1 before resource queries. The token.actions.githubusercontent.com OIDC provider exists and accepts sts.amazonaws.com. That does not establish trust for any nonexistent role.

| Expected resource                          | Observed result                                                  |
| ------------------------------------------ | ---------------------------------------------------------------- |
| Five test roles and five boundaries        | NoSuchEntity                                                     |
| Application and test foundation stacks     | Do not exist                                                     |
| Dedicated bucket and papiatest SSM version | NoSuchBucket / ParameterNotFound                                 |
| Test Lambda and control table              | Not found                                                        |
| Secrets under portfolio-api-cloud/test/    | Empty active metadata list; no values read                       |
| portfolio-api-cloud-test-* alarms          | Empty list                                                       |
| Regional HTTP API V2 inventory             | An existing portfolio-cloud production API; no expected test API |

No AccessDenied or profile switch occurred during this audit. Absence results do not prove effective permissions for the new design. The existing production API falls within the accepted regional scope; the proposal neither modifies it nor establishes name-based isolation for operations on existing APIs. Detailed evidence stays private; no application data or log contents were queried.

The proposal passed cfn-lint 1.57.2. IAM Access Analyzer ValidatePolicy, using Observer and synthetic references, validated all five policies and regional/exact-ID variants with no final findings. This checks policy form; it does not establish installation, effective permissions, tag inheritance or deployment compatibility.

## One AWS installation for this API

The new API starts with a single stack. No parallel production installation is prepared: the same stack is validated with simulated providers and can later enable real providers through reviewed configuration. Original EC2 implementations remain operational during migration.

Existing test, PortfolioApiCloudTest and portfolio-api-cloud-test identifiers are retained as names of the only current target, not a commitment to a second environment. Git dev/main branches describe integration and publication. The GitHub test-plan environment gates workflow execution and is not another AWS infrastructure. Initial deployment remains unexecuted; main/v0.1.0 do not automatically enable the workflow or real providers.

The definitive installation still needs permissions, contracts and recovery validation before real traffic. Managed doubles remain pending preparation; this increment adds no LocalStack or other local AWS deployment emulation.
