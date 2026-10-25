# Test cases

[Español](testing.es.md) · 2026-10-24.

Vitest **5.0.5** runs all **178 cases**: 155 application, 12 tooling and 11 infrastructure cases. All 155 node:test and 12 unittest cases were migrated. Production CI scripts remain Python and Vitest exercises their real validations against local fixtures. The package smoke remains an executable Node verifier without development dependencies.

Case titles are Spanish with a stable ID and **Given/When/Then** narrative (Dado/Cuando/Entonces). Historical fixtures retain their original values; readable titles describe the scenario without rewriting the baseline.

```bash
npm ci --ignore-scripts
npm test
```

`npm run test:app`, `npm run test:tooling` and `npm run test:infra` run individual scopes. `npm run check` adds typechecking, packaging, synth without lookups and documentation. Results appear in the Vitest console.

| Family                  | Cases | Coverage                                                                |
| ----------------------- | ----: | ----------------------------------------------------------------------- |
| HEA, RUT, COR, PAR-JSON |    22 | health, routing, CORS and body limits                                   |
| DTO                     |    69 | types, required fields, boundaries, Unicode, extra fields and honeypot  |
| PAR                     |    36 | MIME, charset, forms, base64, compression and parser errors             |
| CON, CFG, PRO           |    18 | mocked delivery, concurrency, configuration and provider errors         |
| CUO                     |     5 | window, blocking, logical expiry and IP independence                    |
| AIS                     |     5 | environment, composition and network fence                              |
| CI, INT                 |    12 | scope detection and real workflow validation with fake GitHub responses |
| INF                     |    11 | resources, IAM, payload v2, limits, logs, roles and asset               |

The wrapper removes inherited environment values and disables AWS metadata and `.env` loading. Application/infrastructure projects load the network guard before imports, blocking providers, sockets, DNS and child processes. Tooling tests require local Python subprocesses, use a minimal environment and synthetic responses, and never execute gh/workflows. Compilation happens before the fence to preserve build decorator semantics.

Infrastructure tests inspect templates/assets rather than emulating AWS. SigV4, effective IAM/boundaries, bootstrap, HTTP API/Lambda integration, platform errors, isolated secrets/providers, distributed quotas, deadlines/cancellation and recovery remain pending. [Stack prerequisites](infrastructure.md). Four unimplemented business routes remain outside coverage.
