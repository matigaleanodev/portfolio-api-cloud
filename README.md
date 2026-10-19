# Portfolio API Cloud

[Español](README.es.md)

Migration of the **entire** public Portfolio API from shared EC2 to managed AWS infrastructure. This repository currently contains an audit, a proposal and workflow preparation. It has **no application code, CDK stack, installed dependencies or deployed resources**.

## Scope and ownership

- `portfolio`: Angular UI, static editorial content and Firebase Hosting.
- `portfolio-api`: existing NestJS API; preserved as the operational fallback.
- `portfolio-cloud`: existing SAM automation, subscriber persistence, release notifications, OG images and canonical chat knowledge publication. Its ownership does not move here.
- `portfolio-api-cloud`: future replacement for health, contact, chat and the subscription facade.

The public contract has six routes. The API has no application database, uploads, WebSockets or streaming. These are code findings, not an assertion that production matches every local file.

## Read in this order

1. [Current-state audit and evidence](Docs/audit.md)
2. [Architecture and framework recommendation](Docs/architecture.md)
3. [Cost scenarios](Docs/costs.md)
4. [Migration, acceptance and recovery](Docs/migration.md)
5. [Decision status](Docs/decisions.md)
6. [CI/CD preparation](Docs/ci-cd.md)
7. [Runtime comparison and selection gates](Docs/runtime-evaluation.md)
8. [Applied branch protection and pending merge App](Docs/branch-protection.md)
9. [Official references, consulted 2026-10-24](Docs/sources.md)

**Recommendation, not implementation approval:** TypeScript CDK; compare adapted NestJS against lightweight Node.js handlers before selecting runtime. Initially evaluate a Lambda Event Function behind API Gateway HTTP API. Shared rate limiting and bounded outbound requests are production gates. SAM is the closest alternative. No serverless cost saving is assumed.

## Current authorization

The user authorized creating this public repository, local Markdown documentation, workflow files and GitHub branch protection. The user subsequently authorized small commits, branch publication, integration into dev only and branch cleanup afterward. main is outside this delivery. Application implementation, AWS mutations, CDK bootstrap, deployment and production traffic changes remain unauthorized. Requested Git dates do not change the actual audit consultation date (2026-10-24). Initial merge requires resolving automation identity and Git bootstrap without bypassing protections.

## Local workflow

Work through Ubuntu-26.04 in WSL. New branches use `feat/`, `fix/` or `release/`. Local `agents.md` variants, `roadmap` and `mentor` are ignored and never published. Durable documentation is paired English/Spanish. Validate the current documentation with `python3 scripts/check_docs.py`. No npm/CDK commands exist yet; the future script contract is described in [CI/CD](Docs/ci-cd.md).

Keep the existing EC2 service available through the Portfolio migration. Foodly Notes and Modo Playa are separate later migrations. EC2 retirement is outside this repository's current scope.

Work branches `codex/` are forbidden. main/dev require workflow-merged PRs; updates are currently locked until a dedicated merge App is installed. See branch-protection documentation.
