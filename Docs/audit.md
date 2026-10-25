# Complete API audit

[Español](audit.es.md) · 2026-10-24. Read-only inspection of source, versioned configuration and metadata; no business flows were executed.

## Evidence and limitations

The audit pins the inspected commits to preserve traceability of contracts and dependencies.

| Repository | Inspected local HEAD | Local branch | Live GitHub main |
| --- | --- | --- | --- |
| portfolio-api | a0ef80fa9f82d1cea5a31425a63ab0a344338c56 | fix/aws-deployment-identity | 7d535b5713807a28081523c573445320bf1ad42e |
| portfolio | c1eac3492a54933f5c99540a3b4f61d0e70938cd | fix/aws-deployment-identity | 34856adee211f57ddb32a8573b9af9578d73235b |
| portfolio-cloud | 4c0b1735dde0759a9dbef5625aae7788386e9210 | feat/aws-oidc-migration | bdc1510dbc8dca8765a69d278f65aa3ce6e7902b |

Local origin/main refs were stale. GitHub main was queried without fetching. The remote comparison from local HEAD to main contained only workflows for API/frontend, and workflows/READMEs/template for cloud. References below pin the inspected commits. The EC2 deployed image SHA was not verified.

**Observed infrastructure:** in the personal account, us-east-1, one running t3.micro with 3/3 checks, Amazon Linux 2023, required IMDSv2 and stop/termination protection. Its root EBS volume is 8 GiB and unencrypted. CloudFormation shows portfolio-cloud-prod in UPDATE_COMPLETE, updated 2026-10-11 19:40:43 AR, with drift NOT_CHECKED. Its 16 resources include six functions, six roles, HTTP API/stage and two invocation permissions. CDKToolkit was absent from the queried active-stack listing; this observation is limited to that region. Actual billing belongs to the private record; the [public model](costs.md) uses hypothetical scenarios.

**Unverified:** per-route traffic, latency, CPU/credits, EBS class, running image digest, effective application configuration, current Cloudflare rules, SSM state and effective IAM permissions. No `.env`, secret values, sensitive parameters or subscriber records were opened. The workspace AWS access report dated 2026-10-11 was treated as historical context.

## Modules and contracts

Global `/api` prefix, 16 KiB JSON/urlencoded bodies and DTO validation with transformation, whitelist and rejection of extra fields. CORS uses CORS_ORIGIN; `*` reflects all origins. There is no application authentication, JWT, server session or admin endpoint. Chat history is client input, not identity.

Sources: [bootstrap](https://github.com/matigaleanodev/portfolio-api/blob/a0ef80fa9f82d1cea5a31425a63ab0a344338c56/src/main.ts#L12), [modules/global guard](https://github.com/matigaleanodev/portfolio-api/blob/a0ef80fa9f82d1cea5a31425a63ab0a344338c56/src/app.module.ts#L10).

| Method/path | Input → output | Current protection | Consumer and migration verification |
| --- | --- | --- | --- |
| GET /api/health | none → 200 `{status:"ok"}` | throttle excluded | deployment/operations; response and real initialization failures |
| POST /api/contact | name 2–100, email ≤150, message 10–5000, optional company ≤200 → empty 204 | 5/hour/IP, company honeypot skips sending | contact form; mocked send, 400/429/500 and no real email in audit |
| GET /api/chat/starters | none → 200 `{suggestedQuestions:string[]}` | 20/minute/IP | widget; JSON shape, content and CORS |
| POST /api/chat | nonblank message ≤500, optional sessionId ≤100, optional history ≤6 user/assistant messages ≤1500 each → **201** `{answer,suggestedQuestions,source}` | 20/minute/IP | widget; history, FAQ/AI/fallback, 400/413/429/503 and 201 status |
| POST /api/subscriptions | trim/lowercase email ≤320 → 200 `{message,email?}` | 10/hour/IP | blog form; upstream mocks, normalization and error mapping |
| DELETE /api/subscriptions | same JSON **request body** → 200 `{message,email?}` | 10/hour/IP | unsubscribe UI; preserve DELETE body and errors |

Route overrides replace the default 60/minute configuration; it is not a second independent quota. Throttler's storage is process-local. CORS and honeypots do not authenticate non-browser callers.

Sources: [health](https://github.com/matigaleanodev/portfolio-api/blob/a0ef80fa9f82d1cea5a31425a63ab0a344338c56/src/app.controller.ts), [contact controller/DTO](https://github.com/matigaleanodev/portfolio-api/tree/a0ef80fa9f82d1cea5a31425a63ab0a344338c56/src/contact), [chat controller/DTO](https://github.com/matigaleanodev/portfolio-api/tree/a0ef80fa9f82d1cea5a31425a63ab0a344338c56/src/chat), [subscriptions](https://github.com/matigaleanodev/portfolio-api/tree/a0ef80fa9f82d1cea5a31425a63ab0a344338c56/src/subscriptions).

## Functional inventory

| Implementation | Verified dependencies/behavior | Preserve, migration risk and verification |
| --- | --- | --- |
| ContactService, src/contact/contact.service.ts:15 | Resend SDK, awaited email, Argentina timestamp; SDK error or exception becomes controlled 500 | preserve empty 204/text; no explicit application timeout or idempotency key. Mock ambiguous timeout and avoid automatic POST retries |
| ChatService, src/chat/chat.service.ts:63 | scope filtering, FAQ on history-free requests, context selection, optional AI rephrasing and fallback | FAQ can call AI, so source=faq does not mean free. Preserve contract; HTTP 201 alone does not prove provider success |
| OpenAiService, src/chat/openai.service.ts:87 | native fetch to /v1/responses, no OpenAI SDK; configurable model, gpt-4.1-mini default, 15 s timeout, 300 output-token cap, JSON | no tools, function calling, embeddings, vector database or streaming. Preserve prompts/context/history and test fetch/parse/provider failures with mocks |
| ChatKnowledgeRepository, src/chat/chat-knowledge.repository.ts:112 | S3 SDK against Cloudflare R2, validated v1 envelope/SHA-256 or local artifact; single-flight per process | default 5 min TTL, stale-on-error without maximum age, then filesystem. Cold environments lack stale cache; package a valid fallback and test corruption/outage |
| KnowledgeService/publication, src/chat/knowledge.service.ts:60 | curated profile/FAQ/cloud plus editorial artifact, intent ranking, roughly four context items, Argentina publication-day filtering | professional answers can bypass R2. Preserve project isolation, dates, links and integrity across cold/warm runs |
| AI cache, src/chat/openai.service.ts:170 | 200-entry Map, 24 h TTL, hash includes prompt/context/history/links/suggestions | ephemeral per environment, not a conversation store. Fragmentation can increase OpenAI spend; measure hits before considering Redis |
| FaqService, src/chat/faq.service.ts:66 | versioned data; incrementUsage is a no-op | no usage persistence to migrate; preserve matching and suggestions |
| SubscriptionsService, src/subscriptions/subscriptions.service.ts:37 | HTTP to configured cloud base + /subscriptions, 8 s timeout; 4xx→400, 5xx/invalid success→502, network→503 | preserve mapping, including upstream 429 becoming 400; no new persistence; test without production upstream |
| src/chat/chat-metrics.ts:34 | Nest stdout logs; bounded JSON outcome/duration/token fields, no visitor text/identity for chat metrics | no API Prometheus exporter or versioned alarm definitions; use bounded CloudWatch logs, correlation and metrics; review other error logs for PII |

[Complete source tree](https://github.com/matigaleanodev/portfolio-api/tree/a0ef80fa9f82d1cea5a31425a63ab0a344338c56/src).

### AI provider persistence

The application does not persist conversations in a database or use previous_response_id, but its Responses request omits `store`. OpenAI Docs describes default 30-day Response-object retention with `store:false` available; effective account policy was not checked. No application persistence does not imply no provider persistence. Make retention an explicit migration decision instead of silently changing behavior. [Official state/retention docs](https://developers.openai.com/api/docs/guides/conversation-state).

## Data, background execution and filesystem

No ORM, MongoDB, SQL, schema migrations, connection pool or application database appears in runtime code/dependencies. No present requirement for RDS, RDS Proxy or a VPC. No uploads, multipart, runtime file writes, cron, queues, workers or intentional post-response tasks were found. Abort timers and caches are not background workers.

The filesystem is read/stat only for `.generated/chat/knowledge.json`; development can also read `../portfolio/.generated/chat/knowledge.json`. A Lambda ZIP has no sibling repo. Docker copies dist, not this artifact: do not assume the deployed image contains a fallback.

The R2 timeout wraps SDK send with a promise timeout but does not abort it, and body reading happens afterward. Network work may remain outstanding after fallback. Connection/body/retries need real cancellation and an end-to-end deadline. ConfigModule loads `.env` by default; exclude it from packaging and use ignoreEnvFile plus mocks in tests. No suites were executed in this audit.

## Repository boundaries and consumers

[Frontend ApiService](https://github.com/matigaleanodev/portfolio/blob/c1eac3492a54933f5c99540a3b4f61d0e70938cd/src/app/services/api.service.ts) calls the five business routes through Angular HttpClient. `src/environments/environment.ts:2` fixes the production base URL. Chat persists messages in localStorage; chat-history.ts limits history to six turns and keeps JSON under 15 KiB. No SSE/WebSocket consumer exists. A URL change needs a frontend build/deploy or a domain cutover.

[Cloud SAM template](https://github.com/matigaleanodev/portfolio-cloud/blob/4c0b1735dde0759a9dbef5625aae7788386e9210/template.yaml) declares subscribe, unsubscribe, generate-og, notify-post, process-release and publish-chat-knowledge. Subscribe/unsubscribe use HTTP API; process-release invokes OG/notify. There is no declared EventBridge schedule in that template. The frontend workflow runs daily at 12:17 UTC and invokes release/knowledge publication. Do not duplicate it here.

`portfolio-cloud/src/shared/subscribers.ts` owns private R2 JSON records keyed by email, separate from public media. Create uses Head+Put and delete Head+Delete; create is not an atomic conditional transaction, so concurrent creates can both observe absence. Inspected subscribe/unsubscribe handlers do not send email; publication notifications belong to notify-post. Keep one persistence owner and avoid shadow writes/replays during validation. Its public upstream can bypass this facade's rate limit; protection must be reviewed with that owner.

## Configuration references, no secret values

| Group | Names | Classification |
| --- | --- | --- |
| HTTP/runtime | NODE_ENV, PORT, CORS_ORIGIN, TRUST_PROXY | configuration; validate origin and trusted client-IP interpretation |
| Contact | RESEND_API_KEY; CONTACT_FROM_EMAIL, CONTACT_TO_EMAIL | secret API key; do not publish recipient configuration unnecessarily |
| AI | OPENAI_API_KEY, OPENAI_CHAT_MODEL | secret key; code default model only, effective override unverified |
| Cloud upstream | PORTFOLIO_CLOUD_API_URL | configuration URL |
| Knowledge | R2_ENDPOINT, R2_REGION, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, CHAT_KNOWLEDGE_OBJECT_KEY, CHAT_KNOWLEDGE_CACHE_TTL_MS | R2 credentials secret; others configuration |
| Existing API CI | AWS_REGION, AWS_ROLE_ARN, EC2_INSTANCE_ID; GHCR_TOKEN, DEV_SYNC_PAT | AWS variables/GitHub token references only |

runtime.config.ts:143 requires contact settings and cloud URL at startup. OpenAI is optional. Production requires complete R2 configuration or a primary-path local artifact. The actual production configuration was not inspected.

## Packaging, deployment, monitoring and tests

Resolved lockfile versions: Nest core/platform-express 11.1.13, Express 5.2.1, throttler 6.5.0, Resend 6.9.1, AWS S3 SDK 3.1004.0, TypeScript 5.9.3. Docker uses Node 22 Alpine. No native renderer/system binary is required by this API; cloud's resvg must not be copied. ZIP/adaptor compatibility, decorator metadata, optional imports and TLS need package-level validation.

Existing CI runs lint (with --fix), unit and e2e tests on PRs to main. Deploy runs on main push/manual, uses OIDC+SSM, GHCR SHA/latest tags and account/time bounds; it has no explicit dependency on the separate CI result. The workspace deploy-app.sh allowlists three apps, changes IMAGE, runs Compose and verifies image/health. GHCR cleanup keeps only three SHA tags: insufficient as the sole months-long recovery strategy. The legacy dev-sync uses PAT and force fallback; the new repo does not copy that policy.

Versioned EC2 bootstrap describes Cloudflare Tunnel→internal Traefik→container and shared Grafana/Loki/Promtail. This is declared configuration, not host inspection. Health only checks the process response, not Resend/R2/OpenAI/upstream.

Inspected tests cover config/DTOs, mocked Resend contact, mocked subscription fetch/error mapping, FAQ/context, knowledge integrity/cache/fallback, Argentina dates, conversation/profile isolation and bounded metrics. Supertest e2e tests partially mock modules. **They were not run** and do not establish future API Gateway event handling, trusted IPs, distributed throttling, IAM, ZIP correctness or cold latency. Historical roadmap counts are not current test results.

## Ranked migration risks

| Impact | Finding | Required treatment/evidence |
| --- | --- | --- |
| High | memory-only IP quotas fail under scaling/restarts; CORS is not auth | shared limiter, trustworthy event IP, concurrency/spoof tests; independently review exposed upstream |
| High | real email/subscription tests duplicate side effects | mock defaults, isolated test data, no automatic POST retries or shadow writes |
| High | partial R2/contact/chat time bounds | total deadline below ingress limit, real cancellation, bounded body/retries and ambiguous-result tests |
| High | missing cold fallback during R2 outage | packaged versioned artifact, checksum/date checks and explicit maximum staleness |
| Medium | new IAM/bootstrap design incomplete; existing roles project-specific | scoped pipeline/execution/runtime roles and boundaries; no SAM/SSM role reuse or admin defaults |
| Medium | fragmented cache changes provider cost/cold latency | measure hits, billed duration and tokens before adding shared cache |
| Medium | shallow health/missing per-route metrics | body-free logging, latency/errors/timeouts/429/fallback/cost and test thresholds |
| Medium | recovery depends on preserved images/config/shared EC2 | pin image and verify restore plan; do not stop EC2 after Portfolio alone |

## Subsequent local implementation evidence

The audit above describes the initial inspection. The [first local experiment](local-runtime.md) reuses that commit and executes its unit tests and differential contracts with simulated providers. It adds no AWS, billing or production evidence.
