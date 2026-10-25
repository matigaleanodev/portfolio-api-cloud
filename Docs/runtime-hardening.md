# Runtime hardening

[Español](runtime-hardening.es.md) · 2026-10-25.

## Scope

I implemented phase 4 controls for the managed handler. Verification is local: simulated providers/storage, isolated package, assertions and CDK synthesis without lookups. This establishes neither deployment, effective permissions, identity behind real proxies nor model availability. The original API remains independent.

The six contracts remain. Deliberate differences are FAQ without AI, a friendly contact path, shared quotas, business startup returning 503 for invalid configuration, timeouts covering bodies and a server-generated x-request-id. createApplication retains a memory adapter for local composition; the deployable handler always injects shared control and never falls back to memory.

## Ingress and quotas

The handler requires an HTTP API v2 event, valid IP, configured API ID, its us-east-1 execute-api domain and the $default stage. It canonicalizes IPv6 and uses event sourceIp exclusively; X-Forwarded-For cannot change identity. The stack retains IAM and has no Function URL. Managed proxy chains and bypass paths still require AWS test validation in stage 9.

Counters live in one DynamoDB control table, without application data. Contact retains 5/hour/IP, independent subscription methods 10/hour/IP, and independent starters/chat 20/minute/IP. A window starts with the first attempt; the first excess attempt starts a penalty of the same duration. Blocked retries do not extend it.

Updates use consistent reads and conditional writes with random versions. Known conflicts trigger a reread, bounded to 32 attempts and the request deadline. Logical expiresAt checks do not depend on eventual physical TTL deletion. Keys use HMAC-SHA256 of the IP with a stable secret. Storage failures or persistent contention yield 503 before effects. SDKs do not retry ambiguous operations. [DynamoDB concurrency](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/BestPractices_ImplementingVersionControl.html).

## GLOBAL AI budget and sessions

The daily budget belongs to the entire bot: all people, sessions and Lambda instances of this implementation consume the same `ai:budget:<day>` key. There is no monetary budget per visitor. All active revisions must share this table; separate counters must not accidentally expand the allowance. The window is the Argentine civil day, changing at 03:00 UTC.

Before generation, availability and exact input count are checked through /v1/responses/input_tokens with the same model, input and text format. One atomic transaction reserves session, origin and maximum input cost plus 300 output tokens. Calculations use integer nanodollars and standard prices without cache discounts. No tools, Batch or Priority tier are used. Reservations are never refunded, including provider failure, invalid JSON or ambiguous outcomes. This conservatively limits generation admitted by this runtime at reviewed prices; it does not control taxes, infrastructure, other applications or the original API. [Counting](https://developers.openai.com/api/docs/guides/token-counting), [prices and snapshots](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

There are at most five AI answers per session and an additional five per origin/day, preventing unrestricted renewal by changing or omitting sessionId. Neither sessionId nor history establishes identity or usage: the server derives origin/day and session keys with HMAC. People sharing an IP share the additional allowance; different IPs still share the GLOBAL budget. This conservative protection needs no cookies, login or frontend changes; NAT/proxy impact must be checked in test.

A cached AI answer consumes a session/origin point with zero monetary reservation. FAQ is answered directly, including with history, without OpenAI or editorial reads. When AI is not admitted, chat continues with relevant FAQ or a friendly invitation to email contacto@matiasgaleano.dev or use the portfolio form. Visitors do not see budget amounts.

Private AI_DAILY_BUDGET_MICROUSD configuration sets the daily budget. Only gpt-4.1-mini and snapshot gpt-4.1-mini-2025-04-14 have reviewed prices: USD 0.40/1.60 per million input/output tokens, verified on 2026-10-25. AI_PRICING_VALID_UNTIL requires review within 31 days. Official documentation marks this family deprecated: availability/model choice needs review before real use; no provider was tested or model-family migration performed. Alerts cannot replace atomic admission.

## Deadlines and effects

The total deadline is at most 25 seconds, reduced when Lambda has less time left, including startup, secrets, parsing, quotas and providers. AsyncLocalStorage carries a per-request AbortSignal and internally generated requestId. Signals/listeners close when the request ends.

- DynamoDB control: 1.5 seconds per operation, SDK maxAttempts 1.
- Secrets Manager: 3 seconds, SDK maxAttempts 1.
- R2: 5 seconds including send and full body, SDK abort, stream destruction and a 512 KiB limit.
- AI: 15 seconds including counting, admission, generation and JSON body.
- Contact/subscriptions: 8 seconds; Resend receives signal and subscription timeout includes body.

POST, DELETE, email and ambiguous reservations are not retried. Subscription/OpenAI fetch reject redirects. Cancellation does not undo accepted writes, sent email or work already started at a provider; reservations remain consumed and operations are not replayed.

## Fallback, integrity and retention

The package includes fallback/chat-knowledge.v1.json and provenance.json: a real subset of curated facts already moved from portfolio-api@a0ef80fa, covering Foodly Notes, Modo Playa and Portfolio. It contains no fabricated posts and does not replace portfolio-cloud editorial publishing. generatedAt dates this packaged snapshot, not a new verification of historical facts. General renewal remains immediately before production.

Managed mode requires a v1 envelope, SHA-256 checksum, consistent dates and valid collections. It reads only its packaged file, without .generated or a sibling checkout. Build copies the versioned artifact without automatically refreshing its date. Maximum age is 30 days from generatedAt, with five minutes of future clock tolerance. This applies to remote, stale and local cache even when mtime is unchanged. Missing valid editorial knowledge retains 503; profile and FAQ need no R2 after valid startup.

AI cache has a five-minute logical expiry and at most 200 entries, with no persisted conversations. Responses use store:false and default tier. This disables Responses storage for retrieval but does not establish Zero Data Retention: OpenAI documents abuse-monitoring retention subject to its policies and account access. Private account settings were not checked. [Provider retention](https://developers.openai.com/api/docs/guides/your-data).

## Configuration and observability

Lambda environment contains non-secret CORS_ORIGIN, TRUSTED_API_ID, QUOTA_TABLE_NAME and RUNTIME_SECRET_ARN. An environment-specific Secrets Manager JSON value is validated before business requests. No .env loading.

| Secret field                                                   | Validation                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------- |
| RESEND_API_KEY, CONTACT_FROM_EMAIL, CONTACT_TO_EMAIL           | contact contract presence checks                                    |
| PORTFOLIO_CLOUD_API_URL                                        | HTTPS without credentials                                           |
| QUOTA_KEY_SECRET                                               | at least 32 characters; stable during active windows                |
| R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY | all or none; HTTPS endpoint                                         |
| OPENAI_API_KEY                                                 | optional; missing key disables generation                           |
| OPENAI_CHAT_MODEL                                              | reviewed price family; managed default is the snapshot              |
| AI_DAILY_BUDGET_MICROUSD                                       | positive integer required when AI is enabled; private configuration |
| AI_PRICING_VALID_UNTIL                                         | reviewed future date required when AI is enabled                    |

Secrets cache lasts at most five minutes. Refresh failure cannot serve an expired snapshot. Health remains liveness and works without secrets; it does not certify readiness. Invalid business startup returns generic 503.

JSON logs contain only bounded events, internal requestId, outcome, HTTP status, latency and tokens. No IP, sessionId, messages, history, emails, prompts, secrets or free-form errors. The stack retains logs for 14 days and defines error/throttling/duration alarms without actions or notifications. IAM allows only its logs, GetItem/PutItem/UpdateItem on its table and GetSecretValue on the exact ARN. The external boundary and secret are not created automatically.

## Verification and closure limits

Tests simulate competing compositions, expiry without physical cleanup, session/IP rotation, a global budget across visitors, prior reservation, caching, storage/startup failures, hanging bodies, cancellation and log privacy. Assertions check DynamoDB command content; the storage double does not replace managed DynamoDB tests. The package is checked outside the checkout with blocked network and a real fallback.

Before exposure, AWS preparation and stage 9 remain: effective boundary/roles/secret, live provider and token counting, IP/proxies, DynamoDB concurrency, account retention, operational alarms and recovery. Personal budget values stay outside public documentation. Phase 4 is implemented locally; managed validation and production are not claimed.
