# Local handler foundation

[Español](application.es.md) · 2026-10-24.

## Structure and configuration

- `src/handler.ts`: Lambda `handler` entry; reads environment once per initialization.
- `src/config.ts`: accepts an explicit map, normalizes and freezes CORS; reads no files or credentials.
- `src/application.ts`: grouped composition, rawPath routing, CORS and HTTP API v2 responses.
- `src/health.ts`: process health with no provider calls or initialization.

Health does not check Resend, R2, AI or upstream availability. No empty provider interfaces are added: required composition and configuration will arrive with each real slice. The other five routes return 404; general CORS preflight does not register business routes.

CORS preserves lists, disabled behavior when absent and origin reflection for wildcard. An unlisted origin receives no Allow-Origin; this is not authentication. Enabled OPTIONS returns 204 before security headers, matching original bootstrap order. Future infrastructure must avoid duplicate CORS configuration.

## Toolchain and package

Target **Node 24.22.1 LTS**, Linux x64 / WSL2. It is the latest LTS as of 2026-10-24; Node 26 remains Current. The [October 21 release](https://nodejs.org/en/blog/release/v24.22.1) includes security fixes. .nvmrc, engines and all Node jobs target 24.22.1. It was run through an isolated npm package without changing WSL's global Node. The historical experiment retains its 24.19.0 measurement.

TypeScript 6.0.3, @types/node 24.19.2 and @types/aws-lambda 8.10.164 are pinned development dependencies. TypeScript 6 uses the JS compiler, avoiding 7.0.2's platform binary packages. Node 24 types maintain the target API. The new lock also includes undici-types 7.24.6 as a types dependency; it is not a runtime HTTP client. The experimental lock was not reused.

tsc builds ESM/ES2023 without a bundler or runtime dependencies. `dist/` and `package.json` form the package foundation; AWS type imports are erased. There is no deployment ZIP or infrastructure template. `typecheck` includes sources and specs with strict, exactOptionalPropertyTypes and noUncheckedIndexedAccess; it does not use skipLibCheck.

## Local checks

```bash
npm ci --ignore-scripts
npm run check
python3 -m unittest discover -s scripts -p 'test_*.py'
python3 scripts/ci_scope.py
actionlint
npm audit
```

28 application tests, 5 CI detection tests and 7 merge-workflow validation tests passed. Types, build, out-of-checkout ESM smoke, document pairs/links and actionlint passed. Current suite passed on Node 24.22.1 LTS. Review corrected comma/space-only CORS_ORIGIN: it disables CORS like the source, with a dedicated regression test. npm audit of the new lock: **0 reported vulnerabilities**, including development; this does not guarantee freedom from future issues.

The runner removes inherited environment before executing specs and loads the network guard before importing application code. It blocks fetch/WebSocket, HTTP(S), sockets/TLS/UDP, DNS and child processes, with its own regression test. This prevents accidental calls; it is not a sandbox for hostile code. No SDKs or real providers are installed. Future business tests must explicitly inject mocks.

The smoke copies dist and manifest outside the checkout without node_modules, creates a synthetic .env and confirms health ignores it. Scripts require only public files and lockfile dependencies. npm ci and validation were reproduced on Node 24.22.1 in a temporary tree without .git, private files, previous node_modules or dist; actionlint received explicit workflow paths. No startup timings or cost extrapolations were recorded.

## Partial contract coverage

| Covered             | Evidence                                                                          |
| ------------------- | --------------------------------------------------------------------------------- |
| GET /api/health     | 200, exact JSON, functional headers, no quota or providers                        |
| Health transport    | rawPath independent of stage/query, trailing slash/case, bodyless HEAD            |
| CORS                | listed/unlisted/wildcard origins, preflight and headers on 404                    |
| Basic body handling | 16 KiB limit, UTF-8/base64, urlencoded and 400 for invalid/primitive JSON         |
| Pending routes      | explicit 404 without simulated success                                            |
| Isolation           | independent configurations, no credentials, clean environment and blocked network |

Exact original parsing error text, compression/content-encoding, charsets, DTO validation and nested urlencoded parsing do not yet have demonstrated parity. Current 400 uses a controlled message and is not claimed as differential equivalence with the original. Distributed quotas, Throttler timers, five business contracts, providers, fallback/editorial behavior, IAM and actual AWS transport are also uncovered. Health without business configuration is deliberate for this slice; full startup validation will arrive when composing those routes.

## Provenance and ownership

Reference: [portfolio-api](https://github.com/matigaleanodev/portfolio-api/tree/a0ef80fa9f82d1cea5a31425a63ab0a344338c56), commit `a0ef80fa9f82d1cea5a31425a63ab0a344338c56`. Only pinned blobs were read; no prototype recovery or source repository modifications.

| Consulted blob               | SHA-256                                                          | Use                                               |
| ---------------------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| src/app.controller.ts        | 4c590447c3a5451e12ee62392ed42f3858fb9d551a330032f99d36448ff8c59a | health contract; function without decorators      |
| src/main.ts                  | c8aff3128c62d1c6c4925d34d494aac053748f10d68e7d8b0cb41c04424ca1f7 | routes, limit, CORS and headers; event adaptation |
| src/config/runtime.config.ts | 366b7c532275fda3aaee639db60884999e3a0ee8f268b4a983124f6f6f672890 | CORS semantics; minimal explicit configuration    |
| package.json                 | 38599e23e6b9910f24f157ae19a55c30dcbf5e9e3d179d9dcdb4ab2f275e3961 | license and dependency comparison                 |

Both repositories are maintained by matigaleanodev. The source declares UNLICENSED and has no LICENSE/LICENSE.md at that SHA; this manifest retains UNLICENSED. A public repository does not imply a third-party license grant. TypeScript declares Apache-2.0; type packages declare MIT. No wholesale API or professional/editorial content copy.

The next stage incrementally reuses logic/DTOs from that SHA with per-file provenance, starting with a business slice using simulated providers. Bot data refresh remains reserved for immediately before production.
