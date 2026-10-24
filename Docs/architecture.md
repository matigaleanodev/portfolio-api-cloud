# Proposed architecture and tooling

[Español](architecture.es.md) · Proposal as of 2026-10-24. [Official sources](sources.md).

## Recommendation

Use **AWS CDK v2 with TypeScript** for the new repository. Preserve contracts, domain, content and providers. Choose the runtime by comparing adapted NestJS/Express with lightweight Node.js handlers using [the evaluation protocol](runtime-evaluation.md). Common infrastructure candidate: **one Lambda Event Function outside a VPC behind regional API Gateway HTTP API**, using a separate test endpoint. Six routes without a database/workers do not justify one function per endpoint.

For the Nest candidate, separate HTTP application setup from listen, cache Nest initialization per execution environment and test an Express-to-Lambda adapter compatible with Express 5. No adapter is selected or installed yet; the [Nest serverless guide](https://docs.nestjs.com/faq/serverless) informs that experiment. Start with tsc/decorator metadata; bundle/minify only after validating ZIP, optional imports and cold latency. Node 22/x86_64 provides the initial comparison against Docker. Compare 512/1024 MiB and ARM afterward; do not start with provisioned concurrency.

Preserve `/api/*`, status codes, DELETE bodies and errors. Own CORS in one layer, with explicit test/frontend origins, Content-Type and GET/POST/DELETE/OPTIONS. Verify headers on platform errors too. Preserve rawPath without doubling stage prefixes. Do not expose a parallel Function URL bypassing protection.

## Required runtime protections

- Shared Throttler storage (Nest) or an equivalent shared limiter (handlers) is necessary to preserve IP quotas across environments. A proportionate candidate is one DynamoDB on-demand table with atomic ephemeral counters and TTL, not an application database. Enforce logical expiration without relying on eventual TTL deletion. Keep 5/hour contact, 10/hour subscriptions and 20/minute chat. Use trustworthy event client IP rather than arbitrary X-Forwarded-For; derive stored identifiers and limit retention.
- Gateway route rate/burst settings and conservative reserved concurrency (proposed test value 5, subject to measurement) bound global pressure. Neither replaces per-IP quotas or creates a monetary cap. Budgets/alerts do not automatically stop spending. Agree a daily AI call budget and operational cutoff before public release.
- Proposed total deadline ≤25 s, Lambda ≤28 s, HTTP integration ≤30 s. Existing OpenAI timeout is 15 s and cloud upstream 8 s; R2/body/retries and Resend still need real cancellation/deadlines. Include cold start, secret loading and knowledge in the budget. If margins fail, reconsider ingress/runtime.
- Reuse clients/config per environment, but correctness must survive cold starts. Package an immutable traceable knowledge fallback and agree maximum stale age. Keep conversation history in requests/browser.
- Stage-specific configuration; propose one Secrets Manager JSON secret per environment, read by the runtime role and cached with bounded refresh. Never put values in Git/synth/outputs/CI inputs. Secret creation and population belong to each environment setup. R2 needs its own artifact-read credential; AWS S3 IAM does not grant access to that external provider.
- CloudWatch logs with 14-day test retention, native metrics, requestId correlation and existing bounded chat metrics. Alarm on errors/duration/throttling/usage. No bodies, emails or prompts; no new Loki exporter.

## Runtime and ingress alternatives

| Option | Concrete advantage | Tradeoff | Proposed position |
| --- | --- | --- | --- |
| Full Nest + Event Function + HTTP API | high reuse, inexpensive ingress, route/global throttling, familiar IAM | cold start, paid external waiting time, adapter and 30 s timeout | comparison baseline, gated by packaging/latency/abuse tests |
| Grouped lightweight Node.js handlers | fewer imports/DI/server layers and potentially faster startup | preserve validation/errors/quotas/composition/contracts | strong candidate; choose from measurement without rewriting the domain |
| Two functions: chat and everything else | separate concurrency/memory/secrets; chat cannot consume all contact slots | two packages/cold starts; shared limiter still required | split only if measured contention or permission needs justify it |
| One function per endpoint | fine isolation | six deployments without independent domains/traffic needs | reject initially |
| Regional REST API + Lambda | native WAF integration, extra controls and current response streaming | more expensive ingress and different timeout/quota behavior | choose if native WAF/streaming becomes a requirement |
| Classic Function URL | no separate gateway fee, streaming support | fewer ingress/protection/routing capabilities; still needs limiter | not first public option for paid-provider routes |
| Native Lambda Web Functions | direct HTTP server, multi-request environments, active CPU charging | Node 24, different memory/billing/resources; validate tooling/IAM/region | a real alternative to measure before final implementation selection |
| App Runner container | server/container reuse and less host administration | provisioned-memory floor plus active CPU | fallback if adaptation/cold latency fails; recheck current account eligibility |
| ECS Fargate + ALB | container/network control | continuous floor, ALB/network and additional operations | disproportionate to current requirements |
| Mixed runtime | targeted isolation | two operating models | only for a demonstrated incompatibility |

HTTP API has a 30 s integration maximum and 10 MB payload; synchronous buffered Lambda invocation is limited to 6 MB. Keep the application's tighter 16 KiB body cap. Event Function's 15-minute runtime limit does not extend HTTP API. REST API **currently supports response streaming**, while HTTP API does not. [HTTP quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html), [Lambda quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html), [REST streaming](https://docs.aws.amazon.com/apigateway/latest/developerguide/response-transfer-mode.html).

Current official docs describe native Lambda Web Functions, Node 24 HTTP servers and a CloudFormation WebFunction resource. This is distinct from Lambda Web Adapter and classic Function URLs. Pricing includes active CPU and memory over environment lifetime. Environment residence, selected CDK support, trusted-IP controls and account/region eligibility are not verified here. Event Function GB-second rates must not be reused for its estimate. [Overview](https://docs.aws.amazon.com/lambda/latest/dg/web-functions.html), [runtime](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-runtimes.html), [pricing](https://aws.amazon.com/lambda/pricing/).

No private database/internal service currently requires VPC connectivity. Public egress serves Resend, OpenAI, R2 and the existing cloud API. Staying outside VPC avoids introducing a NAT Gateway. Recalculate network/endpoints if a private requirement appears.

## Tool comparison

| Criterion | TypeScript CDK | SAM | Serverless Framework v4 | Current SST |
| --- | --- | --- | --- | --- |
| Definition/state | TypeScript→CloudFormation; no separate state file | YAML transform→CloudFormation | serverless.yml→CloudFormation | TypeScript, Pulumi engine/providers, state in own bucket |
| Nest reuse | package/adapter; no Nest rewrite | same runtime/tests | same runtime; review plugins/versions | server support still needs validation |
| Local development | tests/synth without lookups; SAM local for compatible assembly | integrated sam build/local, Docker | invoke local/offline plugins; not full parity | useful live dev may use real cloud resources |
| CI/OIDC | explicit bootstrap/publishing/execution/runtime identities | existing portfolio-cloud convention | viable OIDC plus CLI authentication/licensing | viable OIDC plus different state/backend permissions |
| IAM/config | constructs/assertions, scoped roles, separate secrets | explicit roles/boundaries already familiar | review generated/plugin IAM | review components/backend privileges |
| Environments/recovery | separate stacks/names, versions/change sets; resource-supported drift | separate stacks/change sets | stages/stacks, optional plugins/dashboard | stages/state/locks/encryption secret/refresh |
| Observability | chosen AWS services, no mandatory SaaS | same AWS foundation | optional separately priced Dashboard | optional separately priced Console |
| License/tool cost | Apache-2.0, no framework license fee | Apache-2.0, no framework license fee | v4 terms, free under USD 2 M threshold, paid above; CLI login/license in CI | MIT, no Pulumi account required; Console free tier/resource pricing |
| Personal fit | operational CDK experience, explicit IAM, shared TypeScript | one fewer ecosystem toolchain | insufficient advantage over finalists | new state/operating model for a small API |

Tool choice does not remove AWS service charges. CDK is not a local AWS emulator. CloudFormation drift detection covers supported properties/resources, not all drift or external R2 data; stack rollback does not restore deleted data.

**Finalists: CDK and SAM. Preferred option: CDK.** Reasons: maintainer experience, TypeScript shared with Nest, explicit policies and infrastructure assertions without mandatory SaaS. Existing SAM remains independent. Infrastructure is defined independently and reproducibly in this repository.

**Costs of this choice:** S3/ECR/role bootstrap needs resource and permission design; CLI/library/construct versions add maintenance; Nest bundling is not automatic; new roles must respect account boundaries and access restrictions. Execution-role boundaries do not automatically constrain runtime roles.

**Prefer SAM instead** if a single ecosystem toolchain/minimal template matters more or the operational overhead of CDK bootstrap is not justified. Do not migrate portfolio-cloud solely for uniformity. Serverless v4's added licensing/authentication has no demonstrated benefit here; do not choose unmaintained v3 to avoid it. Current SST is not CDK and does not require Pulumi Cloud, but its separate state model does not solve a proven need.

Free Serverless CLI does not imply free Dashboard. SST Console is optional: current reference includes free workspaces up to 350 active resources, then resource-based charges; recheck terms at adoption. [Serverless pricing](https://www.serverless.com/pricing), [SST Console](https://sst.dev/docs/console/), [SST state](https://sst.dev/docs/state/).
