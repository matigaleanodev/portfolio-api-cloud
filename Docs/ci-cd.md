# Prepared CI/CD

[Español](ci-cd.es.md) · 2026-10-25. The workflows cover document validation, test planning and branch integration. The local application includes all six contracts with tests; the stack synthesizes locally.

**Current phase 4 status:** [runtime controls](runtime-hardening.md), locally implemented and tested: shared quotas, GLOBAL AI budget, session/origin limits, cancellation, versioned fallback, configuration and observability. Initial migration references retain their historical evidence; they do not establish AWS validation.

## CI

`.github/workflows/ci.yml` handles PRs to main/dev, pushes to those branches and manual dispatch. Read-only permissions; no OIDC, secrets or AWS credentials.

The documentation job validates language pairs/links and detects application/infrastructure separately. package.json requires lock, tsconfig and a real entry; orphan application files fail. cdk.json enables infrastructure and requires its scripts.

Application runs `npm ci --ignore-scripts`, `format:check`, `typecheck`, `build`, `test:app`, `test:tooling` and `test:package` on Node 24.22.1. Vitest runs 513 application cases and 49 tooling cases. No fixing lint/source mutation. The network guard loads before application imports with no inherited credentials. [Coverage and cases](testing.md).

Infrastructure is active because cdk.json exists; it runs 18 `test:infra` cases and `cdk -- synth --no-lookups --context stage=test`, without AWS credentials. [Local stack and prerequisites](infrastructure.md).

The required check remains `verify`, bound to GitHub Actions: documentation must succeed and each present scope must pass; skipped is accepted only for an absent scope. The application job must pass in full. Its summary distinguishes application from synth and does not claim verified infrastructure without a stack.

Local checks: `npm run check` and actionlint. Foundation CI was also verified in PR #4; every new head must pass required checks again.

## Test deployment preparation

`.github/workflows/deploy-test.yml` requires manual dispatch from the exact repo's main, TEST_PLAN_ENABLED=true and environment test-plan. No environment/roles/variables/resources were created; the job currently skips. No push-triggered deployment or production path exists.

Environment setup must protect the environment and restrict OIDC to `repo:matigaleanodev/portfolio-api-cloud:environment:test-plan`, with environment branch restrictions too. Expected variables/targets:

- TEST_AWS_ROLE_ARN: personal PortfolioApiCloudTestGitHubDeployRole.
- TEST_CDK_DEPLOY_ROLE_ARN: PortfolioApiCloudTestCdkDeployRole, assumed by the CLI according to the assembly, with PassRole limited to the expected execution role.
- TEST_EXECUTION_ROLE_ARN: PortfolioApiCloudTestCloudFormationExecutionRole.
- One stack: CDK ID PortfolioApiCloudTest, physical name portfolio-api-cloud-test, account 650387442642, us-east-1.

The synthesizer configures cloudFormationExecutionRole and deployRoleArn separately. The workflow asserts cloudFormationExecutionRoleArn/assumeRoleArn in the manifest rather than passing the service execution role as CLI --role-arn. Asset-publishing roles and bootstrap trust require separate review before activation.

The workflow recovers the CI artifact by run/ID/SHA/digest, requires promotion to main and validates lock, manifest and destinations before authentication. It does not rebuild or synthesize the recovered assembly; it then verifies the exact identity, then uses `cdk deploy --method prepare-change-set` with a unique SHA/run name. **This is a future mutation:** it can publish S3/ECR assets/create a change set or preparatory stack even without executing infrastructure. It is not read-only and was not run. `--require-approval never` removes the CLI prompt; review is enforced through the environment and the change set.

There is no execute-change-set, direct deploy, bootstrap, destroy, existing-cloud import or generic role. Executing the reviewed change set needs an execution step binding exact ARN/stack/SHA/assets/review. Default CDK diff can also create a change set; do not assume it is read-only in audits.

The command supplies required `RuntimePermissionsBoundaryArn` with the expected ARN. Review/provision that boundary and constrained bootstrap/publishing roles before enabling preparation. The stack does not create these automatically. No preparation run occurred.

## Merges and dev synchronization

The `.github/workflows/merge.yml` workflow requires dispatch by matigaleanodev from main/dev, environment merge, an existing same-repository PR and a full reviewed SHA. It checks required checks with the read-only GITHUB_TOKEN and uses `MERGE_USER_TOKEN` only to verify identity and request the API merge. It rejects bots, other accounts, insufficient access or broad bypass and confirms GitHub's merged_by and commit. It changes no merge authorship or dates and has no installation-token fallback.

MERGE_USER_TOKEN is provisioned using the existing user OAuth credential, verified as matigaleanodev, without expanding scopes. PR #5 installed the mechanism through one final App merge. The update actor is now User 99203645, pull_request only; PR/CI still has no bypass. The environment retains main/dev and does not admit execution from feat/. [Credentials, permissions, checks and transition limits](integration.md).

To synchronize main→dev, retain a release/sync-main-to-dev branch based on dev, merge main there and open a PR to dev. No direct push, force, manual merge or --admin. dev is not declared an exact-SHA main mirror: it retains its own merge commits.

## Pending operational setup

dev retains integration. Initial main uses the same dev commit identified by [v0.1.0](releases/v0.1.0.md), after successful CI; subsequent updates retain PR and workflow merge. The merge environment retains main/dev; the workflow uses user identity after the PR #5 transition. The first execution is tracked in PR #2; configuration alone does not demonstrate a successful merge. The test-plan environment, AWS roles/bootstrap remain pending. Deployment has not been validated end to end. Initial PR #1 integration consumed the temporary dev-only exception described in [branch protection](branch-protection.md).

Only feat/, fix/, release/ work branches; codex/ forbidden. main/dev integrate through workflow-merged PRs. Preserve serial execution, scoped job permissions and immutable artifacts/versions. Production remains outside scope.

## Separate local evidence

Experiment changes were discarded. This foundation adds new application/infrastructure detection with its own tests rather than recovering comparison scripts. The test plan retains repository, branch, environment, role, identity and change-set restrictions. Commands now match typecheck, build, test and test:package; test:infra and CDK now run local checks; their AWS prerequisites remain pending. [Local foundation](application.md).

## Recovery of the first App merge

The [initial run](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40147675945) validated the PR and generated the token, but `gh pr merge` stopped locally on `mergeStateStatus=BLOCKED` before requesting a server merge. The correction uses the merge endpoint with the exact SHA and confirms `merged=true`. The [recovery run](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40153939891) merged PR #2 with the App while preserving PR/CI. It used a temporary entry from `feat/migration-evidence-docs`, bound to its exact SHA and environment `merge`. This cleanup removes that condition; the recovery variable and environment branch permission have already been removed. The regular flow again accepts dispatch only from main/dev, and the environment retains only those branches. dev was not removed from the lock and the quality ruleset was unchanged.

Future preparation also requires TEST_RUNTIME_SECRET_ARN, restricted to the portfolio-api-cloud/test/ prefix in the same account/region. It is passed as RuntimeSecretArn and contains no secret value. Activation, branch, environment and prepare/execute separation remain unchanged.

## Retained assembly and plan tests

CI builds a bundle after test:infra/synth; deploy-test retains its own before OIDC. SHA/run/attempt artifacts, 30 days, missing files fail. review_bundle.py preserves assembly, lock, revision/Node and hashes; verify rejects altered, missing or extra files and different revisions. Two cases test actual prerequisites and workflow barriers; thirteen test bundle creation/recovery and rejection. [Retention, provenance, limitations and next steps](deployment-design.md). Earlier retention is integrated through PR #10; run/digest recovery and the current increment remain local.

## Local phase 6 update and preparation for 7–10

Ubuntu 24.04 and actions checkout/setup-node/upload-artifact are pinned to 7.0.1/7.1.0/7.0.2, all using Node24. merge.yml changes only its runner image, retaining controls and identity. The plan requires artifact_run_id, artifact_id, reviewed_revision and reviewed_digest. It recovers an integrated CI artifact, checks promotion to main and uses --app .tmp/recovered/cdk.out without rebuilding. GitHub actions:read is limited to preparation; CI still has no OIDC.

[Test operations](test-operations.md) covers the effective audit, main initialization, external roles/boundaries/bootstrap proposal, disabled V2 API exception, changeset review/execution, doubles design and runbook. A remote run of this increment and plan activation remain pending.

One AWS installation retains existing test names and starts validation with simulated providers; no parallel production stack or local AWS deployment emulation is added. Regional API Gateway scope is chosen for the personal account, with effects on existing APIs explicit in [operations](test-operations.md). main and v0.1.0 do not automatically deploy.
