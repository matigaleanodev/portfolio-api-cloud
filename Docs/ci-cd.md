# Prepared CI/CD

[Español](ci-cd.es.md) · 2026-10-24. The workflows cover document validation, test planning and branch integration. This delivery versions documentation; the production application and stack are not implemented yet.

## CI

`.github/workflows/ci.yml` handles PRs to main/dev, pushes to those branches and manual dispatch. Read-only permissions; no OIDC, secrets or AWS credentials. It validates document pairs/local links. Until package.json exists, the summary explicitly says application tests/build/synth did not run.

A future application requires lockfile/cdk.json plus this script contract: non-fixing `lint`, `test -- --ci --runInBand`, `test:e2e`, `build`, `cdk -- synth --no-lookups --context stage=test`. These commands do not exist yet. Tests must ignore .env, use dummy config and block real providers/network by default, whether the runtime is Nest or native handlers. Adapt the runner/script contract explicitly if selected tooling changes.

Aggregate job `verify` is the required GitHub check, bound to the GitHub Actions App. Documentation or present-application failure fails it. During documentation-only preparation the application job is skipped and clearly reported. Local validation uses `python3 scripts/check_docs.py` and the maintainer environment's actionlint.

## Test deployment preparation

`.github/workflows/deploy-test.yml` requires manual dispatch from the exact repo's main, TEST_PLAN_ENABLED=true and environment test-plan. No environment/roles/variables/resources were created; the job currently skips. No push-triggered deployment or production path exists.

Environment setup must protect the environment and restrict OIDC to `repo:matigaleanodev/portfolio-api-cloud:environment:test-plan`, with environment branch restrictions too. Expected variables/targets:

- TEST_AWS_ROLE_ARN: personal PortfolioApiCloudTestGitHubDeployRole.
- TEST_CDK_DEPLOY_ROLE_ARN: PortfolioApiCloudTestCdkDeployRole, assumed by the CLI according to the assembly, with PassRole limited to the expected execution role.
- TEST_EXECUTION_ROLE_ARN: PortfolioApiCloudTestCloudFormationExecutionRole.
- One stack: CDK ID PortfolioApiCloudTest, physical name portfolio-api-cloud-test, account 650387442642, us-east-1.

The future synthesizer must configure cloudFormationExecutionRole and deployRoleArn separately. The workflow asserts cloudFormationExecutionRoleArn/assumeRoleArn in the manifest rather than passing the service execution role as CLI --role-arn. Asset-publishing roles and bootstrap trust require separate review before activation.

The workflow checks files/scripts/tests/offline synth before authentication, verifies the assembly and exact identity, then uses `cdk deploy --method prepare-change-set` with a unique SHA/run name. **This is a future mutation:** it can publish S3/ECR assets/create a change set or preparatory stack even without executing infrastructure. It is not read-only and was not run. `--require-approval never` removes the CLI prompt; review is enforced through the environment and the change set.

There is no execute-change-set, direct deploy, bootstrap, destroy, existing-cloud import or generic role. Executing the reviewed change set needs an execution step binding exact ARN/stack/SHA/assets/review. Default CDK diff can also create a change set; do not assume it is read-only in audits.

## Merges and dev synchronization

`.github/workflows/merge.yml` requires main or dev dispatch, MERGE_WORKFLOW_ENABLED=true, environment merge, an existing PR and full reviewed head SHA. It verifies open/nondraft state, same repository, protected base/allowed source, required checks and uses --match-head-commit without --admin.

It uses private **dedicated GitHub App** `matigaleanodev-portfolio-merge` (5461240), installed only on this repo. Permissions: Contents/Pull requests/Workflows write; Checks/Metadata read. Repository variables MERGE_APP_ID and MERGE_WORKFLOW_ENABLED are configured. The key is stored in MERGE_APP_PRIVATE_KEY within environment `merge`, restricted to main/dev branches; its local copy stays outside Git with private permissions. The App ID is the update ruleset's sole `pull_request` bypass; PR/CI retains zero bypass actors. [Effective rules](branch-protection.md).

To synchronize main→dev while satisfying strict up-to-date checks, create release/sync-main-to-dev from dev, merge main into that work branch, open its PR to dev and dispatch this workflow with the reviewed head. Direct main→dev PRs may be behind dev because of its own merge commits. Use the same target-based work-branch approach for other protected-branch crossings when needed. No direct push/force/PAT, bypassed checks or token-created PR is used. **dev is not promised to be an exact-SHA main mirror**: merge commits may give it its own history; exact mirroring would require a compatible integration mechanism. can_approve_pull_request_reviews was not changed; the App does not approve reviews.

## Pending operational setup

The repository uses dev as its default branch; main does not exist yet. The App and merge environment are configured and their scope has been verified. The first execution is tracked in PR #2; configuration alone does not demonstrate a successful merge. The test-plan environment, npm/stack implementation and AWS roles/bootstrap remain pending. Deployment has not been validated end to end. Initial PR #1 integration consumed the temporary dev-only exception described in [branch protection](branch-protection.md).

Only feat/, fix/, release/ work branches; codex/ forbidden. main/dev integrate through workflow-merged PRs. Preserve serial execution, scoped job permissions and immutable artifacts/versions. Production remains outside scope.

## Separate local evidence

The local comparison ran mocked tests and exercised separate application/CDK detection. Those workflow changes, scripts and packages are not part of these documentary commits and were discarded from the checkout. The next increment must explicitly adapt CI to the initial structure and avoid requiring a placeholder stack merely because package.json is added. [Status and limits](local-runtime.md).
