# Local handler application

[Español](application.es.md) · 2026-10-25.

**Current phase 4 status:** [runtime controls](runtime-hardening.md), locally implemented and tested: shared quotas, GLOBAL AI budget, session/origin limits, cancellation, versioned fallback, configuration and observability. Initial migration references retain their historical evidence; they do not establish AWS validation.

## Structure and configuration

- src/shared-control.ts: quota CAS and GLOBAL/session/origin transactional reservation in DynamoDB.
- src/runtime-config.ts: validated JSON secret, price review and bounded refresh.
- src/request-scope.ts: per-request context, deadline, cancellation and filtered metrics.

- src/handler.ts: Lambda entry; reads CORS at initialization, contact keys when sending, and the cloud URL for subscriptions. Never loads .env.
- src/config.ts: explicit maps, frozen CORS and contact/subscription configuration validation.
- src/application.ts: async composition, rawPath, CORS/headers, health, quota/validation/contact/subscriptions and controlled errors.
- src/health.ts: process status with no providers or quota.
- src/body.ts: complete-event adaptation to body-parser without a server or connected sockets.
- src/contact.dto.ts: project-owned DTO with direct class-transformer/class-validator use and explicit ValidationPipe differences.
- src/contact.ts: message/date/awaited send and direct official Resend SDK usage.
- src/subscriptions.dto.ts: subscribe/unsubscribe DTO and email normalization.
- src/subscriptions.ts: native HTTP provider, upstream JSON validation and custom errors.
- src/quota.ts: local rate-limiter-flexible quotas: contact 5/h/IP, independent subscribe/unsubscribe 10/h/IP and starters/chat 20/min/IP; fixed windows and independent IP expiry.

`GET /api/health` → 200 {status:ok}; `POST /api/contact` → empty 204. POST and DELETE /api/subscriptions return 200; starters returns 200 and chat 201. Health does not check provider availability. Full original startup validation remains pending: health stays available without credentials; missing contact keys produce 500 when sending is attempted.

CORS preserves lists, disabled behavior when absent and reflected origins for wildcard. Unlisted origins receive no Allow-Origin; this is not authentication. Parser before CORS/security and preflight before security follow source bootstrap. 204 omits Content-Type. [Contact contract, limits and differences](contact.md).

## Toolchain and package

Target **Node 24.22.1 LTS**, Linux x64/WSL2, latest LTS verified on 2026-10-25 through the [official index](https://nodejs.org/dist/index.json); Node 26 remains Current. The existing isolated binary was executed, checking process.version, without global installations. .nvmrc, engines and workflows retain that version. The historical experiment retains Node 24.19.0.

TypeScript 6.0.3, @types/node 24.19.2, @types/aws-lambda 8.10.164 and @types/body-parser 1.19.6 are development-only. Runtime uses body-parser 2.4.0, class-validator 0.15.1, class-transformer 0.5.1, rate-limiter-flexible 11.2.3 and resend 6.34.1. These parsing/validation utilities preserve contracts; no HTTP framework or bundler is added. Resend is an installed SDK rather than adapted code. Direct versions are pinned and the new lock is audited. [Review and provenance](contact.md).

tsc builds ESM/ES2023 with validation decorators and no DI metadata. Strict types cover sources/tests, exactOptionalPropertyTypes and noUncheckedIndexedAccess, without skipLibCheck. Verification scripts do not modify sources; `npm run format` explicitly applies formatting.

The package requires dist/, package.json with type:module, LICENSE and **production node_modules** from package-lock.json. dist/manifest alone are no longer sufficient. test:package copies only non-dev lock dependencies outside the checkout and checks health/contact/subscriptions with mocks, absence of Nest/Express/React/TypeScript, ignored synthetic .env and blocked network. Dependency licenses are retained. The same function stages the asset for the [local CDK stack](infrastructure.md).

The SDK requires development-only @types/react 19.3.0. src/resend-types.d.ts supplies HeadersInit from Node fetch types without DOM, runtime React or skipLibCheck.

## Local checks

```bash
npm ci --ignore-scripts
npm run check
python3 scripts/ci_scope.py
actionlint
npm audit
```

**513 application tests passed**, including 82 new subscription tests (36 DTO references, 28 upstream and 18 additional cases), 69 DTO/controller references (66 unchanged, 3 explicit direct-validator differences) and 36 parser references; 49 tooling tests (5 CI scope, 7 merge workflow, 2 preparation workflow, 13 bundle, 7 foundation and 15 artifact recovery). Types, build, separate ESM smoke, documentation pairs/links and actionlint passed on Node 24.22.1. npm audit of the current lock: **0 reported vulnerabilities**, including development; this does not guarantee freedom from future issues.

The suite clears inherited environment and loads the network guard before importing application code. It blocks fetch/WebSocket, HTTP(S), socket/TLS/UDP connections, DNS and child processes. Parsing uses in-memory streams without listening on ports. Providers are explicit mocks; no emails are sent. The guard prevents accidental calls, not hostile code.

npm ci and validation are reproduced from a temporary tree of public files without .git, private files, .tmp, previous dist or node_modules. The suite needs neither the original repository nor reference Nest packages. Synthetic fixtures are public. No remote workflows, cold-start measurements or cost extrapolations.

## Partial contract coverage

| Covered           | Evidence                                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Health            | exact JSON/status, HEAD, rawPath/stage/query, case/slash, no provider/quota                                                   |
| Contact           | original DTO rules with three explicit differences; unknown/null/optional/Unicode cases, honeypot, empty 204 and awaited send |
| Provider          | payload/text/date/destinations, resolved/rejected/JSON failures, controlled 500, no retries                                   |
| Parsing           | JSON/extended forms, base64/UTF-8/UTF-16/Latin1/BOM, compression/errors, decoded 16 KiB                                       |
| Local quota       | 5/h/IP, sourceIp versus XFF, concurrent reservation, fixed windows/blocking, logical expiration and independent IP expiry     |
| Headers           | original CORS/security order, rate-limit/Retry-After, no Content-Type on 204                                                  |
| Pending routes    | six local contracts; managed integration pending                                                                              |
| Isolation/package | fake configuration, blocked network, ignored .env, production without dev dependencies                                        |

The differential scope is finite, not full API parity. Actual framing/proxies/gateway, distributed quotas, deadline/cancellation, full startup, secrets/IAM and recovery remain unverified. Local quota is lost on restart and not shared across environments; it does not make public exposure acceptable. [Detailed limits and new provenance](contact.md).

## Provenance and ownership

Reference: [portfolio-api](https://github.com/matigaleanodev/portfolio-api/tree/a0ef80fa9f82d1cea5a31425a63ab0a344338c56), commit `a0ef80fa9f82d1cea5a31425a63ab0a344338c56`. Only pinned blobs were read; no prototype recovery or source repository modifications.

| Consulted blob               | SHA-256                                                          | Use                                               |
| ---------------------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| src/app.controller.ts        | 4c590447c3a5451e12ee62392ed42f3858fb9d551a330032f99d36448ff8c59a | health contract; function without decorators      |
| src/main.ts                  | c8aff3128c62d1c6c4925d34d494aac053748f10d68e7d8b0cb41c04424ca1f7 | routes, limit, CORS and headers; event adaptation |
| src/config/runtime.config.ts | 366b7c532275fda3aaee639db60884999e3a0ee8f268b4a983124f6f6f672890 | CORS semantics; minimal explicit configuration    |
| package.json                 | 38599e23e6b9910f24f157ae19a55c30dcbf5e9e3d179d9dcdb4ab2f275e3961 | license and dependency comparison                 |

Both repositories are maintained by matigaleanodev. The source declares UNLICENSED and has no LICENSE/LICENSE.md at that SHA. This implementation is distributed under [MIT](../LICENSE) by its copyright holder's decision; this does not change the original repository's license. A public repository does not imply a third-party license grant. TypeScript declares Apache-2.0; type packages declare MIT. No wholesale API copy; chat carries only its pinned curated content without editorial refresh.

The contact increment adds [per-blob and reference-package provenance](contact.md). The [chat increment](chat.md) completes all six contracts with simulated providers; bot refresh remains reserved for immediately before production.

## Vitest and local infrastructure

All suites use Vitest 5.0.5: 513 application cases, 49 tooling cases and 18 infrastructure cases, **580 passing**. Package smoke remains a Node verifier without devDependencies. Spanish Given/When/Then titles and [test case format](testing.md). CDK v2 is installed and the test stack synthesizes without lookups; [resources and limits](infrastructure.md). Only infrastructure disables exactOptionalPropertyTypes due to CDK declaration incompatibility; application retains it. No deployment.

## Code formatting

Prettier 3.9.10 is pinned as a development dependency, with explicit readability rules: advisory 100 columns, two spaces and single quotes. It formats supported sources, tests, infrastructure, JavaScript scripts, configuration and documentation. `format` writes changes; `format:check` only checks and is part of `check` and CI. The historical fixture and its hash are preserved. Python is outside Prettier's scope.

[Subscription contracts, configuration, timeout, differences and hashes](subscriptions.md). src/subscriptions.dto.ts validates and normalizes; src/subscriptions.ts composes the HTTP provider without new dependencies. The package preserves both methods and quotas; AWS validation remains pending.

src/chat/ composes DTO, FAQ, context, AI and R2/local repository from the pinned SHA. S3 SDK 3.1156.0 and reflect-metadata 0.2.2 are new direct dependencies; bounded JSON metrics without Nest. handler.ts retains composition from the first valid POST. Smoke now exercises 201/503, quotas and synthetic local/remote knowledge. [223 new cases, differences and hashes](chat.md).

Chat professional location is corrected specifically to Posadas, Misiones, Argentina, with an explicit difference from the pinned SHA. FAQ and context also include the professional email contacto@matiasgaleano.dev from one shared fact. Other content retains its previous scope; general editorial renewal remains immediately before production. [Details and historical references](chat.md).

## Phase 4 update

The managed handler uses shared quotas, Secrets Manager configuration validated before business, a total deadline and provider cancellation. Descriptions of local memory, lazy configuration/500 and partial timeouts refer to the initial migration or local composition adapter. [Hardening](runtime-hardening.md) records current controls and differences; effective permissions/proxies/providers still require managed validation.
