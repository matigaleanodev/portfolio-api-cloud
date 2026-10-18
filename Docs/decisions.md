# Decisions and proposals

[Español](decisions.es.md) · 2026-10-24.

## Confirmed by the user

- Migrate the entire API while preserving the original fallback; order Portfolio→Foodly Notes→Modo Playa.
- Preserve portfolio-cloud ownership and static frontend content.
- Create **public** portfolio-api-cloud now, with local documentation/workflows and main/dev GitHub protection.
- Publish preparation in small commits and integrate into dev only; main remains outside scope. Application code, AWS resources, CDK bootstrap, deployment and cutover remain unauthorized.
- Personal account only; Observer inspection; no professional credentials/private Comafi archetype.
- Accept 1–2 months of coexistence; EC2 shutdown waits for the other applications and stabilization.

## ADR-001 — Infrastructure tooling

Status: **proposed**. Recommend TypeScript CDK v2 for maintainer experience, explicit IAM and infrastructure assertions. SAM is the continuity finalist. Work experience is user context, not permission to copy code/access professional accounts. Do not migrate existing SAM. [Comparison](architecture.md).

## ADR-002 — Runtime unit

Status: **conditionally proposed**. Compare adapted Nest with lightweight handlers before selecting runtime; CDK does not replace Nest. Event Function + HTTP API outside VPC with shared quotas is their common infrastructure candidate. See [evaluation](runtime-evaluation.md). Split chat only on measured contention. Compare native Lambda Web Functions before implementation selection if support/cost proves favorable. [Risks](audit.md).

## ADR-003 — Publication and workflows

Status: **preparation and GitHub protection authorized, workflow activation pending**. GitHub was created empty. Publication and dev-only integration were subsequently authorized; merge locks remain until App and Git bootstrap setup is resolved. CI distinguishes documentation from missing application. Manual deployment only prepares a test change set after explicit opt-in/environment gating; it cannot execute or reach production. main/dev accept only workflow-merged PRs through a dedicated App, no PAT/force. Rulesets are active; the current update lock has no bypass, so merges remain blocked until App installation. dev is not promised to be an exact-SHA mirror. Only feat/fix/release work branches; codex forbidden. Publishing does not authorize bootstrap or activation. [CI/CD](ci-cd.md).

## Pending implementation/production gates

Approve recommendations, daily cap/budget and latency tolerance, maximum stale age, isolated test providers/data, selected CDK/IAM/bootstrap, domain mechanism and rollback rehearsal. Actual costs/traffic are missing; documentation does not turn estimates into a budget. Original runtime/automation repositories remain operational and untouched.
