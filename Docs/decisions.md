# Decision log

[Español](decisions.es.md) · 2026-10-24.

## Closed decisions

- Migrate all three APIs on the shared server to serverless. This repository implements only Portfolio's alternative.
- Retain the original NestJS implementations as technical references and independent alternatives.
- Keep all three current APIs operational throughout migration. After completion and verified recovery, stop EC2 without terminating or dismantling it and retain a recoverable backup.
- Preserve Portfolio's six contracts and behavior, with configurable URL or routing without rewriting the frontend.
- Keep static delivery in portfolio and existing portfolio-cloud responsibilities.
- Build this API's initial structure with TypeScript handlers. The Nest comparison remains technical evidence.
- Protect main/dev with PRs, CI and workflow merges. The first delivery is integrated into dev; main belongs to a later stage.
- Use only personal AWS in us-east-1.

## ADR-001 — Infrastructure as code

Status: **open; TypeScript CDK is preferred**.

CDK supports TypeScript infrastructure, IAM review and resource tests. SAM remains the closest alternative through portfolio-cloud continuity; that repository keeps its existing tool. Roles, boundaries, retention and bootstrap remain open; tooling does not decide runtime. [Architecture](architecture.md).

## ADR-002 — TypeScript handler implementation

Status: **initial-structure direction defined**.

Grouped handlers with explicit composition, retaining domain, DTOs, validation, errors and limits. The existing API remains independent. The local experiment compared that composition against adapted Nest with simulated providers. Its purpose is to document differences, not decide whether to migrate. [Results](local-runtime.md).

Lambda Event Function with HTTP API outside a VPC is the proposed infrastructure baseline. Splitting chat requires demonstrated contention or permission needs. Production publication requires distributed protections and actual environment validation.

## ADR-003 — Integration and delivery

Status: **policy defined; App merges validated in PR #2 and #3**.

main/dev require PRs, CI, resolved conversations and deletion/force protection. Work branches use feat/fix. Effective configuration merges through the dedicated App; the new policy requires actual account identity and its transition remains pending. [Integration](integration.md). PR #1 is integrated into dev, update restrictions were restored and the initial exception is consumed.

CI separates documentation, application and infrastructure; verify remains required. The application is tested on Node 24.22.1 LTS without requiring a placeholder stack. These changes have local validation; remote execution remains pending. [CI/CD](ci-cd.md) and [rules](branch-protection.md).

## ADR-004 — Provenance and per-application interchangeability

Status: **criterion defined; local evidence recorded**.

The comparison reused portfolio-api@a0ef80fa9f82d1cea5a31425a63ab0a344338c56 with per-file hashes without changing its working tree. [Provenance](runtime-evidence.md).

Interchangeability means replacing this same API's implementation while retaining HTTP and behavior. URL or routing may require configuration. It does not mean interchanging unrelated API domains, creating a generic platform or guaranteeing multicloud parity.

## ADR-005 — Bot knowledge before production

Status: **delivery order defined; refresh pending**.

Refreshing bot data about the professional profile and projects is the final step before production deployment. Scope includes curated/editorial sources, prompts or FAQs dependent on those facts, the published artifact and packaged fallback. Verify provenance, integrity, dates, links and representative answers while retaining the previous recoverable version. Final-package checks belong to this same step; production deployment follows it. [Sequence](migration.md).

## Open operational decisions

Budget and daily AI quota; latency/cost thresholds; maximum stale age and provider retention; test isolation; roles/bootstrap; artifact retention; URL/routing and cutover runbook. Actual billing and private plans are unverified. Public scenarios are hypothetical.

## ADR-006 — Local foundation and independent validation

Status: **implemented locally; partial coverage**.

Four runtime modules, explicit composition, isolated CORS configuration and provider-free health. Node 24.22.1 LTS is the target, verified through isolated execution. Strict TypeScript, JS compiler 6.0.3, native test runner and zero runtime dependencies: this slice does not require a framework, bundler or SDK.

CI separates application from CDK and retains verify as its required aggregate check. An absent stack skips only infrastructure; it cannot skip types/build/tests for a present application. The new foundation does not use discarded prototype code. [Implementation, limits and provenance](application.md).

## ADR-007 — Actual integration identity

Status: **policy defined; local candidate tested; activation blocked**.

New automated merges must be attributed to matigaleanodev through a user credential, validating login/ID/type and merged_by. An installation token attributes the operation to the App and does not satisfy this policy. PRs, CI, reviewed SHA and workflow remain required; no bot fallback or cosmetic metadata changes.

Effective configuration allows only the App through updates. A human credential alone does not grant that access. Replacing the bypass actor changes access guarantees: that account could also merge a PR outside the workflow. Transition must explicitly resolve that difference and initial activation from protected branches. [Status, alternatives and limits](integration.md).
