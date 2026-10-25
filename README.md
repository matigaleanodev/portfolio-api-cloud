# Portfolio API Cloud

[Español](README.es.md)

Alternative implementation of Portfolio's public API using TypeScript handlers. Serverless migration is decided; the original NestJS API remains an independent implementation.

## Current status

Implemented local foundation: explicit composition, CORS configuration and `GET /api/health` → 200 `{"status":"ok"}`, using HTTP API v2 events. The other five routes remain pending and return 404. Contract coverage is partial; there is no CDK stack or deployment.

The comparison prototype was discarded. Its [results](Docs/local-runtime.md) remain historical evidence, not measurements of this foundation, AWS cold starts or proof of monthly savings.

## Local development

Ubuntu-26.04 on WSL. Target Node **24.22.1 LTS** (`.nvmrc`), the latest LTS as of 2026-10-24. Verified through isolated execution with no global installations.

```bash
npm ci --ignore-scripts
npm run check
python3 -m unittest discover -s scripts -p 'test_*.py'
```

`check` runs strict types, ESM build, network-blocked tests, an out-of-checkout smoke test and document validation. Scripts do not fix sources. The package uses `dist/handler.js`, export `handler`, and requires `package.json` with `type: module`. Runtime does not require `node_modules`. It does not load `.env`; only the Lambda entry reads environment configuration for CORS.

## Scope

- Six planned contracts: health, contact, starters, chat and subscribe/unsubscribe.
- portfolio retains frontend, static editorial content and hosting.
- portfolio-cloud retains subscribers, notifications, OG, releases and knowledge publication.
- Replacing this API's implementation preserves HTTP and behavior; URL/routing may require configuration.
- Full compatibility still requires migrating the five business routes and their scenarios.

## Documentation

1. [Implemented foundation, tests and provenance](Docs/application.md)
2. [Audit and contracts](Docs/audit.md)
3. [Architecture](Docs/architecture.md)
4. [Hypothetical costs and auxiliary services](Docs/costs.md)
5. [Migration and recovery](Docs/migration.md)
6. [Decisions](Docs/decisions.md)
7. [CI/CD](Docs/ci-cd.md)
8. [Runtime comparison](Docs/runtime-evaluation.md)
9. [Historical results](Docs/local-runtime.md)
10. [Experiment evidence](Docs/runtime-evidence.md)
11. [Branch protection](Docs/branch-protection.md)
12. [Sources](Docs/sources.md)

## Transition

All three current APIs remain operational throughout migration. After all three migrate, stabilize and pass recovery validation, EC2 will be stopped with its instance and recoverable backup retained. Retained resources belong in total cost.

Refreshing bot profile/project data remains the final step before production deployment. main/dev require PRs, CI and workflow merges. [Integration attributed to matigaleanodev](Docs/integration.md) uses a user credential while retaining mandatory PRs and CI. TypeScript CDK remains preferred; roles/bootstrap and traffic switching remain open.
