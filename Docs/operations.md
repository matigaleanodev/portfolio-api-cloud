# Operations and recovery

[Español](operations.es.md)

CDK accepts `stage=production` in `us-east-1`. Physical names `portfolio-api-cloud-test` and `PortfolioApiCloudTest*` identify the single installation and are retained to avoid recreation. Templates and policies live in [packages/infrastructure/](../packages/infrastructure).

## Non-sensitive configuration

It arrives as environment variables of each function from CloudFormation parameters; the runtime does not load `.env`. The application plan takes the values from variables of the `production` GitHub environment:

| Variable                                 | Use                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL` | Verified contact sender and recipient.                                          |
| `AI_DAILY_BUDGET_MICROUSD`               | Global daily AI budget.                                                         |
| `AI_PRICING_VALID_UNTIL`                 | Pricing review validity (31 days at most); renewing it requires a deployment.   |
| `R2_ENDPOINT`, `R2_BUCKET`               | R2 endpoint and media bucket (knowledge, editorial state and OG images).        |
| `R2_SUBSCRIBERS_BUCKET`                  | Private subscriber bucket; CloudFormation and the runtime require it to differ. |
| `MEDIA_BASE_URL`, `BLOG_FROM_EMAIL`      | Public media URL and blog sender.                                               |
| `CERTIFICATE_ARN`, `ALARM_TOPIC_ARN`     | Domain ACM certificate and alarm SNS topic (empty disables them).               |

Repository variables enable each workflow (`PRODUCTION_PLAN_ENABLED`, `PRODUCTION_FOUNDATION_ENABLED`, `PRODUCTION_EXECUTE_ENABLED`, `PARAMETERS_SYNC_ENABLED`, `MERGE_WORKFLOW_ENABLED`) and name the delivery roles (`PRODUCTION_AWS_ROLE_ARN`, `PRODUCTION_CDK_DEPLOY_ROLE_ARN`, `PRODUCTION_EXECUTION_ROLE_ARN`). Environment key names are in [configuration.ts](../packages/contracts/src/configuration.ts) and [editorial.ts](../packages/contracts/src/editorial.ts).

## Sensitive configuration

Each function reads one standard SSM `SecureString` parameter holding a JSON with sensitive keys only. The name arrives through `RUNTIME_PARAMETER_NAME`, and the runtime rejects names outside [configuration.ts](../packages/contracts/src/configuration.ts) without querying SSM.

| Parameter                          | Keys                                                                                     | Functions                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `/portfolio/prod/api`              | `QUOTA_KEY_SECRET`, `ORIGIN_VERIFY_SECRET`, `RESEND_CONTACT_API_KEY`, `R2_SUBSCRIBERS_*` | `api`                                                      |
| `/portfolio/prod/chat`             | `QUOTA_KEY_SECRET`, `ORIGIN_VERIFY_SECRET`, `OPENAI_API_KEY`, `R2_KNOWLEDGE_*`           | `chat`; `api` for chat variants                            |
| `/portfolio/prod/editorial`        | `R2_MEDIA_ACCESS_KEY_ID`, `R2_MEDIA_SECRET_ACCESS_KEY`                                   | `process-release`, `generate-og`, `publish-chat-knowledge` |
| `/portfolio/prod/notifications`    | `R2_SUBSCRIBERS_*`, `RESEND_BLOG_API_KEY`                                                | `notify-post`                                              |
| `/portfolio/validation/{api,chat}` | Synthetic values for fictitious providers                                                | Validation variant                                         |

`api` also receives `CHAT_PARAMETER_NAME` and loads the chat parameter only when serving a chat variant, which is why its role can read it too. `QUOTA_KEY_SECRET` and `ORIGIN_VERIFY_SECRET` are published to api and chat from the same value. Each function requires only its required keys from the [catalog](../packages/contracts/src/functions.ts); `OPENAI_API_KEY`, `ORIGIN_VERIFY_SECRET` and knowledge credentials are optional and degrade to FAQ/fallback. `QUOTA_KEY_SECRET` needs at least 32 characters and must stay stable while windows are active. Non-sensitive keys inside the parameter are ignored.

Reading uses `GetParameter` with decryption, no retries and a 3-second deadline. The validated value is cached for up to five minutes; a failed refresh does not reuse the expired snapshot and returns 503 without exposing details.

Parameters use the AWS managed key `aws/ssm`, with no monthly cost. Implication: any principal in the account with `ssm:GetParameter` on the parameter can decrypt it, including broad read-only roles; runtime roles restrict `kms:Decrypt` to SSM and the exact ARN of their parameters.

Current limitation: R2 keys are separated by purpose (knowledge, media, subscribers), but they may point to the same Cloudflare token. While a single token is used, parameter segmentation does not isolate R2 access; scoping tokens per bucket (for example, read-only media for chat) is a possible improvement.

### Source of truth and updates

GitHub Actions Secrets in the `production-parameters` environment are the only source: `RESEND_CONTACT_API_KEY`, `RESEND_BLOG_API_KEY`, `OPENAI_API_KEY`, `QUOTA_KEY_SECRET`, `ORIGIN_VERIFY_SECRET`, `R2_KNOWLEDGE_ACCESS_KEY_ID`, `R2_KNOWLEDGE_SECRET_ACCESS_KEY`, `R2_MEDIA_ACCESS_KEY_ID`, `R2_MEDIA_SECRET_ACCESS_KEY`, `R2_SUBSCRIBERS_ACCESS_KEY_ID` and `R2_SUBSCRIBERS_SECRET_ACCESS_KEY`. Parameters are not edited in the console.

[sync-parameters.yml](../.github/workflows/sync-parameters.yml) runs only through `workflow_dispatch` from `main`, with `target` `production` or `validation`. It validates every secret and payload before authenticating and writing, and always publishes complete payloads with `--overwrite`; its OIDC role can neither read nor decrypt. An empty key stops the run without writes, so a key cannot be omitted to disable a capability: to turn off paid AI, let `AI_PRICING_VALID_UNTIL` expire or lower the budget. Functions pick up the new value within five minutes, without a deployment.

To load or rotate a secret from VS Code:

1. With the GitHub Actions extension, open the **Settings** panel, the `production-parameters` environment and its **Secrets** section to create or replace the value. Alternative from the integrated terminal: `gh secret set NAME --env production-parameters`, which reads the value from standard input and keeps it out of shell history.
2. Run the **Sync runtime parameters** workflow on `main` from the extension's Workflows view, or with `gh workflow run sync-parameters.yml --ref main -f target=production`, and approve the environment.
3. Check the published version of each parameter in the run summary.

Do not store values in checkout files or in non-secret environment variables.

## Protected delivery

1. Integrate through a PR into `dev` and promote to `main` with successful CI. `verify` is required; [merge.yml](../.github/workflows/merge.yml) requires the full reviewed SHA and real `matigaleanodev` identity, using `MERGE_USER_TOKEN` from the `merge` environment, without App fallback or PR/CI bypass.
2. Select `api-assembly-<sha>-<run>-<attempt>` from successful push CI and a revision promoted to `main`. Compare run, ID, digest and inventory. Retention is 30 days; retain a verified copy for later recovery.
3. [plan-foundation-production.yml](../.github/workflows/plan-foundation-production.yml) prepares foundation, roles and boundaries separately. It requires `previous_runtime_secret_arn`: the ARN of the secret a previous runtime still reads, or `none` to grant nothing.
4. [plan-production.yml](../.github/workflows/plan-production.yml) takes the `production` environment variables, verifies without decrypting that the four production parameters exist as `SecureString` and prepares the changeset from the assembly without recompiling the runtime. The receipt publishes CloudFormation parameters as `sha256`, and its digest binds execution to those values.
5. Review template, assets and receipt. [build-and-deploy.yml](../.github/workflows/build-and-deploy.yml) verifies them again and executes only the reviewed StackId/ChangeSetId and digest.

Production environments admit `main`; `*_ENABLED` flags stay disabled outside their operation. OIDC restricts owner, repository and environment. Planning, publishing, CloudFormation execution, parameter sync and runtime use separate roles. Pushes and tags do not deploy automatically.

`recover_bundle.py` validates current artifacts and historical `test-assembly-*` without relaxing hashes or safe extraction.

## Ingress, observability and capacity

The domain uses regional ACM and Cloudflare with strict TLS. A hostname-specific rule overwrites `x-portfolio-origin`; the runtime validates the secret and Cloudflare ranges before accepting `CF-Connecting-IP`. `DisableDefaultEndpoint` allows execute-api to be closed after checking the domain; `PublicAccess` controls IAM or anonymous access to business routes.

JSON logs retain 14 days and omit bodies, prompts, emails, IPs, sessions and secrets. Three alarms, within the CloudWatch free tier:

| Alarm               | Metric                                                                       | Trigger                          |
| ------------------- | ---------------------------------------------------------------------------- | -------------------------------- |
| `http-errors`       | Single custom metric of 5xx responses from `api` and `chat`                  | ≥1 in 2 of 3 five-minute periods |
| `account-throttles` | `AWS/Lambda Throttles` without dimension: the whole account                  | ≥1 in 2 of 3 five-minute periods |
| `account-errors`    | `AWS/Lambda Errors` without dimension: crash, timeout or OOM of any function | ≥1 in 1 five-minute period       |

The two account alarms are shared: other projects in the same account should not duplicate them. The HTTP handler does not rethrow, so `Errors` reflects platform failures. There are no stage access logs: to tell API Gateway 429s from application 429s, compare the `AWS/ApiGateway 4xx` metric with the 429s logged by the functions. `AlarmTopicArn` connects SNS; also verify subscription confirmation and delivery.

API Gateway limits stage rate/burst and DynamoDB maintains quotas and reservations. Functions have no reserved concurrency and share the account's regional concurrency quota with other projects; splitting functions adds no capacity. Reserving concurrency only makes sense with a quota that leaves unreserved headroom.

## Migration, deployment and recovery

Generic procedure to move from a previous runtime (secret in Secrets Manager and editorial publication in another stack) to this architecture, or to repeat a deployment. Every step with effects requires explicit authorization.

1. Apply `delivery-access.template.json` with an administrator role: it includes the parameter sync role, trusted only by the `production-parameters` environment and limited to writing the declared parameters.
2. Configure the eleven secrets in the `production-parameters` environment (`main` only, required reviewer), the non-sensitive variables in `production` and the repository variables.
3. Integrate the revision into `main`: sync only runs from there.
4. Run `sync-parameters.yml` with `target=production` (and `validation` if that variant will be used).
5. Plan and apply foundation with `previous_runtime_secret_arn` set to the previous secret's ARN while the deployed runtime reads it; `none` if there is no previous runtime. Foundation updates the boundaries: parameter reads for the runtime and decrypt-free verification for the plan role.
6. Plan the application (the guard requires the parameters) and execute the reviewed changeset. Editorial functions have no invoker until the cutover.
7. Validate: health and OPTIONS through the custom domain (they verify origin by reading SSM), chat FAQ without the model, starters with GET and HEAD, disposable contact and subscribe/unsubscribe, an empty event to each editorial function (400 without effects) and logs without `AccessDenied`.
8. Editorial cutover between publications: confirm no publication is running and change the workflow function-name variables in `portfolio` (`PORTFOLIO_CLOUD_PROCESS_RELEASE_FUNCTION_NAME` and `PORTFOLIO_CLOUD_PUBLISH_CHAT_KNOWLEDGE_FUNCTION_NAME`) to `portfolio-api-cloud-test-process-release` and `portfolio-api-cloud-test-publish-chat-knowledge`. With the same media bucket, `state/posts.json` and R2 keys are preserved and state continues.

Rollback:

- Editorial: point the workflow variables back to the previous functions.
- Application: execute the previous artifact's changeset through the same process. It only works while the previous secret remains readable and foundation grants access to it (step 5).
- Traffic: restore the proxied CNAME to the retained previous destination, verifying destination and availability. Reverting DNS does not revert data, subscriptions or sends.
- Partial notify: review `lastFailure` in `state/posts.json` and the logs before reinvoking; reinvoking blindly can resend notifications (see [limitations](api.md#idempotency-and-limitations)).

Do not recompile an old revision or treat CloudFormation rollback as data restoration. Preserve the table, reservations and parameters; do not reset the budget to recover service.

Later retirement, manual and as separate decisions: apply foundation with `previous_runtime_secret_arn=none` and delete the previous Secrets Manager secret once it is no longer needed for rollback; retire the previous editorial stack and its role once no workflow invokes it. The NestJS API and EC2 are independent alternatives; retiring them requires migrating the other applications that depend on them.

## Maintenance

- Before `AI_PRICING_VALID_UNTIL`, review [official pricing](https://developers.openai.com/api/docs/pricing) and the only model's limits. If they change, update the conservative reservation in `shared-control.ts`, tests and artifact; then renew validity in the `production` environment variable (up to 31 days) and deploy. Do not extend the date without reviewing prices.
- Renew the fallback from the knowledge artifact generated by `portfolio`, validating schema, checksum and maximum age of 30 days. Replace it through PR/CI without stamping old content with a new date.
- Rotate credentials by updating the GitHub Secret and running the sync; keep `QUOTA_KEY_SECRET` stable unless resetting active windows is acceptable.
- Review [Cloudflare ranges](https://www.cloudflare.com/ips/), permissions and dependencies. Manifests, lock and code are the version reference.

[Architecture](architecture.md) · [Decisions](decisions.md)
