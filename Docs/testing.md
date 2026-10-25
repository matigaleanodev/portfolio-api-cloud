# Test cases

[Español](testing.es.md) · 2026-10-25.

Vitest **5.0.5** runs all **479 cases**: 456 application, 12 tooling and 11 infrastructure cases. The original 155 node:test and 12 unittest cases were migrated. Production CI scripts remain Python and Vitest exercises their real validations against local fixtures. The package smoke remains an executable Node verifier without development dependencies.

Case titles are Spanish with a **Given/When/Then** narrative (Dado/Cuando/Entonces). Historical fixtures retain their original values; readable titles describe the scenario without rewriting the baseline.

```bash
npm ci --ignore-scripts
npm test
```

`npm run test:app`, `npm run test:tooling` and `npm run test:infra` run individual scopes. `npm run check` adds typechecking, packaging, synth without lookups and documentation. Results appear in the Vitest console.

| Family               | Cases | Coverage                                                                             |
| -------------------- | ----: | ------------------------------------------------------------------------------------ |
| Health and HTTP      |    18 | health, routing, CORS and body limits                                                |
| Contact validation   |    69 | types, required fields, boundaries, Unicode, extra fields and honeypot               |
| Body parsing         |    36 | MIME, charset, forms, base64, compression and parser errors                          |
| Contact and provider |    18 | mocked delivery, concurrency, configuration and provider errors                      |
| Quota                |     5 | window, blocking, logical expiry and IP independence                                 |
| Isolation            |     5 | environment, composition and network fence                                           |
| Subscriptions        |    82 | subscribe/unsubscribe: DTO, upstream, timeout, transport, quotas and composition     |
| Tooling              |    12 | scope detection and real workflow validation with fake GitHub responses              |
| Infrastructure       |    11 | resources, IAM, payload v2, limits, logs, roles and asset                            |
| Chat                 |   223 | DTO, FAQ, context/history, publication, AI, R2/local, caches, quotas and composition |

The wrapper removes inherited environment values and disables AWS metadata and `.env` loading. Application/infrastructure projects load the network guard before imports, blocking providers, sockets, DNS and child processes. Tooling tests require local Python subprocesses, use a minimal environment and synthetic responses, and never execute gh/workflows. Compilation happens before the fence to preserve build decorator semantics.

Infrastructure tests inspect templates/assets rather than emulating AWS. SigV4, effective IAM/boundaries, bootstrap, HTTP API/Lambda integration, platform errors, isolated secrets/providers, distributed quotas, deadlines/cancellation and recovery remain pending. [Stack prerequisites](infrastructure.md). All six contracts are implemented locally. [Chat references and differences](chat.md).

Subscriptions adds **82 cases**: 36 DTO/controller references, 28 upstream references and 18 additional tests; each reference exercises POST and DELETE. Coverage includes real 8-second timeout, exact errors, independent/concurrent quotas, formats/limits, Lambda composition and no real effects. Two previous 404 expectations are replaced by actual contracts; health/contact retain coverage. [Provenance and differences](subscriptions.md).

Chat adds 223 tests: 59 DTO references, 18 domain/effect references, five content hashes, 74 adapted original scenarios, 20 provider/metrics, 33 repository/configuration/SDK and 14 HTTP/quota/composition cases. Two previous 404 expectations are replaced; an existing contact assertion now expects 400 for chat without message. Application total: 456.
