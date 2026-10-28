# Operations and recovery

[Español](operations.es.md)

CDK accepts `stage=production` in `us-east-1`. Physical names `portfolio-api-cloud-test` and `PortfolioApiCloudTest*` identify the single installation and are retained to avoid recreation. Templates and policies live in [infra/](../infra).

## Configuration

Lambda exports `dist/handler.handler` and receives `CORS_ORIGIN`, `TRUSTED_API_ID`, `TRUSTED_CUSTOM_DOMAIN`, `QUOTA_TABLE_NAME` and `RUNTIME_SECRET_ARN`. It does not load `.env`.

The JSON secret groups contact (`RESEND_API_KEY`, `CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL`), subscriptions (HTTPS `PORTFOLIO_CLOUD_API_URL`), derivation (`QUOTA_KEY_SECRET`, at least 32 characters) and origin (`ORIGIN_VERIFY_SECRET`). R2 requires complete HTTPS endpoint, bucket, access key and secret key. AI uses `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL`, `AI_DAILY_BUDGET_MICROUSD` and `AI_PRICING_VALID_UNTIL`.

Common configuration is validated and cached for up to five minutes; failed refresh does not reuse an expired snapshot. Invalid or expired AI configuration disables paid generation only. Keep `QUOTA_KEY_SECRET` stable during active windows and preserve counters/reservations when refreshing configuration.

## Protected delivery

1. Integrate through a PR into `dev` and promote to `main` with successful CI. `verify` is required; [merge.yml](../.github/workflows/merge.yml) requires the full reviewed SHA and real `matigaleanodev` identity. It uses `MERGE_USER_TOKEN` from the `merge` environment, without App fallback or PR/CI bypass.
2. Select `api-assembly-<sha>-<run>-<attempt>` from successful push CI and a revision promoted to main. Compare run, ID, digest and inventory. Retention is 30 days; retain a verified copy for later recovery.
3. [plan-production.yml](../.github/workflows/plan-production.yml) prepares the changeset from that assembly without recompiling runtime. [plan-foundation-production.yml](../.github/workflows/plan-foundation-production.yml) prepares foundation and roles/boundaries separately.
4. Review template, assets and receipt. **build and deploy**, [build-and-deploy.yml](../.github/workflows/build-and-deploy.yml), verifies them again and executes only the reviewed StackId/ChangeSetId and digest.

Production environments admit main; `PRODUCTION_*_ENABLED` flags stay disabled outside their operation. OIDC restricts owner, repository and environment. Planning, publishing, CloudFormation execution and runtime use separate roles. Pushes and tags do not deploy automatically.

`recover_bundle.py` validates current artifacts and historical `test-assembly-*` without relaxing hashes or safe extraction. `validation-secret.yml` creates fictitious configuration only; simulated providers have a separate package.

## Ingress and observability

The domain uses regional ACM and Cloudflare with strict TLS. A hostname-specific rule overwrites `x-portfolio-origin`; the handler validates secret and Cloudflare ranges before accepting `CF-Connecting-IP`. `DisableDefaultEndpoint` allows execute-api to be closed after checking the domain; `PublicAccess` controls IAM or anonymous access.

API Gateway limits rate/burst; DynamoDB maintains quotas and reservations. Lambda has no reserved concurrency. JSON logs retain 14 days and omit bodies, prompts, emails, IPs, sessions and secrets. Four alarms cover Lambda errors, throttles, duration and controlled HTTP 5xx. `AlarmTopicArn` connects SNS; also verify subscription confirmation and notification delivery.

## Maintenance and recovery

- Before `AI_PRICING_VALID_UNTIL`, review [official pricing](https://developers.openai.com/api/docs/pricing) and the only model's limits. If they change, update the conservative reservation in `shared-control.ts`, tests and artifact; then renew validity in Secrets Manager for up to 31 days. Do not extend the date without reviewing prices.
- Renew fallback from the editorial artifact published by `portfolio-cloud`, validating schema, checksum and maximum age of 30 days. Replace through PR/CI without stamping old content with a new date. Cache and stale knowledge obey that age.
- Review [Cloudflare ranges](https://www.cloudflare.com/ips/), permissions and dependencies. The manifest/lock and code are the version reference.

To recover traffic, preserve the frontend URL and restore the proxied CNAME to the retained previous tunnel. Verify destination and availability before operating; check health with the frontend Origin/User-Agent and affected contracts.

For code or infrastructure, recover the reviewed assembly and inventory and prepare another changeset through the same process. Do not recompile an old revision or treat CloudFormation rollback as data restoration. Preserve the table, reservations and secrets; do not reset the budget to recover service.

The NestJS API and EC2 are independent alternatives. Retiring them requires migrating the other applications and verifying recovery while keeping the instance and recoverable backup. The AI budget does not limit other applications, infrastructure, taxes or the complete bill.
