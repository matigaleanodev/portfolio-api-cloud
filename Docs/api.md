# HTTP and editorial contracts

[Español](api.es.md)

Public base: `https://api.matiasgaleano.dev/api`. Routes are case-insensitive and accept a trailing slash; the `chat` function serves canonical chat routes and the `api` function serves their variants (for example `/api/Chat/`) with the same contract and quota. HEAD shares health and starters, with an empty body and corresponding quota. Unsupported methods or routes return 404.

## Operations

| Method and route        | Input                                          | Success                                       | Per-IP quota         |
| ----------------------- | ---------------------------------------------- | --------------------------------------------- | -------------------- |
| `GET /health`           | No body                                        | 200, `{ "status": "ok" }`                     | No application quota |
| `POST /contact`         | `name`, `email`, `message`, optional `company` | 204, no body                                  | 5/h                  |
| `GET /chat/starters`    | No body                                        | 200, `suggestedQuestions`                     | 20/min               |
| `POST /chat`            | `message`, optional `sessionId` and `history`  | 201, `answer`, `suggestedQuestions`, `source` | 20/min               |
| `POST /subscriptions`   | `email`                                        | 200, `message` and optional `email`           | 10/h                 |
| `DELETE /subscriptions` | `email` in JSON body                           | 200, same schema as subscribe                 | 10/h                 |

Subscribe, unsubscribe, chat and starters have independent quotas, defined in [quotas.ts](../packages/contracts/src/quotas.ts). Health checks liveness; it does not certify providers or readiness.

## Validation

- Contact: name is 2–100 characters, a valid email is at most 150 and message is 10–5000. Email is not normalized. Company allows omission, null or a string up to 200; a nonempty string triggers the honeypot and returns 204 without sending, after DTO validation.
- Subscriptions: string email with trimming and lowercasing. The DTO limits length to 320; `IsEmail` retains additional restrictions.
- Chat: nonblank message up to 500 UTF-16 units; optional/null sessionId up to 100. Optional/null history accepts six entries with user/assistant role and nonblank content up to 1500. Text is not trimmed.
- Unknown fields, including nested ones, are rejected. Root arrays receive 400 with `body must be an object`; an extra prototype field is rejected. Differences from Nest are declared in reference tests.

## Transport, quotas and errors

The parser supports JSON, forms, base64, charsets and compression compatible with body-parser. The limit is **16 KiB after decoding or decompression**. Parsing precedes CORS, security and quotas: its errors do not consume quota or include those headers. Enabled preflight returns 204; DTO/provider errors consume quota.

Invalid DTOs return 400 with array message, error and statusCode; invalid JSON returns 400; oversized bodies return 413. Quotas include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` and `Retry-After` as applicable. Reset means remaining seconds. A window starts on the first attempt; exceeding it blocks for its duration without extension on retries.

The 429 retains `message: "ThrottlerException: Too Many Requests"`. Managed ingress rejection returns 403; unavailable common configuration or shared control returns 503. Contact waits for its provider and returns a controlled 500 on failure. HEAD and 204 have no body; 204 omits Content-Type.

Every response produced inside the request scope carries `x-request-id`, including the 403 for an invalid origin secret and the deadline 503. Ingress 403s raised before the scope (invalid version, IP, API ID, domain, stage or visitor) do not.

## Subscriptions and chat

Subscribe and unsubscribe write or delete `subscribers/<email>.json` in the private R2 bucket, within 8 seconds and without retries. Responses: `Subscribed successfully` or `Unsubscribed successfully` with `email`; `Already subscribed` or `Already unsubscribed` without `email`. An email invalid for storage returns 400, an R2 failure returns 502 and cancellation or deadline 503. Emails are not logged.

Chat returns source `faq`, `ai` or `fallback`. FAQs do not generate AI. History travels in the request; sessionId neither authenticates nor creates persistence. AI admits five responses per session and five per origin/Argentine day, in addition to HTTP quota and global budget. Cached AI consumes allowance with zero monetary reservation. People sharing an IP share the origin allowance. Without admission, chat offers FAQs/contact; editorial questions without valid knowledge retain 503.

## Editorial events

Editorial functions have no HTTP routes. The `portfolio` publication workflow invokes `process-release` and `publish-chat-knowledge` with `aws lambda invoke` (resource policy limited to its release role); `process-release` invokes `generate-og` and `notify-post`. Types live in [editorial.ts](../packages/contracts/src/editorial.ts) and R2 keys in [storage.ts](../packages/contracts/src/storage.ts).

Each function returns `{ statusCode, body }` with a JSON body. Event validation happens before reading configuration: a 400 has no effects. A configuration, R2 or provider failure that is not turned into a response ends as a Lambda function error.

| Function                 | Event                                                                                                                         | Responses                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `process-release`        | `{ manifest }` or the raw manifest: `generatedAt`, `siteUrl`, `content.posts[]` with `slug`, `title`, `date`, `canonicalPath` | 400 invalid manifest or future dates (Argentine time); 200 `No new posts`; 200 `processedPosts`; 500 partial with `processedPosts` and `failedPosts` |
| `generate-og`            | `slug`, `title`, optional `excerpt`, `date`, `tags`                                                                           | 400 without title or slug; 200 with the public `url` of `og/<slug>.png`                                                                              |
| `notify-post`            | `title`, `url`, optional `excerpt`, `date`, `tags`                                                                            | 400 without title or URL, or future date; 200 with `recipients`; a provider rejection fails the invocation                                           |
| `publish-chat-knowledge` | `{ artifact, release?, source? }` or the raw artifact: `generatedAt`, `projects?`, `posts?`                                   | 400 invalid artifact or future dates; 200 with `key`, `generatedAt` and `contentHash`                                                                |

`publish-chat-knowledge` writes the v1 envelope to `artifacts/chat/knowledge.json`: `version`, `generatedAt`, `source` (defaults to `portfolio` and `.generated/chat/knowledge.json`), optional `release`, `contentHash` (`sha256:`) and `knowledge`. It overwrites the same key.

### Idempotency and limitations

`process-release` stores `ogGeneratedAt`, `notifiedAt` and `lastFailure` per post in `state/posts.json`. A post with `notifiedAt` is not reprocessed; a stage with its mark is skipped, so reinvoking resumes the pending stage. Each stage is retried up to `RELEASE_STAGE_MAX_ATTEMPTS` (2 by default). `lastFailure` holds stage, time, attempts and a sanitized code, never free provider text. The legacy format (a slug list) is read as processed.

- `notify-post` does not deduplicate per recipient: if one send fails after others succeeded, the post stays without `notifiedAt` and a retry (including the internal one) resends to everyone.
- `state/posts.json` is updated with read-modify-write and no lock: concurrent `process-release` invocations can overwrite each other. The invoking workflow must serialize publications.

[HTTP implementation](../packages/runtime/src/http/router.ts) · [Tests](../test) · [Operations](operations.md)
