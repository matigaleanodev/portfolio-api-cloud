# HTTP and editorial contracts

[Español](api.es.md)

Public base: `https://api.matiasgaleano.dev/api`. Routes are case-insensitive and accept a trailing slash; the `chat` function serves canonical chat routes and the `api` function serves their variants (for example `/api/Chat/`) with the same contract and quota. HEAD shares health and starters, with an empty body and corresponding quota. Unsupported methods or routes return 404.

## Operations

| Method and route                   | Input                                          | Success                                       | Per-IP quota         |
| ---------------------------------- | ---------------------------------------------- | --------------------------------------------- | -------------------- |
| `GET /health`                      | No body                                        | 200, `{ "status": "ok" }`                     | No application quota |
| `POST /contact`                    | `name`, `email`, `message`, optional `company` | 204, no body                                  | 5/h                  |
| `GET /chat/starters`               | No body                                        | 200, `suggestedQuestions`                     | 20/min               |
| `POST /chat`                       | `message`, optional `sessionId` and `history`  | 201, `answer`, `suggestedQuestions`, `source` | 20/min               |
| `POST /subscriptions`              | `email`                                        | 200, `message` and optional `email`           | 10/h                 |
| `DELETE /subscriptions`            | `email` in JSON body                           | 200, same schema as subscribe                 | 10/h                 |
| `POST /subscriptions/one-click?t=` | `List-Unsubscribe=One-Click` form              | 200, `{ "message": "Unsubscribed" }`          | 60/min               |

Subscribe, unsubscribe, one-click, chat and starters have independent quotas, defined in [quotas.ts](../packages/contracts/src/quotas.ts). Health checks liveness; it does not certify providers or readiness.

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

Subscribe and unsubscribe write or delete `subscribers/<email>.json` in the private R2 bucket, within a total of 8 seconds. Responses: `Subscribed successfully` or `Unsubscribed successfully` with `email`; `Already subscribed` or `Already unsubscribed` without `email`. An email invalid for storage returns 400, an R2 failure returns 502 and cancellation or deadline 503. Emails are not logged.

Chat returns source `faq`, `ai` or `fallback`. FAQs do not generate AI. History travels in the request; sessionId neither authenticates nor creates persistence. AI admits five responses per session and five per origin/Argentine day, in addition to HTTP quota and global budget. Cached AI consumes allowance with zero monetary reservation. People sharing an IP share the origin allowance. Without admission, chat offers FAQs/contact; editorial questions without valid knowledge retain 503.

## One-click unsubscribe

`/subscriptions/one-click?t=<identifier>` is the `List-Unsubscribe` target ([RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.txt)). The identifier is opaque, random (32 bytes, base64url), specific to one subscription and does not expire: it stops working once that subscription is removed, and a new subscription gets another one.

- `POST` accepts `application/x-www-form-urlencoded` or `multipart/form-data` with `List-Unsubscribe=One-Click`, without cookies, sessions or redirects. A well-formed request returns 200 whether or not the subscription exists; repeating it has no effect. A malformed or repeated identifier, another value or content type returns 400. A storage failure returns 502 or 503.
- `GET` and `HEAD` never change data: they return 303 to the manual page `https://matiasgaleano.dev/blog/unsubscribe`.

The message links manual unsubscription as `/blog/unsubscribe#email=<address>`: the fragment never reaches the server and the page uses it to prefill. The frontend that reads it must be published before sending notifications with this template. Anyone receiving a forwarded message can use its unsubscribe link. Earlier `?email=` links and `DELETE /subscriptions` are preserved.

## Editorial events

Editorial functions have no HTTP routes. The `portfolio` publication workflow invokes `process-release` and `publish-chat-knowledge` with `aws lambda invoke` (resource policy limited to its release role); `process-release` invokes `generate-og` and `notify-post`. Types live in [editorial.ts](../packages/contracts/src/editorial.ts) and R2 keys in [storage.ts](../packages/contracts/src/storage.ts).

Each function returns `{ statusCode, body }` with a JSON body. Event validation happens before reading configuration: a 400 has no effects. A configuration, R2 or provider failure that is not turned into a response ends as a Lambda function error.

| Function                 | Event                                                                                                                                                                          | Responses                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `process-release`        | `{ manifest }` or the raw manifest: `generatedAt`, `siteUrl`, `content.posts[]` with `slug`, `title`, `date`, `canonicalPath` and optional `excerpt` (passed to `notify-post`) | 400 invalid manifest or future dates (Argentine time); 200 `No new posts`; 200 `processedPosts`; 500 partial with `processedPosts` and `failedPosts`                        |
| `generate-og`            | `slug`, `title`, optional `excerpt`, `date`, `tags`                                                                                                                            | 400 without title or slug; 200 with the public `url` of `og/<slug>.png`                                                                                                     |
| `notify-post`            | `title`, `url`, optional `excerpt`, `date`, `tags`                                                                                                                             | 400 without title or URL, or future date; 200 with `recipients` (accepted by the provider); if any is not accepted, the invocation fails with `NotificationIncompleteError` |
| `publish-chat-knowledge` | `{ artifact, release?, source? }` or the raw artifact: `generatedAt`, `projects?`, `posts?`                                                                                    | 400 invalid artifact or future dates; 200 with `key`, `generatedAt` and `contentHash`                                                                                       |

`publish-chat-knowledge` writes the v1 envelope to `artifacts/chat/knowledge.json`: `version`, `generatedAt`, `source` (defaults to `portfolio` and `.generated/chat/knowledge.json`), optional `release`, `contentHash` (`sha256:`) and `knowledge`. It overwrites the same key.

### Idempotency and limitations

`process-release` stores `ogGeneratedAt`, `notifiedAt` and `lastFailure` per post in `state/posts.json`. A post with `notifiedAt` is not reprocessed; a stage with its mark is skipped, so reinvoking resumes the pending stage. Each stage is retried up to `RELEASE_STAGE_MAX_ATTEMPTS` (2 by default), except an incomplete notification: it is not repeated within the same invocation; reinvoke to continue. Every invocation, including the first, only happens when the remaining time of `process-release` covers that stage's timeout, 2 s for startup and transport and 11 s to save the state; the wait for the response stops at that reserve (`AbortError`), without cancelling the invoked function or marking the stage. A stage that does not fit is reported with `attempts: 0` and `insufficient_time`, as are the posts after it (only the first is recorded in the state), and is resumed by reinvoking. `ogGeneratedAt` is saved as soon as `generate-og` finishes, before notifying; if the notification no longer fits, it is saved with the failure in a single write. `lastFailure` holds stage, time, attempts and a sanitized code, never free provider text. The legacy format (a slug list) is read as processed.

#### Per-recipient delivery

`notify-post` records each post and recipient pair in the control table (no addresses: HMAC of the email; no expiry) and sends one at a time with a Resend `Idempotency-Key`. A post is identified by the host and path of its URL.

| State       | Meaning                                                                                        | Next invocation                              |
| ----------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `sent`      | The provider accepted the message                                                              | Not resent                                   |
| `rejected`  | Definite rejection (4xx) with no earlier doubt, or claim released unsent (`insufficient_time`) | Retries with a new key                       |
| `sending`   | Claimed by one run (60 s)                                                                      | Waits; once expired, handled as `uncertain`  |
| `uncertain` | Timeout, network error, 5xx, 408, 409 or no `id`                                               | Within 23 h repeats the same key and message |
| `review`    | Doubt unresolved after 23 h, or conflicting key                                                | Not resent; needs manual review              |

Limits of the guarantee:

- This is not exactly-once delivery. Deduplicating an ambiguous attempt relies on the 24 h window of [idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys); outside it the system chooses not to resend.
- `sent` means accepted, not delivered: bounces, suppressions and filtering happen later.
- If the message changes between attempts of a doubtful send (title, excerpt, date or the deployed template), the provider rejects the key and the record moves to `review`.
- Restoring the table to an earlier point can lose marks and allow resends.
- A permanently rejected or `review` address keeps the post incomplete until resolved. Meanwhile each release returns 500, the post keeps being sent to later subscribers, and subsequent steps of the invoking workflow depend on how it handles that failure.
- Unsubscribing deletes the record; identifier index cleanup is best effort and an orphan object holding the address can remain in the private bucket. Storage deletion is not conditional: a one-click request concurrent with an unsubscribe and resubscribe of the same address could delete the new one.
- Each invocation sends at most what fits its timeout (capped at 5 sends per second) and stops on provider quotas or rejected credentials; later invocations continue with what is pending. It only claims a send with 16 s remaining and only calls the provider with 14 s (8 s of waiting and 6 s to record the result). If the budget runs out after claiming, it releases the claim without sending; with an earlier doubt, the record stays `uncertain` and keeps its 23 h window.

- `state/posts.json` is updated with read-modify-write and no lock: concurrent `process-release` invocations can overwrite each other. The invoking workflow must serialize publications.

[HTTP implementation](../packages/runtime/src/http/router.ts) · [Tests](../test) · [Operations](operations.md)
