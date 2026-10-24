# Portfolio API Cloud

[Español](README.es.md)

Migration of the public Portfolio API from shared EC2 to managed AWS services. The goal is to reduce server operations, preserve existing contracts and measure total cost before changing production.

## Current state

The audit and planning are complete. This repository contains bilingual documentation, document validation and workflows for CI, test deployment preparation and protected merges. Application code, a CDK stack and deployed AWS resources are not present yet.

Initial integration targets `dev`. `main` is reserved for a later stage. The original API remains the operational fallback.

## Responsibilities

- `portfolio`: Angular frontend, static editorial content and Firebase Hosting.
- `portfolio-api`: current NestJS implementation of health, contact, chat and the subscription facade.
- `portfolio-cloud`: subscriber persistence, notifications, OG images, release processing and chat knowledge publication.
- `portfolio-api-cloud`: future managed implementation of all six public API endpoints.

Audited code has no application database, uploads, WebSockets or streaming. Subscriber persistence and editorial automation remain in `portfolio-cloud`.

## Documentation

1. [Functional audit and evidence](Docs/audit.md)
2. [Architecture and infrastructure tooling](Docs/architecture.md)
3. [Cost assumptions and scenarios](Docs/costs.md)
4. [Migration and recovery](Docs/migration.md)
5. [Decision log](Docs/decisions.md)
6. [CI/CD](Docs/ci-cd.md)
7. [Runtime evaluation](Docs/runtime-evaluation.md)
8. [Branch protection](Docs/branch-protection.md)
9. [Sources consulted on 2026-10-24](Docs/sources.md)

## Open decisions

TypeScript CDK is the preferred infrastructure option; SAM is its closest alternative because it already operates `portfolio-cloud`. Runtime selection remains open between adapted NestJS and lightweight Node.js handlers. Lambda Event Function with HTTP API is the initial evaluation baseline; limits, latency, abuse protection and cost need validation before architecture selection is complete.

## Development and delivery

The local environment is Ubuntu-26.04 in WSL. Work branches use `feat/`, `fix/` or `release/`; `codex/` is forbidden. `main` and `dev` require PRs, CI and the integration process described in [branch protection](Docs/branch-protection.md).

Run document validation with `python3 scripts/check_docs.py`. npm/CDK scripts belong to the future implementation. Local instructions and tracking files remain ignored.

EC2 coexistence allows Portfolio validation without interrupting other applications on the shared server. Retirement depends on the remaining migrations and the stabilization period.
