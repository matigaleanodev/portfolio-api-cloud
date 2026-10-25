# Reversible migration through production

[Español](migration.es.md) · 2026-10-24.

Serverless migration is decided. This plan covers Portfolio; Foodly Notes and Modo Playa retain their own domains and independent plans. All three current APIs remain operational throughout migration.

## Stages and exit criteria

| Stage                           | Delivery                                                                                  | Exit criterion                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 0. Documentary evidence         | audit, provenance, local comparison, decisions and hypothetical costs                     | bilingual documentation and links verifiable from a checkout without experimental code                                    |
| 1. Initial structure            | TypeScript handlers, minimal composition, explicit configuration, scripts and local tests | build/types pass; real networking/providers blocked in tests; no placeholder stack or abstractions                        |
| 2. Reused logic                 | recover only necessary pinned source files and record provenance                          | retain domain/content/DTOs; remove transitive Nest imports from handler runtime                                           |
| 3. Complete contracts           | six routes, errors, validation, headers and limits                                        | chat 201, contact 204, DELETE body and 400/413/429/500/502/503; simulated effects without duplication or business traffic |
| 4. Hardening                    | trusted IP, shared quotas, deadline/cancellation, integral fallback and bounded logs      | concurrency, expiry, spoofing, corruption, failed-provider and ambiguous-outcome tests                                    |
| 5. Local infrastructure         | select tooling and define isolated test, IAM/network/retention/routes                     | offline synth/assertions; review boundaries and pipeline/publication/execution/runtime separation                         |
| 6. Protected delivery           | dedicated App, environments and runner-compatible workflows                               | PR/CI/workflow merges without new update-lock exceptions; do not equate documentation checks with application validation  |
| 7. AWS test preparation         | identity, roles, bootstrap and isolated data/providers                                    | reviewed setup, resources and expected costs, without production data/destinations                                        |
| 8. Test deployment              | immutable artifact and independent endpoint                                               | reviewed exact change set and traceable execution; initial workflow only prepares deployment                              |
| 9. Managed validation           | contracts/e2e/security/observability and real measurements                                | cold execution demonstrated with telemetry; route latency/error/cost, AI quota and alerts; mock providers first           |
| 10. Cutover and recovery ready  | URL/routing, runbook, original image/config and return rehearsal                          | one write destination per request; tested return with running EC2 and retained artifacts                                  |
| 11. Final bot knowledge refresh | update professional profile/projects, curated/editorial sources and fallback              | verify provenance/checksum/dates/links/representative answers in final package; previous version recoverable              |
| 12. Production deployment       | publish final package and switch according to runbook                                     | controlled smoke, monitoring and operational reversion; EC2 stays running                                                 |
| 13. Stabilization               | observe behavior, costs and real effects                                                  | stability criteria met and recovery current; duration follows evidence                                                    |
| 14. EC2 preservation            | complete both remaining migrations and verify backup/restoration                          | stop and retain the instance without termination or dismantling                                                           |

Stage 11 is the final step before production deployment. Knowledge and final-package checks belong to that same stage; no other delivery is inserted between its completion and production.

## Stage 1 implemented locally

The foundation is implemented with health, explicit configuration/composition, strict types, ESM build, network guard and separate CI scopes. [Coverage, provenance and checks](application.md). The experiment remains historical evidence; its sources were not recovered.

Review local files before reuse. Recover only necessary source files with commit, paths and hashes. Keep runtime free of transitive Nest/Express dependencies; retain class-validator/class-transformer or existing utilities when they reduce contract risk. Do not introduce a new framework, generic platform or multicloud layer.

Stages 2/3 progressed with [contact](contact.md): pinned logic/DTO/cases, provenance, mocked provider and local quota. The [chat increment](chat.md) completes both remaining routes and their provenance. The [subscription slice](subscriptions.md) completes subscribe/unsubscribe with independent quotas and a mocked HTTP provider. All six contracts have local tests and explicit differences; stage 4 and managed integration remain before exposure.

## Data, effects and coexistence

Portfolio has no application schema to migrate. Subscribers/releases remain owned by portfolio-cloud/R2. Do not duplicate persistence, cron, process-release, notify-post or knowledge publication. Each contact/subscription request targets one implementation; no shadow/replayed writes or automatic retries after ambiguous timeouts.

Tests start with fixtures and mock providers. Later integration uses isolated data/destinations; that environment's availability must be verified. Required portfolio-cloud changes keep their existing owner and are managed separately.

Interchangeability applies to Portfolio implementations: retain HTTP and behavior so the frontend can change implementation. URL/routing may need configuration. Unrelated application domains are not interchanged.

## Validation and observability

- Functional: six routes, bodies/status/headers, validation, errors, FAQ/AI/fallback, history and Argentina dates.
- Security: sourceIp and real proxies, no bypass entry points, concurrent quotas/TTL, 16 KiB limit, minimal IAM and secrets outside logs/artifacts. CORS is not authentication.
- Performance/cost: distinguish local startup from AWS INIT/billed duration; record samples, environment, memory, latency, 429/5xx/timeouts, caches, calls and tokens.
- Operations: distinguish successful HTTP fallback from provider availability, bound cancellation/retries, verify alarms and cutover procedure.
- Acceptance: set thresholds from data; do not claim compliance or net savings from insufficient samples or hypothetical scenarios alone.

## Bot refresh immediately before production

Update facts about experience, technologies and projects from verifiable sources; review FAQs/prompts/curated content dependent on those facts. Regenerate editorial knowledge, publish through its owner and package a consistent fallback.

Verify checksum/envelope, publication dates, links, professional-experience/project separation, history-aware queries and R2-failure responses. Keep the previous artifact and package recoverable. Data refresh does not silently change contracts or providers.

## Return with EC2 available

Before cutover, verify original containers, retained digest/SHA image, private configuration outside Git, SSM, Tunnel/Traefik and URL/routing mechanism. The runbook must restore traffic without repeating in-flight effects.

Returning to the server does not reverse writes already applied to the shared upstream. Review image retention so required digests remain available. Do not promise RTO/RPO without rehearsal.

## Stopped EC2 and recoverable backup

Stop EC2 only after all three migrations, stabilization and verified recovery. Retain the instance without terminating it or dismantling its environment. Keep a recoverable backup of the EC2 model so it can be resumed.

Define backup contents/destination/retention: relevant volumes/snapshots or AMI, images by digest, Compose/Traefik, scripts, securely held private configuration and startup/access dependencies. Secrets are not copied to this repository. R2 data is recovered through its owner's procedure, not an EC2 snapshot.

Returning from a stopped instance requires startup and validation of network, volumes, Docker, access, ingress and health; it is not immediate coexistence rollback. Retained resources and backups belong in total cost.

## Local infrastructure progress

Stage 5 local definition was brought forward: CDK selected, IAM-isolated test stack, 11 assertions and synth without lookups. This does not waive stages 3/4 or enable AWS test/production. [Resources, package and prerequisites](infrastructure.md).
