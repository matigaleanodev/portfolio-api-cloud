# Technical decisions

[Español](decisions.es.md)

## Grouped handlers

I chose explicit composition and one Lambda for six operations: it preserves contracts and domain logic without an HTTP server or Nest container. Splitting functions requires a demonstrated permission, concurrency or isolation need. DTOs use class-validator/class-transformer; Resend uses its SDK and subscriptions use native fetch.

## CDK and separate infrastructure

TypeScript CDK defines IAM and allows resource testing before deployment. Infrastructure stays outside runtime. `portfolio-cloud` retains its own tooling and responsibilities; no shared platform is introduced to standardize repositories.

## Per-application compatibility

Lambda and NestJS retain HTTP and behavior so the API can be switched through frontend configuration. Validation and quota-window differences are declared in tests. The goal is neither interchanging domains between APIs nor guaranteeing equivalence across clouds.

## Shared controls

DynamoDB prevents Lambda scaling from multiplying allowances. Windows expire through application logic, keys are derived and AI reservations precede consumption. Deadlines and cancellation bound waiting; avoiding retries prevents repeated ambiguous effects. Alerts complement these controls.

## FAQs and one model

FAQs answer directly and provide continuity without AI. GPT-6 Luna is the only model: Responses, `reasoning.effort=none`, `store=false`, no tools and no alternative generation. Reservations are conservative without relying on cache discounts; ambiguous failures do not refund budget. Expired pricing disables paid generation only.

## Verifiable knowledge

`portfolio-cloud` publishes editorial content; this API consumes it. Packaged fallback has a schema, checksum and maximum age without automatically refreshing its date. Conversations are not persisted. `store=false` alone does not establish the absence of provider retention.

## Delivery and recovery

PRs, CI and workflow merges retain verifiable human identity. Artifacts are promoted and recovered without recompilation; planning, publishing, execution and runtime have separate roles. One installation retains physical names and data. The original API and EC2 allow independent recovery while available.

## Organization and middleware

As a design direction, I chose to separate domain, HTTP and runtime, and adopt Middy for routing and middleware. Current code retains explicit composition; this decision does not imply Middy is already integrated. Reorganization must preserve contracts and controls. Powertools remains optional and is not added just for logging.

## Testing and license

Vitest unifies suites with simulated providers and blocked network access; CDK uses assertions and synthesis without lookups. The project uses MIT with its own authorship; dependency licenses remain in their packages without a manual attribution catalog.

[Architecture](architecture.md) · [Contracts](api.md) · [Operations](operations.md)
