# Technical decisions

[Español](decisions.es.md)

## Packages with verified boundaries

I chose npm workspaces with separate contracts, runtime and infrastructure and a single lock: routes, quotas, function catalog, configuration names and editorial events have one definition consumed by runtime, CDK and tests. `contracts` depends on nothing; infrastructure cannot import runtime. A script verifies these limits because npm hoisting would make them implicit.

## Functions split by permissions

Six functions instead of one: each artifact contains only what its handler imports and each role reads only its parameter, so contact does not load OpenAI and chat cannot read subscriber or media credentials. The split is not about capacity, since all of them share the regional concurrency quota. `generate-og` keeps x86_64 to retain the same resvg binary and an identical render.

`api` serves non-canonical chat variants: it includes the chat router and reads the chat parameter lazily. This is a bounded exception that preserves the full contract without additional proxy routes, because API Gateway selects by exact route. The cost is an `api` artifact with chat code and a role that can read that parameter.

## Middy with core only

Middy orders the HTTP chain with in-house middlewares instead of a server or container. I use only `@middy/core`: the `@middy/http-*` packages change observable details (parsing order, limits, error shape, CORS and headers) that the inherited contracts pin, and adapting them would cost more than keeping small middlewares. The request scope stays outside Middy so ingress, deadline and `x-request-id` also cover short-circuits.

## Integrated editorial publication

Editorial publication (OG, notifications and chat knowledge) and subscriptions live in this repository and share store, contracts and delivery with the API. Subscriptions run in process over R2, without an HTTP hop to another service, preserving messages and error mapping. Inherited event and variable names are kept so the `portfolio` workflow only changes function names. Functions have no schedules or event sources: publication triggers them.

## Sensitive configuration in SSM

Sensitive keys live in standard SSM `SecureString` parameters, segmented by responsibility, with the AWS managed key `aws/ssm`: no monthly cost and IAM per exact parameter. I accept that any role in the account with `ssm:GetParameter` on the parameter can decrypt it. Non-sensitive configuration stays in environment variables from CloudFormation parameters, reviewable in the changeset.

GitHub Actions Secrets are the only source: a manual workflow always publishes complete payloads and its role does not read values. This avoids drifting manual edits and reads from CI, and rotating a credential needs no deployment. The previous secret is retired manually once it no longer serves as rollback.

## CDK and separate infrastructure

TypeScript CDK defines IAM and allows resource testing before deployment. Foundation, delivery roles and boundaries are reviewed separately from the application. Existing logical IDs and physical names are retained to avoid replacing the function, table or log groups.

## Per-application compatibility

Lambda and NestJS retain HTTP and behavior so the API can be switched through frontend configuration. Validation and quota-window differences are declared in tests. The goal is neither interchanging domains between APIs nor guaranteeing equivalence across clouds.

## Shared controls

DynamoDB prevents Lambda scaling or function splitting from multiplying allowances: `api` and `chat` share table and HMAC keys. Windows expire through application logic and AI reservations precede consumption. Deadlines and cancellation bound waiting; avoiding retries prevents repeated ambiguous effects.

## FAQs and one model

FAQs answer directly and provide continuity without AI. GPT-6 Luna is the only model: Responses, `reasoning.effort=none`, `store=false`, no tools and no alternative generation. Reservations are conservative without relying on cache discounts; ambiguous failures do not refund budget. Expired pricing disables paid generation only.

## Verifiable knowledge

`publish-chat-knowledge` publishes the envelope and `chat` consumes it with schema, checksum and maximum age; the packaged fallback does not refresh its date automatically. Editorial state lives in a public bucket, so it stores only sanitized error codes. Conversations are not persisted, and `store=false` alone does not establish the absence of provider retention.

## Minimal observability

Three alarms within the free tier: HTTP 5xx through a single custom metric, and account-level Lambda throttles and errors, which also cover other projects and detect exhaustion of the shared quota. There are no per-function, duration or access-log alarms: diagnosis relies on free metrics and structured logs.

## Delivery and recovery

PRs, CI and workflow merges retain verifiable human identity. Artifacts are promoted and recovered without recompilation; planning, publishing, execution, parameter sync and runtime have separate roles. One installation retains physical names and data. The original API and EC2 allow independent recovery while available.

## Testing and license

Vitest unifies suites with simulated providers and blocked network access; CDK uses assertions and synthesis without lookups. The project uses MIT with its own authorship; dependency licenses remain in their packages without a manual attribution catalog.

[Architecture](architecture.md) · [Contracts](api.md) · [Operations](operations.md)
