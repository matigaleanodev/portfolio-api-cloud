# Decision log

[Español](decisions.es.md) · 2026-10-24.

## Closed decisions

- Migrate all three APIs on the shared server to serverless. This repository implements only Portfolio's alternative.
- Retain the original NestJS implementations as technical references and independent alternatives.
- Keep all three current APIs operational throughout migration. After completion and verified recovery, stop EC2 without terminating or dismantling it and retain a recoverable backup.
- Preserve Portfolio's six contracts and behavior, with configurable URL or routing without rewriting the frontend.
- Keep static delivery in portfolio and existing portfolio-cloud responsibilities.
- Build this API's initial structure with TypeScript handlers. The Nest comparison remains technical evidence.
- Protect main/dev with PRs, CI and workflow merges. The first delivery is integrated into dev; main belongs to a later stage.
- Use only personal AWS in us-east-1.

## ADR-001 — Infrastructure as code

Status: **closed; TypeScript AWS CDK v2 with local stack implemented**.

CDK supports TypeScript infrastructure, IAM review and resource tests. SAM remains the closest alternative through portfolio-cloud continuity; that repository keeps its existing tool. The local definition sets retention, boundary and separate roles; effective role/bootstrap provisioning/review remains pending. Tooling does not decide runtime. [Architecture](architecture.md).

## ADR-002 — TypeScript handler implementation

Status: **initial-structure direction defined**.

Grouped handlers with explicit composition, retaining domain, DTOs, validation, errors and limits. The existing API remains independent. The local experiment compared that composition against adapted Nest with simulated providers. Its purpose is to document differences, not decide whether to migrate. [Results](local-runtime.md).

Lambda Event Function with HTTP API outside a VPC is the proposed infrastructure baseline. Splitting chat requires demonstrated contention or permission needs. Production publication requires distributed protections and actual environment validation.

## ADR-003 — Integration and delivery

Status: **policy defined; App merges validated in PR #2 and #3**.

main/dev require PRs, CI, resolved conversations and deletion/force protection. Work branches use feat/fix. Current configuration integrates with matigaleanodev's actual identity; the App transition was installed through PR #5 without removing PR/CI. [Integration](integration.md). PR #1 is integrated into dev, update restrictions were restored and the initial exception is consumed.

CI separates documentation, application and infrastructure; verify remains required. The application is tested on Node 24.22.1 LTS without requiring a placeholder stack. These changes have local validation and passing CI in PR #4; each later head requires fresh validation. [CI/CD](ci-cd.md) and [rules](branch-protection.md).

## ADR-004 — Provenance and per-application interchangeability

Status: **criterion defined; local evidence recorded**.

The comparison reused portfolio-api@a0ef80fa9f82d1cea5a31425a63ab0a344338c56 with per-file hashes without changing its working tree. [Provenance](runtime-evidence.md).

Interchangeability means replacing this same API's implementation while retaining HTTP and behavior. URL or routing may require configuration. It does not mean interchanging unrelated API domains, creating a generic platform or guaranteeing multicloud parity.

## ADR-005 — Bot knowledge before production

Status: **delivery order defined; refresh pending**.

Refreshing bot data about the professional profile and projects is the final step before production deployment. Scope includes curated/editorial sources, prompts or FAQs dependent on those facts, the published artifact and packaged fallback. Verify provenance, integrity, dates, links and representative answers while retaining the previous recoverable version. Final-package checks belong to this same step; production deployment follows it. [Sequence](migration.md).

## Open operational decisions

Identity/NAT and daily-budget impact in AWS test, model availability and price review; latency/cost thresholds; maximum stale age and provider retention; test isolation; roles/bootstrap; artifact retention; URL/routing and cutover runbook. Actual billing and private plans are unverified. Public scenarios are hypothetical.

## ADR-006 — Local foundation and independent validation

Status: **implemented locally; partial coverage**.

The initial health slice had four runtime modules, explicit composition, isolated CORS configuration and provider-free health. Node 24.22.1 LTS is the target, verified through isolated execution. Strict TypeScript, JS compiler 6.0.3, native test runner and zero runtime dependencies: that slice required no framework, bundler or SDK. The contact increment adds the application dependencies documented in ADR-008 and ADR-010.

CI separates application from CDK and retains verify as its required aggregate check. An absent stack skips only infrastructure; it cannot skip types/build/tests for a present application. The new foundation does not use discarded prototype code. [Implementation, limits and provenance](application.md).

## ADR-007 — Actual integration identity

Status: **policy implemented; mechanism activated**.

New automated merges must be attributed to matigaleanodev through a user credential, validating login/ID/type and merged_by. An installation token attributes the operation to the App and does not satisfy this policy. PRs, CI, reviewed SHA and workflow remain required; no bot fallback or cosmetic metadata changes.

The transition was installed through PR #5 with one final App merge, after which only the update actor changed to User 99203645, PR-only. PR/CI retains zero bypass and the environment remains limited to main/dev. The account can also merge through the UI; operational policy retains mandatory workflow integration. [Status, alternatives and limits](integration.md).

## ADR-008 — Contact through public dependencies

Status: **local slice implemented; hardening pending**.

Contact preserves the audited project-owned DTO, text, date and honeypot with explicit composition. body-parser, class-validator and class-transformer are dependencies. Validators are called directly without copying ValidationPipe or its helpers. Two arrays change error messages and prototype changes from silent removal to rejection: explicit, tested differences. Resend uses its official SDK with mocked transport in tests rather than maintaining an SDK implementation.

## ADR-009 — Project MIT without an attribution file

Status: **implemented; supersedes the initial notice consolidation**.

LICENSE contains MIT text and only Matias Galeano's authorship. Adapted Throttler code, Nest helpers and the manual Resend client are replaced by public dependencies and application-owned integration. Original licenses remain within distributed packages; no NOTICE or manual attribution inventory. The pinned source remains UNLICENSED; this repository's own implementation adopts MIT by its copyright holder's decision.

## ADR-010 — Quota maintained by rate-limiter-flexible

Status: **implemented locally; distributed quota pending**.

rate-limiter-flexible 11.2.3 is pinned: published on 2026-10-17, recent activity, non-archived repository, adoption indicated by 11.3 million npm downloads in the checked month and no production dependencies. RateLimiterMemory is used through its API without maintaining an algorithm copy. [Dated evidence and sources](contact.md).

Contact retains 5/h/IP, one-hour blocking from the sixth attempt, sourceIp, per-method quota and existing headers. Its fixed window starts at the first attempt and releases all points when expired; per-hit decrements and Throttler 6.5.0's timer bug are not preserved. Blocked attempts do not extend the penalty and one IP does not affect another's expiry. Tests explicitly cover these differences. Historical 429 JSON stays for compatibility without a Nest dependency.

Resend 6.34.1 replaces the manual client. React types are development-only; HeadersInit comes from Node fetch types without DOM or skipLibCheck. Production configuration requires NODE_ENV=production to avoid detailed SDK logging. Transport mocks are loaded after the network guard; no real emails.

This selection does not solve quota sharing across Lambda environments: distribution/atomicity, actual proxies, deadline/cancellation and secrets remain required before exposure. No infrastructure is added in this slice. [Contract and remaining work](contact.md).

## ADR-011 — Vitest and local test stack

Status: **implemented and locally verified**. Vitest 5.0.5 replaces node:test/unittest suites with Spanish Given/When/Then QA titles. CDK CLI 2.1146.1, library 2.274.0 and constructs 10.8.1 are development-only. One IAM-isolated test stack, external boundary and separate roles; synth without lookups. [Tests](testing.md), [stack](infrastructure.md). Bootstrap, role/secret provisioning and deployment were not executed.

## ADR-012 — Subscriptions with native HTTP

Status: **local slice implemented; managed integration pending**. POST/DELETE retain JSON bodies, normalization, 200 responses and exact error mappings from the pinned source. Explicit native fetch and AbortSignal.timeout(8000), no new dependency. Independent 10/h/IP quotas reuse RateLimiterMemory; contact remains 5/h/IP. The three accepted contact validation differences are declared here too. Lazy configuration/500 and omitted free-form logs are explicit differences; total deadline/distribution remain pending. [Contract, evidence and provenance](subscriptions.md).

## ADR-013 — Chat with pinned domain and explicit providers

Status: **implemented and locally verified**. Required a0ef80fa starters/chat modules, content and prompts are retained without refresh. Direct/nested DTO uses reflect-metadata; R2 repository uses current pinned S3 SDK; OpenAI fetch is preserved. Independent 20/min/IP quotas reuse the local fixed-window/block decision. Original R2 timeout, stale and AI retention limits are preserved/tested; free-form logs are omitted while bounded metrics remain. [Contracts, differences, provenance and stage 4 prerequisites](chat.md). Local evidence does not establish AWS deployment/integration.

Chat professional location is corrected specifically to Posadas, Misiones, Argentina, with an explicit difference from the pinned SHA. FAQ and context also include the professional email contacto@matiasgaleano.dev from one shared fact. Other content retains its previous scope; general editorial renewal remains immediately before production. [Details and historical references](chat.md).

## ADR-014 — Bounded AI use and FAQ continuity

Status: **implemented locally; managed validation pending**.

Chat will prioritize FAQ without AI rephrasing and allow at most five AI answers per session. When the session allowance or global daily budget is exhausted, it will continue with a relevant FAQ; otherwise it will kindly answer: “Para seguir con una consulta más específica, podés escribirme a contacto@matiasgaleano.dev”. Visitors will not see budget amounts or internal quota details.

The daily budget is configured per environment outside public content. Each paid request must atomically reserve its maximum cost before dispatch, including input, output, model, prices and concurrent calls. Reservations with ambiguous outcomes must not be released as if no cost occurred. If shared control or configuration cannot establish availability, AI must not be invoked. Spend alerts do not replace this cutoff. [OpenAI Docs](https://developers.openai.com/api/docs/guides/terraform/rate-limits-and-spend).

sessionId and history come from the client and currently establish neither a session nor consumption. Session lifetime is bounded by the Argentine day and server-derived origin; an additional five/IP/day prevents renewal by changing sessionId. People behind NAT share this protection; its impact requires managed validation. IP quotas and the global budget remain independent controls. The managed handler implements direct FAQ, shared quotas and atomic global/session/origin reservations; [phase 4](runtime-hardening.md) records details and limitations. The email is already part of curated knowledge and FAQ.

## ADR-015 — Shared controls, deadline and packaged fallback

Status: **implemented locally; not deployed**. DynamoDB CAS for quotas and a transaction for AI admission; 25-second total deadline with cancellation; validated secret and bounded refresh; v1 fallback with checksum and maximum age; logs without PII and alarms without actions. DynamoDB and Secrets Manager SDKs are pinned at 3.1156.0. The memory limiter remains only a local composition adapter. [Decisions, configuration and exit criteria](runtime-hardening.md).

## ADR-016 — Reviewable delivery and assembly recovery

Status: **locally implemented and verified; managed preparation pending**.

I kept one grouped function and the existing CDK. The assembly is retained with a hash inventory and revision, without rebuilding during recovery. I separated trust/PassRole/boundaries by responsibility in the [delivery design](deployment-design.md). Final administrative policies are materialized and verified in phase 7; production, secrets and shared controls are not restored from the bundle.

## ADR-017 — Preparation from a promoted artifact and scoped foundation

Status: **reviewable local implementation; managed activation pending**.

Pinned runner/actions with Node24 while retaining PR/verify/human merge. Preparation uses an integrated CI artifact with verified digest and a SHA promoted to main, without rebuilding. Materialized responsibility-specific roles/boundaries/bootstrap with V2 API administration disabled by default: initial regional scope does not establish isolation from the existing production API. [Audit, alternatives and pending criteria](test-operations.md). Verified local recovery does not close the managed rehearsal or production return.

One AWS installation retains existing test names and starts validation with simulated providers; no parallel production stack or local AWS deployment emulation is added. Regional API Gateway scope is chosen for the personal account, with effects on existing APIs explicit in [operations](test-operations.md). main and v0.1.0 do not automatically deploy.

## ADR-018 — Isolated validation and execution of reviewed change sets

Status: **implemented locally; no provisioning or managed validation**. Dedicated entrypoint/asset with fictitious providers and real Secrets/Dynamo, normal package without doubles, four scenarios fixed in reviewed bytes and one installation. Foundation and application preparation use Actions; separate execution narrows the session to exact ARNs and a live template/asset receipt. Initial OIDC trust requires an existing external identity; there is no local bootstrap or inferred elevation. [Implementation, policies, prerequisites and plan](managed-validation.md).

## ADR-019 — Luna and promotion of the existing installation

Real package, one model, conservative admission, direct gateway and reversible recovery. [Detalles](production.md).
