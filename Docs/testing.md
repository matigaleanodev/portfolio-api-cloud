# Test cases

[Español](testing.es.md) · 2026-10-25.

**Current increment:** [first installation with doubles and Actions delivery](managed-validation.md), deployed and verified on AWS with simulated providers. [First private deployment result](first-private-deploy.md). Design and audit sections retain their earlier context.

**Current phase 4 status:** [runtime controls](runtime-hardening.md), locally implemented and tested: shared quotas, GLOBAL AI budget, session/origin limits, cancellation, versioned fallback, configuration and observability. Initial migration references retain their historical evidence; they do not establish AWS validation.

Vitest **5.0.5** runs all **617 cases**: 529 application, 69 tooling and 19 infrastructure cases. The original 155 node:test and 12 unittest cases were migrated. Production CI scripts remain Python and Vitest exercises their real validations against local fixtures. The package smoke remains an executable Node verifier without development dependencies.

Case titles are Spanish with a **Given/When/Then** narrative (Dado/Cuando/Entonces). Historical fixtures retain their original values; readable titles describe the scenario without rewriting the baseline.

```bash
npm ci --ignore-scripts
npm test
```

`npm run test:app`, `npm run test:tooling` and `npm run test:infra` run individual scopes. `npm run check` adds typechecking, packaging, synth without lookups and documentation. Results appear in the Vitest console.

| Family               | Cases | Coverage                                                                             |
| -------------------- | ----: | ------------------------------------------------------------------------------------ |
| Health and HTTP      |    19 | health, routing, CORS and body limits                                                |
| Contact validation   |    69 | types, required fields, boundaries, Unicode, extra fields and honeypot               |
| Body parsing         |    36 | MIME, charset, forms, base64, compression and parser errors                          |
| Contact and provider |    19 | mocked delivery, concurrency, configuration and provider errors                      |
| Quota                |     5 | window, blocking, logical expiry and IP independence                                 |
| Isolation            |     5 | environment, composition and network fence                                           |
| Subscriptions        |    82 | subscribe/unsubscribe: DTO, upstream, timeout, transport, quotas and composition     |
| Tooling              |    69 | scope detection and real workflow validation with fake GitHub responses              |
| Hardening            |    57 | concurrency, global budget, sessions, startup, cancellation and fallback             |
| Infrastructure       |    19 | resources, IAM, payload v2, limits, logs, roles and asset                            |
| Chat                 |   223 | DTO, FAQ, context/history, publication, AI, R2/local, caches, quotas and composition |

The wrapper removes inherited environment values and disables AWS metadata and `.env` loading. Application/infrastructure projects load the network guard before imports, blocking providers, sockets, DNS and child processes. Tooling tests require local Python subprocesses, use a minimal environment and synthetic responses, and never execute gh/workflows. Compilation happens before the fence to preserve build decorator semantics.

Infrastructure tests inspect templates/assets rather than emulating AWS. The private smoke verified SigV4, six contracts and the shared quota with real Secrets Manager/DynamoDB. Platform errors, real providers, concurrency under load, deadlines/cancellation and recovery remain before production. [Stack prerequisites](infrastructure.md). All six contracts are implemented locally. [Chat references and differences](chat.md).

Subscriptions adds **82 cases**: 36 DTO/controller references, 28 upstream references and 18 additional tests; each reference exercises POST and DELETE. Coverage includes real 8-second timeout, exact errors, independent/concurrent quotas, formats/limits, Lambda composition and no real effects. Two previous 404 expectations are replaced by actual contracts; health/contact retain coverage. [Provenance and differences](subscriptions.md).

Chat adds 223 tests: 59 DTO references, 18 domain/effect references, five content hashes, 74 adapted original scenarios, 20 provider/metrics, 33 repository/configuration/SDK and 14 HTTP/quota/composition cases. Two previous 404 expectations are replaced; an existing contact assertion now expects 400 for chat without message. Application total: 513.

## Phase 4 update

The managed handler uses shared quotas, Secrets Manager configuration validated before business, a total deadline and provider cancellation. Descriptions of local memory, lazy configuration/500 and partial timeouts refer to the initial migration or local composition adapter. [Hardening](runtime-hardening.md) records current controls and differences; effective permissions/proxies/providers still require managed validation.

The phase 5/6 increment adds 19 tests: thirteen bundle tests, two preparation workflow tests and four infrastructure assertions. [Design and subsequent criteria](deployment-design.md).

The previous preparation added 22 cases: seven IAM/foundation ceiling checks and fifteen run/digest recovery cases, including failed CI, PR artifacts, foreign revision/run/attempt, expiration, unsafe ZIP and alterations. Total: 617 (529 application, 69 tooling, 19 infrastructure). The template was also checked with cfn-lint 1.57.2; this does not simulate IAM or prove effective AWS compatibility.

Isolated validation adds 16 application cases, 17 change set/tooling review cases and one infrastructure assertion. Current total: 617 (529 application, 69 tooling, 19 infrastructure). Both packages run behind a network fence; the validation entrypoint smoke keeps real SDKs and simulates their responses only inside the test.
