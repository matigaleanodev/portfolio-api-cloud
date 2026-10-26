# Integration and delivery

[Español](ci-cd.es.md)

CI runs documentation, types, build, contracts, tooling, packaging and CDK synthesis without AWS credentials. The required `verify` check preserves every job result. Protected PR merges run through `merge.yml` using the actual matigaleanodev identity.

## Artifact and planning

`ci.yml` retains `api-assembly-<sha>-<run>-<attempt>` for 30 days. The bundle includes the complete assembly, referenced CDK metadata, lockfile, revision, Node version and SHA256 inventory. `plan-production.yml` requires successful push CI on main/dev, promotion of that revision to main, and review of the artifact run, ID and digest. It recovers that package and prepares a changeset without rebuilding the runtime.

The `production-plan` environment allows main exclusively. `PRODUCTION_PLAN_ENABLED` stays false outside an operation. `PRODUCTION_AWS_ROLE_ARN`, `PRODUCTION_CDK_DEPLOY_ROLE_ARN`, `PRODUCTION_EXECUTION_ROLE_ARN` and `PRODUCTION_RUNTIME_SECRET_ARN` reference existing identities and configuration. `PRODUCTION_CERTIFICATE_ARN` identifies the ACM certificate; `PRODUCTION_ALARM_TOPIC_ARN` identifies the alarm channel.

`plan-foundation-production.yml` separately prepares the [foundation](../infra/production-foundation.template.json), with the reviewed template digest and `production-foundation-plan` environment. `validation-secret.yml` retains its exclusive purpose of creating fictitious configuration, never real credentials.

## Execution

The visible workflow **build and deploy**, file `build-and-deploy.yml`, uses `production-execute` and `PRODUCTION_EXECUTE_ENABLED`. It receives StackId, ChangeSetId and the reviewed receipt digest. It restricts the session to that target, verifies the live changeset and published assets again, compares the digest and executes once. Pushes do not deploy automatically; PR/CI protections remain enforced.

OIDC trusts use immutable owner/repository identities and exact environments; both workflow and environment policies enforce main. Planning, publishing, CloudFormation execution and runtime roles remain separate. Legacy physical names `portfolio-api-cloud-test`, `PortfolioApiCloudTest*`, bucket and table remain stable to avoid recreation and data loss.

## Recovery

`recover_bundle.py` accepts both `api-assembly-...` and historical `test-assembly-...` artifacts with identical run, revision, digest, extraction and inventory checks. Published artifacts are not renamed and their checks remain enforced. Original version 1 metadata remains recoverable.

[Domain, continuity and rollback](production.md). First installation documents preserve the names and results observed at the time.
