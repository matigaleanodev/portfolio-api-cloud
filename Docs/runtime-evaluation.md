# Choose the runtime from evidence

[Español](runtime-evaluation.es.md) · 2026-10-24. Selection compares compatibility, latency, cost and maintenance; retaining the current framework is not a requirement.

**Infrastructure and runtime are separate decisions.** CDK defines/deploys infrastructure; Nest or Node.js handlers execute HTTP/business behavior. CDK can remain the recommendation with either runtime.

## Project evidence

Six routes, no database, complex auth, uploads, streaming or workers favor evaluating lightweight handlers in one/two grouped functions. However, chat contains 16 non-spec files/2,621 lines including content; contact 122, subscriptions 197 and runtime config 210. Preserving behavior is more than replacing an empty server.

Verified Nest coupling includes decorators/DI, ConfigService, Logger, HTTP exceptions, ValidationPipe, throttling and Express bootstrap. FAQ/ranking/dates/curated data/prompts/integration logic can be reused. Native execution requires removing Nest dependencies from transitive service imports too; wrapping a controller does not do that. No language/provider/contract change is required.

The [official Nest serverless guide](https://docs.nestjs.com/faq/serverless) shows framework/bundling effects on startup. Its local example microbenchmarks are **not this API's AWS cold starts**; do not extrapolate timings. Cold latency includes runtime/imports/DI/config/secrets/knowledge, while chat adds network/model generation. Framework optimization may not fix the dominant delay.

## Candidates

| Candidate | Reuse | Work/risk | Testable hypothesis |
| --- | --- | --- | --- |
| A. Adapted Nest/Express | services/DTOs/validation/errors/tests | bootstrap/adapter/package; quotas/deadlines still need fixes | smaller migration, more initialization/imports |
| B. Compact responsibility-grouped Node handler | domain/content/SDKs/contract cases | explicit composition/parsing/validation/error mapping/IP/limits/headers; retain class-validator if it reduces changes | fewer dependencies/bootstrap with acceptable migration cost |
| C. HTTP server in Web Functions | chosen server/framework | Node 24 plus different endpoint/IAM/billing | concurrency/active CPU benefits outweigh resident memory |

No extra HTTP/validation framework or generic ports/adapters architecture by default. Candidate B should use the smallest sufficient composition/routing surface without rewriting knowledge. A remains a genuine comparator.

## Experiment and selection rule

Future local stage: same Node version for A/B, reproducible lockfiles, artifact, memory/contract inputs and deterministic provider mocks. Measure ZIP/dependency size, import/initialization in fresh processes and p50/p95, then warm execution. Start with at least 30 alternating starts per candidate, report spread and explicitly distinguish local results from Lambda.

Isolated AWS test: same region/architecture/memory (512/1024 MiB), networking, secret/cache/protection settings. Identify cold starts through INIT/telemetry, not request count. Separate fast routes/chat; measure p50/p95/p99 when samples permit, errors/fallback, billed duration/cost. Mock providers to isolate framework; budgeted real-provider samples validate the final experience. No paid/production load tests now.

Choose B if it preserves all contracts/protections, meets measured targets and materially reduces startup/cost or operating complexity without disproportionate maintenance. Choose A if it meets targets and B's measured benefit does not justify adapting validation/errors/tests. If both fail, reconsider ingress/deadlines and C/containers. Do not buy provisioned concurrency before comparison.

**Status:** CDK recommended, runtime undecided pending evidence. Lightweight handlers are a strong candidate at this scale, not a demonstrated winner. No prototypes/benchmarks were implemented.
