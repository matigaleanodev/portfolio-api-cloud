# Decision log

[Español](decisions.es.md) · 2026-10-24.

## Closed decisions

- Migration covers the complete public API, with the original implementation retained as fallback.
- `portfolio` retains static delivery and `portfolio-cloud` its existing responsibilities.
- The new implementation lives in an independent public repository.
- Initial integration targets `dev`; `main` is reserved for a later stage.
- Transition allows one or two months of coexistence. EC2 remains available until the remaining migrations and stabilization are complete.
- Work uses only the personal AWS account and primary region us-east-1.

## ADR-001 — Infrastructure as code

Status: **open; TypeScript CDK is preferred**.

Primary criteria are operational CDK experience, TypeScript shared with the API, explicit IAM control and infrastructure assertions. SAM remains a finalist for continuity with `portfolio-cloud`. That repository retains SAM; tooling uniformity alone does not justify migration.

Pending: bootstrap, roles, boundaries and confirmation of tooling with the selected runtime. [Comparison](architecture.md).

## ADR-002 — API runtime

Status: **open**.

Candidates are adapted NestJS and lightweight Node.js handlers. Both must preserve contracts and behavior. Event Function with HTTP API, outside VPC and using shared quotas, is the common evaluation baseline. Splitting chat depends on demonstrated contention or permission needs.

Selection requires functional compatibility, startup/latency measurements, cost and maintainability. Lambda Web Functions remains an alternative if its execution model proves more suitable. [Evaluation protocol](runtime-evaluation.md).

## ADR-003 — Integration and delivery

Status: **policy defined; automation pending**.

Work branches use feat/fix/release. main/dev require PRs, CI, resolved conversations and deletion/force protection. The steady-state merge flow uses a dedicated App. Initial integration of PR #1 includes a temporary dev-only exception; the update lock is restored afterward.

CI separates documentation validation from application testing. The test workflow prepares a change set without executing it and has no production path. [CI/CD](ci-cd.md) and [rules](branch-protection.md).

## Remaining open decisions

- Budget, daily AI quota and latency objectives.
- Maximum stale-knowledge age and fallback policy.
- Isolated test data/providers.
- Roles, bootstrap and artifact retention.
- Domain routing, cutover and recovery rehearsal.

Actual traffic and costs are still missing from the budget. Scenario assumptions are not measured consumption.
