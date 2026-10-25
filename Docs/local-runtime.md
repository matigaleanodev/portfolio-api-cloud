# First local runtime experiment

[Español](local-runtime.es.md) · 2026-10-24.

Serverless migration is decided. The comparison records behavior and implementation differences; it does not gate that decision. TypeScript handlers are the basis of the next increment and Nest remains a technical reference.

## Provenance and reproduction

The experiment reused portfolio-api@a0ef80fa9f82d1cea5a31425a63ab0a344338c56. Git blobs were read at that pinned commit and per-file hashes were verified without changing the original API. [Retained evidence](runtime-evidence.md) identifies sources, inputs, packages and samples.

Native composition removed Nest DI decorators and support imports for Logger, configuration and exceptions. DTOs, domain, prompts, content, providers, caches and timeouts were retained. No generic platform was introduced.

This delivery is documentation only. Experiment tooling, copied sources and packages were removed from the checkout; experiment npm commands are unavailable in a documentation-only checkout. The next stage is to build this repository's initial maintainable API structure.

The experiment checked integrity and strict types without editing source files. The 123 original unit tests are transpiled with isolatedModules as in the source configuration; they do not typecheck their specs. Prototype sources were checked separately with strict tsc.

92 differential scenarios compare status, JSON, functional headers and simulated calls in isolated processes. Date, Content-Length and ETag are excluded from the transport comparison. Tests cover all six contracts, limits/windows/IP, rejected fields, history, DELETE/base64/urlencoded bodies, the exact 16 KiB boundary, provider errors, checksum, cold fallback, 503 without knowledge, caches and stale knowledge.

Current quotas are per process and controller method, including GET/POST chat and POST/DELETE subscriptions. There is no shared quota across those routes. Both variants use HTTP API v2 sourceIp and disregard X-Forwarded-For as identity. This validates the local adaptation, not the real proxy chain or distributed enforcement. A Throttler 6.5.0 edge case is retained: when a block expires it cancels default-group timers belonging to other keys, potentially extending their counters. A differential case reproduces it; the algorithm needs review before quotas are distributed.

ZIP tests extract outside the repo and exercise execution without node_modules, packaged fallback, exclusion of private files, ignored .env and blocked networking.

## Local results

Node v24.19.0; Linux x64 / WSL2; AMD Ryzen 7 9800X3D 8-Core Processor.

30 new processes per candidate, alternating and reversing order on each pair, identical configuration and artifact. OS page cache was not cleared and CPU/RAM were not constrained like Lambda. The experiment used Node 24. Prepared CI targets Node 22; these prototypes have no remote execution evidence.

Real S3 and Resend SDKs are included in both bundles. Fake configuration/providers are mandatory: fetch, S3.send and sockets are intercepted before services are imported. No option enables real networking. Both candidates silence logs during measurement.

| Metric (ms) | Nest | TypeScript handlers |
| --- | ---: | ---: |
| Import + init, p50 / p95 | 195.194 / 219.406 | 141.441 / 165.677 |
| Import + init, min / max | 187.438 / 225.579 | 137.211 / 167.159 |
| Import, p50 / p95 | 147.569 / 166.439 | 131.108 / 153.752 |
| Init, p50 / p95 | 48.164 / 55.993 | 10.239 / 13.466 |
| Health first, p50 / p95 | 3.327 / 4.091 | 2.589 / 2.894 |
| Health warm, p50 / p95 | 0.194 / 0.580 | 0.100 / 0.346 |
| Chat mock warm, p50 / p95 | 0.845 / 5.539 | 0.679 / 4.456 |

| Package | Nest | TypeScript handlers |
| --- | ---: | ---: |
| Bundle (bytes) | 8,096,529 | 6,224,140 |
| ZIP (bytes) | 1,684,535 | 1,405,179 |
| Modules | 2,235 | 1,431 |

Import + init starts before require and ends when the handler is ready; it excludes Node executable startup. Percentiles use nearest-rank. Warm pools 600 calls per route/candidate across those 30 processes, with per-environment caches and immediate mock providers. processWallMs includes creation, the entire invocation sequence and shutdown: it is not startup. No p99 is calculated for this sample. [Startup samples, environment, hashes and dependencies](runtime-evidence.md).

Both packages are compiled with TypeScript metadata and bundled with esbuild without minification, using the same synthetic fallback. The native handler rejects transitive Nest/Express imports during the build; it retains body-parser and class-validator/class-transformer to preserve semantics. Sources and specs are excluded from the ZIP. These are local experiment packages with mandatory mocks, not production deliverables.

## Interpretation and limits

Handlers reduce initialization and size in this sample and do not need Nest for the tested cases. The result supports continuing in that direction; it does not demonstrate monetary savings or AWS cold starts. External waits, billed duration, secrets and cache fragmentation are unmeasured. These milliseconds are not converted into GB-s.

Interchangeability is scoped to this application: replace its implementation while preserving HTTP/behavior, with URL or routing configuration if needed. Other APIs retain their own domains. Traffic switching is not implemented and production recovery was not rehearsed. The original API is untouched; pinned provenance makes the comparison baseline recoverable.

Public release blockers: shared quotas, complete deadline/cancellation, stale/provider retention policy, per-environment configuration/secrets and real recovery. npm audit --omit=dev reported 15 affected dependencies in this lock (10 high, 5 moderate), including transitive baseline branches. [Dependency record](runtime-evidence.md#observed-dependencies). Source versions were retained for comparison; upgrades and applicability reassessment precede runtime publication.

References: [Nest serverless](https://docs.nestjs.com/faq/serverless), [serverless-express](https://github.com/CodeGenieApp/serverless-express), [HTTP API v2](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html). [Total cost](costs.md) and [decisions](decisions.md).

The production serverless API and refreshed editorial data are not implemented yet. Refreshing profile and project data will be the final step before production deployment, retaining a recoverable previous knowledge version.
