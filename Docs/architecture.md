# Architecture

[Español](architecture.es.md)

Cloudflare receives traffic for `api.matiasgaleano.dev`; API Gateway HTTP API forwards the six operations to an ARM64 Node.js Lambda outside a VPC. TypeScript CDK defines infrastructure in `infra/`, separate from the `src/` runtime.

## Responsibilities

| Component        | Responsibility                                                      |
| ---------------- | ------------------------------------------------------------------- |
| `handler.ts`     | Managed ingress, identity, configuration, deadline and composition. |
| `application.ts` | Routing, parsing, CORS, DTOs, quotas and HTTP responses.            |
| Contact          | Validation, honeypot and delivery through the Resend SDK.           |
| Subscriptions    | HTTP facade for `portfolio-cloud`.                                  |
| `chat/`          | FAQs, context, editorial knowledge and AI provider.                 |
| DynamoDB         | Shared ephemeral quotas and AI reservations.                        |
| Secrets Manager  | Validated configuration with bounded caching and refresh.           |

`portfolio` owns the frontend and static content. `portfolio-cloud` owns subscribers, notifications and editorial publication. `portfolio-api` retains the independent NestJS implementation. Preserving contracts allows URL or routing changes without rewriting the frontend.

## Ingress and controls

The handler validates API, stage and domain. On the custom domain it requires a Cloudflare origin, an origin secret and a valid IP before trusting `CF-Connecting-IP`; it ignores `X-Forwarded-For`. CORS is handled in the application and does not authenticate.

DynamoDB uses conditional operations for quotas and transactions for AI admission. Logical expiration is independent of eventual TTL cleanup. Origin and session keys are derived with HMAC; conversations are not persisted. The in-memory limiter is limited to local composition.

Each request has up to 25 seconds, reduced according to Lambda's remaining time. An `AbortSignal` reaches storage and providers. Sends, subscriptions and ambiguous reservations are not retried; canceling transport does not undo accepted effects.

## Knowledge and continuity

FAQs answer directly. R2 provides editorial knowledge with caching and a versioned fallback inside the package. The envelope validates schema, checksum and maximum age; builds preserve its generation date.

Generation uses only GPT-6 Luna through Responses, with `store=false`, no tools and no retries. It requires valid pricing, session/origin allowances and a prior global monetary reservation. Limits allow continuity through FAQs or contact; editorial questions without valid knowledge return a controlled error.

## Infrastructure and cost

One grouped function avoids multiplying deployments without a demonstrated isolation need. Public providers require neither a VPC nor NAT. DynamoDB uses on-demand capacity; logs and secrets have their own costs. The AI budget limits runtime admission, not the complete bill.

Physical names containing `portfolio-api-cloud-test` identify one installation and are retained to avoid resource recreation. This migration does not remove the shared EC2 cost while other applications depend on it.

[Contracts](api.md) · [Operations](operations.md) · [Decisions](decisions.md)
