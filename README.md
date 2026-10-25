# Portfolio API Cloud

[Español](README.es.md)

**Current phase 4 status:** [runtime controls](Docs/runtime-hardening.md), locally implemented and tested: shared quotas, GLOBAL AI budget, session/origin limits, cancellation, versioned fallback, configuration and observability. Initial migration references retain their historical evidence; they do not establish AWS validation.

Alternative implementation of Portfolio's public API using TypeScript handlers. Serverless migration is decided; the original NestJS API remains an independent implementation.

## Current status

Local application with explicit composition and HTTP API v2 events: `GET /api/health` → 200 `{"status":"ok"}` and `POST /api/contact` → empty 204, with validation, honeypot, a mocked provider in tests and local 5/h/IP quota. POST and DELETE /api/subscriptions return 200 with email normalization, an HTTP provider and independent local 10/h/IP quotas. GET /api/chat/starters returns 200 and POST /api/chat returns 201 with FAQ/AI/fallback, history and independent 20/min/IP quotas. All six contracts have local coverage; managed integration remains pending. The CDK test stack is defined and locally synthesized; it is not deployed.

The comparison prototype was discarded. Its [results](Docs/local-runtime.md) remain historical evidence, not measurements of this foundation, AWS cold starts or proof of monthly savings.

## Local development

Ubuntu-26.04 on WSL. Target Node **24.22.1 LTS** (`.nvmrc`), the latest LTS as of 2026-10-25. Verified through isolated execution with no global installations.

```bash
npm ci --ignore-scripts
npm run check
```

`check` validates formatting and runs strict types, ESM build, network-blocked tests, an out-of-checkout smoke test and document validation. Verification commands do not fix sources. The package uses `dist/handler.js`, export `handler`, and requires `package.json` with `type: module`. Runtime requires production `node_modules` from the lock and `LICENSE`. It does not load `.env`; only the Lambda entry reads environment for CORS and contact (`RESEND_API_KEY`, `CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL`). Health remains available without these keys. [Contract, provenance and limits](Docs/contact.md).

[Test stack and prerequisites](Docs/infrastructure.md) · [Spanish test cases](Docs/testing.md). Vitest runs 539 cases (513 application, 12 tooling, 14 infrastructure).

Readable formatting with Prettier **3.9.10** and explicit `.prettierrc.json` rules: two spaces, single quotes, semicolons, trailing commas and an advisory 100-column print width. Scripts separate preparation, execution and checks with blank lines preserved by Prettier. `npm run format` writes changes; `npm run format:check` checks without writing and is required in CI. `.gitignore` and `.prettierignore` exclude private/generated files, the lockfile and the pinned historical fixture.

## Scope

- Six planned contracts: health, contact, starters, chat and subscribe/unsubscribe.
- portfolio retains frontend, static editorial content and hosting.
- portfolio-cloud retains subscribers, notifications, OG, releases and knowledge publication.
- Replacing this API's implementation preserves HTTP and behavior; URL/routing may require configuration.
- All six contracts are implemented; full compatibility requires hardening and managed integration.

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

Refreshing bot profile/project data remains the final step before production deployment. main/dev require PRs, CI and workflow merges. [Integration attributed to matigaleanodev](Docs/integration.md) uses a user credential while retaining mandatory PRs and CI. TypeScript CDK is selected; roles/bootstrap and traffic switching remain open.

## License

[MIT](LICENSE). LICENSE covers the application's own implementation and Matias Galeano's authorship; no third-party attribution file is maintained. Dependencies retain their licenses within their packages.

Subscriptions uses PORTFOLIO_CLOUD_API_URL, read only when invoking that slice. [Contracts, configuration, errors and provenance](Docs/subscriptions.md). Missing configuration yields controlled 500; health remains available.

[Starters/chat: contracts, configuration, references, differences and provenance](Docs/chat.md). New dependencies: S3 SDK 3.1156.0 for R2 and reflect-metadata 0.2.2 for nested history. Profile/projects/prompts retain audited SHA content; editorial refresh remains pending.

Chat professional location is corrected specifically to Posadas, Misiones, Argentina, with an explicit difference from the pinned SHA. FAQ and context also include the professional email contacto@matiasgaleano.dev from one shared fact. Other content retains its previous scope; general editorial renewal remains immediately before production. [Details and historical references](Docs/chat.md).

Phase 4 implements shared control for the managed handler. The current suite has 539 tests: 513 application, 12 tooling and 14 infrastructure. [Configuration, global budget, sessions, fallback and validation limits](Docs/runtime-hardening.md).
