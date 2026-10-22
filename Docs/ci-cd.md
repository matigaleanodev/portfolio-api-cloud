# Prepared CI/CD

[Español](ci-cd.es.md) · 2026-10-24. The workflows cover document validation, test planning and branch integration. The local foundation includes health and tests; business routes and the stack remain pending.

## CI

`.github/workflows/ci.yml` handles PRs to main/dev, pushes to those branches and manual dispatch. Read-only permissions; no OIDC, secrets or AWS credentials.

The documentation job checks pairs/links and runs five tests of `scripts/ci_scope.py` and seven of merge-workflow identity/rule validation. Detection reports application and infrastructure independently: package.json requires a lock, tsconfig and real entry; orphan application files without a manifest fail. cdk.json activates infrastructure and requires its specific scripts.

Application runs `npm ci --ignore-scripts`, `typecheck`, `build`, `test` and `test:package` on Node 24.22.1 LTS. The native runner replaces the previous Jest contract; no fixing lint or automatic source changes. The network guard loads before application code, with dummy configuration and no inherited credentials. [Partial coverage](application.md).

Infrastructure skips until cdk.json exists. Once present it will run `test:infra` and `cdk -- synth --no-lookups --context stage=test`. Adding application code does not require placeholder CDK.

The required check remains `verify`, bound to GitHub Actions: documentation must succeed and each present scope must pass; skipped is accepted only for an absent scope. The application job must pass in full. Its summary distinguishes application from synth and does not claim verified infrastructure without a stack.

Local checks: `npm run check`, `python3 -m unittest discover -s scripts -p 'test_*.py'` and actionlint. Updated workflows were checked locally; their remote execution for this foundation remains pending.

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

The local `.github/workflows/merge.yml` candidate requires dispatch by matigaleanodev from main/dev, environment merge, an existing same-repository PR and a full reviewed SHA. It checks required checks with the read-only GITHUB_TOKEN and uses `MERGE_USER_TOKEN` only to verify identity and request the API merge. It rejects bots, other accounts, insufficient access or broad bypass and confirms GitHub's merged_by and commit. It changes no merge authorship or dates and has no installation-token fallback.

MERGE_USER_TOKEN is provisioned using the existing user OAuth credential, verified as matigaleanodev, without expanding scopes. Effective configuration still grants only App 5461240 pull_request access to updates with no PR/CI bypass. Identity migration and workflow activation remain pending; this candidate cannot run from feat/ under current restrictions. [Credentials, permissions, checks and transition limits](integration.md).

To synchronize main→dev, retain a release/sync-main-to-dev branch based on dev, merge main there and open a PR to dev. No direct push, force, manual merge or --admin. dev is not declared an exact-SHA main mirror: it retains its own merge commits.

## Pending operational setup

The repository uses dev as its default branch; main does not exist yet. The App and merge environment are configured and their scope has been verified. The first execution is tracked in PR #2; configuration alone does not demonstrate a successful merge. The test-plan environment, stack implementation and AWS roles/bootstrap remain pending. Deployment has not been validated end to end. Initial PR #1 integration consumed the temporary dev-only exception described in [branch protection](branch-protection.md).

Only feat/, fix/, release/ work branches; codex/ forbidden. main/dev integrate through workflow-merged PRs. Preserve serial execution, scoped job permissions and immutable artifacts/versions. Production remains outside scope.

## Separate local evidence

Experiment changes were discarded. This foundation adds new application/infrastructure detection with its own tests rather than recovering comparison scripts. The test plan retains repository, branch, environment, role, identity and change-set restrictions. Commands now match typecheck, build, test and test:package; test:infra and CDK remain future requirements. [Local foundation](application.md).

## Recovery of the first App merge

The [initial run](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40147675945) validated the PR and generated the token, but `gh pr merge` stopped locally on `mergeStateStatus=BLOCKED` before requesting a server merge. The correction uses the merge endpoint with the exact SHA and confirms `merged=true`. The [recovery run](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40147939891) merged PR #2 with the App while preserving PR/CI. It used a temporary entry from `feat/migration-evidence-docs`, bound to its exact SHA and environment `merge`. This cleanup removes that condition; the recovery variable and environment branch permission have already been removed. The regular flow again accepts dispatch only from main/dev, and the environment retains only those branches. dev was not removed from the lock and the quality ruleset was unchanged.
