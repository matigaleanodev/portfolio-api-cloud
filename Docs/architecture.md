# Architecture

[Español](architecture.es.md)

Cloudflare receives traffic for `api.matiasgaleano.dev`; API Gateway HTTP API splits the six operations between two HTTP functions. Four editorial functions without routes complete blog publication. All use Node.js 24 outside a VPC.

## Packages

npm workspaces with a single root lock and the same version in every package:

| Package                   | Contents                                                                                                                | May import                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `packages/contracts`      | Routes, quotas, function catalog, configuration and parameter names, editorial events and R2 keys. No dependencies.     | Nothing (not even Node modules)             |
| `packages/runtime`        | HTTP, domain, providers, handlers, validation variant, editorial fallback, OG fonts and development utilities (`dev/`). | `contracts` and its production dependencies |
| `packages/infrastructure` | CDK app and stack, foundation and delivery-access templates.                                                            | `contracts`, `aws-cdk-lib`, `constructs`    |

`npm run boundaries` rejects relative imports across packages, dependencies outside each allowlist, `contracts` imports without an explicit export and misaligned versions. Infrastructure and runtime share only contracts.

## Functions

| Function                 | Artifact      | Trigger                                               | Responsibility                                                                            |
| ------------------------ | ------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `api`                    | `api`         | `$default` route and `OPTIONS /{proxy+}`              | Health, contact, subscribe/unsubscribe, preflight, 404 and non-canonical chat variants.   |
| `chat`                   | `chat`        | `POST /api/chat`, `GET` and `HEAD /api/chat/starters` | Chat starters and replies; any other route returns 404 without reading configuration.     |
| `process-release`        | `editorial`   | `portfolio` publication workflow                      | Detects new manifest posts and invokes generate-og and notify-post with idempotent state. |
| `generate-og`            | `og` (x86_64) | `process-release`                                     | Renders the OG image with resvg and uploads it to R2.                                     |
| `notify-post`            | `editorial`   | `process-release`                                     | Sends the post notification to each subscriber through Resend.                            |
| `publish-chat-knowledge` | `editorial`   | `portfolio` publication workflow                      | Publishes the versioned chat knowledge envelope to R2.                                    |

The catalog lives in [functions.ts](../packages/contracts/src/functions.ts): physical name, handler, artifact, memory, timeout, architecture, required/optional keys and SSM parameter. All are ARM64 except `generate-og`, which keeps x86_64 for resvg's native binary. Each function has its own role with the runtime boundary and an explicit retained log group.

API Gateway selects by exact route and method: canonical chat routes go to `chat` (HEAD needs its own route) and everything else falls into `$default`. That is why `api` also contains the chat router and serves variants such as `/api/Chat/`, loading the chat parameter lazily. In-memory caches (knowledge and responses) are per execution environment: variants served by `api` do not share them with `chat`.

## HTTP chain

Outside Middy, a request-scope layer validates ingress (version 2.0, IP, API ID, domain and stage → 403), resolves the Cloudflare visitor, opens the context with a deadline and `AbortSignal`, adds `x-request-id` and logs `http_request`. Inside, `middy({ timeoutEarlyInMillis: 0 })` applies:

1. `serializer` (registered first so its `after` and `onError` run last).
2. `runtimeConfig`: reads the SSM parameter, verifies the origin secret on the custom domain (OPTIONS and health included) and composes services; short-circuits with 403 or 503.
3. `body`: body-parser-compatible parsing; its errors short-circuit without CORS, security headers or quota.
4. `cors`: OPTIONS returns 204 and short-circuits before security headers.
5. `security`: security headers.
6. Handler: regex router from contracts (quota → DTO → service) and serialization (HEAD/204 without body).

A `before` that returns a response skips the handler and every `after`, so those short-circuits arrive already serialized. `onError` returns a controlled 500 without rethrowing, and an unreachable quota store becomes 503.

## Ingress and controls

On the custom domain the runtime requires a Cloudflare origin, the `x-portfolio-origin` secret and a valid IP before trusting `CF-Connecting-IP`; it ignores `X-Forwarded-For`. CORS is handled in the application and does not authenticate.

DynamoDB uses conditional operations for quotas and transactions for AI admission; `api` and `chat` share table, prefixes and HMAC keys, so splitting functions does not duplicate quotas. Logical expiration does not depend on TTL. Conversations are not persisted.

Each request has up to 25 seconds, reduced according to Lambda's remaining time. Sends, subscriptions and ambiguous reservations are not retried; canceling transport does not undo accepted effects.

## Knowledge and editorial publication

FAQs answer directly. `chat` reads from R2 the envelope published by `publish-chat-knowledge`, with caching and a versioned fallback inside the artifact; the envelope validates schema, checksum and maximum age. Missing R2 configuration uses the fallback; incomplete or invalid configuration leaves chat at 503 without affecting health, contact or subscriptions.

Generation uses only GPT-6 Luna through Responses, with `store=false`, no tools and no retries, and requires valid pricing, session/origin allowances and a prior global monetary reservation.

`process-release` reads and writes `state/posts.json` in the media bucket, synchronously invokes `generate-og` and `notify-post` with bounded retries and stores only sanitized error codes, because that bucket is public. Subscribers live in `subscribers/<email>.json` in a separate private bucket shared by the HTTP facade and `notify-post`.

## Infrastructure and cost

Functions are split by permissions and dependencies: each artifact contains only what its handler imports and each role reads only its parameter. Splitting adds no capacity: without reserved concurrency, all of them share the account's regional concurrency quota. Public providers need neither a VPC nor NAT; DynamoDB is on-demand and standard SSM parameters with `aws/ssm` have no monthly charge. Three alarms cover essential observability within the CloudWatch free tier. The AI budget limits admission, not the complete bill.

Physical names containing `portfolio-api-cloud-test` identify the single installation and are retained to avoid resource recreation.

[Contracts](api.md) · [Operations](operations.md) · [Decisions](decisions.md)
