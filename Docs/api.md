# HTTP contracts

[Español](api.es.md)

Public base: `https://api.matiasgaleano.dev/api`. Routes are case-insensitive and accept a trailing slash. HEAD shares health and starters, with an empty body and corresponding quota. Unsupported methods or routes return 404.

## Operations

| Method and route        | Input                                          | Success                                       | Per-IP quota         |
| ----------------------- | ---------------------------------------------- | --------------------------------------------- | -------------------- |
| `GET /health`           | No body                                        | 200, `{ "status": "ok" }`                     | No application quota |
| `POST /contact`         | `name`, `email`, `message`, optional `company` | 204, no body                                  | 5/h                  |
| `GET /chat/starters`    | No body                                        | 200, `suggestedQuestions`                     | 20/min               |
| `POST /chat`            | `message`, optional `sessionId` and `history`  | 201, `answer`, `suggestedQuestions`, `source` | 20/min               |
| `POST /subscriptions`   | `email`                                        | 200, `message` and optional `email`           | 10/h                 |
| `DELETE /subscriptions` | `email` in JSON body                           | 200, same schema as subscribe                 | 10/h                 |

Subscribe, unsubscribe, chat and starters have independent quotas. Health checks liveness; it does not certify providers or readiness.

## Validation

- Contact: name is 2–100 characters, a valid email is at most 150 and message is 10–5000. Email is not normalized. Company allows omission, null or a string up to 200; a nonempty string triggers the honeypot and returns 204 without sending, after DTO validation.
- Subscriptions: string email with trimming and lowercasing. The DTO limits length to 320; `IsEmail` retains additional restrictions.
- Chat: nonblank message up to 500 UTF-16 units; optional/null sessionId up to 100. Optional/null history accepts six entries with user/assistant role and nonblank content up to 1500. Text is not trimmed.
- Unknown fields, including nested ones, are rejected. Root arrays receive 400 with `body must be an object`; an extra prototype field is rejected. Differences from Nest are declared in reference tests.

## Transport, quotas and errors

The parser supports JSON, forms, base64, charsets and compression compatible with body-parser. The limit is **16 KiB after decoding or decompression**. Parsing precedes CORS, security and quotas: its errors do not consume quota or include those headers. Enabled preflight returns 204; DTO/provider errors consume quota.

Invalid DTOs return 400 with array message, error and statusCode; invalid JSON returns 400; oversized bodies return 413. Quotas include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` and `Retry-After` as applicable. Reset means remaining seconds. A window starts on the first attempt; exceeding it blocks for its duration without extension on retries.

The 429 retains `message: "ThrottlerException: Too Many Requests"`. Managed ingress rejection returns 403; unavailable common configuration or shared control returns 503. Contact waits for its provider and returns a controlled 500 on failure. HEAD and 204 have no body; 204 omits Content-Type.

## Subscriptions and chat

Subscriptions retain only string message and optional email from upstream. Valid 2xx is presented as 200; 2xx with invalid JSON/schema returns 502. Upstream 4xx, including 429, maps to 400; other failed statuses to 502 and connection/cancellation to 503. An empty upstream error omits the error field. Failed JSON reading after 2xx returns 502 if not canceled; the deadline can terminate it with 503. POST and DELETE are not retried.

Chat returns source `faq`, `ai` or `fallback`. FAQs do not generate AI. History travels in the request; sessionId neither authenticates nor creates persistence. AI admits five responses per session and five per origin/Argentine day, in addition to HTTP quota and global budget. Cached AI consumes allowance with zero monetary reservation. People sharing an IP share the origin allowance. Without admission, chat offers FAQs/contact; editorial questions without valid knowledge retain 503.

[HTTP implementation](../src/application.ts) · [Tests](../test) · [Operations](operations.md)
