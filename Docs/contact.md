# Contact: local vertical slice

[Español](contact.es.md) · 2026-10-24.

**Current phase 4 status:** [runtime controls](runtime-hardening.md), locally implemented and tested: shared quotas, GLOBAL AI budget, session/origin limits, cancellation, versioned fallback, configuration and observability. Initial migration references retain their historical evidence; they do not establish AWS validation.

`POST /api/contact` returns **204 with an empty body** after awaiting the provider. A valid truthy company honeypot returns the same 204 without sending. Subscribe/unsubscribe are also implemented; [starters/chat](chat.md) now complete all six local contracts. This slice has local tests; it does not establish full parity or AWS behavior.

## Direct validator usage

ContactDto preserves the audited SHA's decorators/order. Public APIs plainToInstance from class-transformer and validateSync from class-validator use whitelist, forbidNonWhitelisted, stopAtFirstError and forbidUnknownValues:false. There is no ValidationPipe copy, Nest-derived recursive cleanup or array-constructor manipulation.

- name: nonempty string, 2–100 characters; message: nonempty string, 10–5000. class-validator Unicode counting is preserved.
- email: IsEmail and maximum 150, without trim/lowercase or implicit conversion. Spaces follow the original validation rules.
- company: absent/null/empty string allows sending; any nonempty string, including spaces, triggers the honeypot. Maximum 200. Unknown fields and invalid types are rejected before the honeypot.
- Root arrays are rejected with 400 and `body must be an object`.
- class-transformer handles constructor and **proto** directly. An extra prototype field is rejected by whitelist instead of being silently removed.

The last two points explicitly differ from the source: messages change for two array fixtures and a prototype fixture changes from 204 to 400. The other 66 DTO/controller fixtures retain original results. Historical fixtures remain unchanged; current expectations are declared in tests rather than hiding differences.

## Parsing and transport

JSON/extended forms, arrays/duplicates/nesting, base64, BOM, UTF-16 and Latin1 where applicable, gzip/deflate/br and charset/encoding errors use body-parser. The limit is **16 KiB after decoding/decompression** for recognized MIME types. Unrecognized MIME alone does not produce a valid DTO.

Parsing precedes CORS/security/routing like source bootstrap. Parser failures consume no quota and receive none of those headers. The application's mapper uses body-parser's documented status/type/message: entity.parse.failed retains 400 with error Bad Request; other failures retain {statusCode,message}. Tests compare 36 parser references. DTO errors receive CORS/security/quota headers. 204 omits Content-Type; enabled preflight terminates before security. CORS does not authenticate.

HTTP API v2 events already contain the complete body: length is reconstructed without reproducing socket framing. Incorrect Content-Length, truncated requests, chunked transfer, gateway limits and bytes not representable without base64 require managed transport tests. No HTTP server or Express.

## Official Resend SDK

createContactSender preserves subject, indented text and es-AR / America/Argentina/Buenos_Aires formatting through Intl without imposing a new hourCycle. createResendProvider instantiates **resend 6.34.1** and delegates to emails.send; no maintained REST client or SDK copy. Base URL/User-Agent are explicit rather than environment overrides. [Official usage](https://resend.com/docs/send-with-nodejs).

Awaited sending, resolved/rejected errors mapped to controlled 500 and absence of retries in checked cases are preserved. Provider details are not exposed in responses. The SDK retains its envelope, including anomalous success for failed HTTP with JSON null; tests preserve it rather than introducing data/id validation.

Keys: RESEND_API_KEY, CONTACT_FROM_EMAIL and CONTACT_TO_EMAIL. Presence checked with trim; original values used for sending. No chat/upstream requirements or .env loading. Only the Lambda entry reads configuration. Health remains available without credentials; missing contact keys produce 500 when sending is attempted. Full original startup validation remains pending.

The SDK logs error details outside production; production configuration must set NODE_ENV=production, whose lack of logging is tested with a fake error. Transport tests explicitly replace fetch after loading the network guard. No real sending or total deadline/cancellation yet.

## Quota through rate-limiter-flexible

**rate-limiter-flexible 11.2.3** uses RateLimiterMemory.consume without Nest. Options: points=5, duration=3600, blockDuration=3600, keyPrefix=contact. Identity uses event sourceIp; X-Forwarded-For does not change the key. Invalid DTOs, honeypots and provider failures count; invalid parsing, health, preflight and pending methods do not.

The fixed window starts with each IP's first attempt. The sixth attempt blocks for one hour from that instant; blocked attempts do not extend the block. An unblocked expired window releases all points instead of Throttler's per-hit decrements. One IP cannot cancel another's expiry. This decision explicitly replaces the preserved Throttler 6.5.0 timer bug and previous local algorithm.

X-RateLimit-Limit/Remaining and Retry-After remain. X-RateLimit-Reset stays in remaining seconds, not epoch. 429 retains its historical JSON (`ThrottlerException: Too Many Requests`) for compatibility; it does not imply Nest usage. Tests cover concurrent reservation in one composition, time boundaries, logical expiration without running cleanup timers and independent IP expiry.

Storage remains **per process/composition**, lost on restart. It is not distributed Lambda protection: shared/atomic storage and actual proxy-chain validation remain in stage 4. No infrastructure is added now.

## Dependency selection and review

Checked on 2026-10-24. npm published rate-limiter-flexible 11.2.3 on 2026-10-17. GitHub shows recent activity, a non-archived repository and 3,596 stars; npm reports **11,332,225 downloads from 2026-09-24 to 2026-10-23**. These indicate maintenance/adoption, not unique users or guaranteed correctness. No production dependencies; bundled types. [Repository](https://github.com/animir/node-rate-limiter-flexible), [release](https://registry.npmjs.org/rate-limiter-flexible/11.2.3), [downloads](https://api.npmjs.org/downloads/point/2026-09-24:2026-10-23/rate-limiter-flexible).

Runtime: body-parser 2.4.0, class-validator 0.15.1, class-transformer 0.5.1, rate-limiter-flexible 11.2.3 and resend 6.34.1, pinned directly with locked transitives. Resend requires Node >=20 and includes postal-mime/standardwebhooks; its optional React renderer is not installed. @types/react 19.3.0 is development-only because SDK declarations reference it. src/resend-types.d.ts defines HeadersInit from Node's RequestInit to check those declarations without DOM or skipLibCheck. Metadata/licenses/engines and npm audit were checked: 0 reported vulnerabilities in the current lock.

## Contract evidence

155 application tests and 12 tooling tests passed. test/contact-reference.json preserves 69 DTO/controller references and 36 parser references generated from pinned blobs/verified original dependencies. The suite compares current behavior and declares the three validation differences above. Quota/provider have independent current tests. This is not a rerun of the 92 historical scenarios.

Public synthetic fixtures, clean environment and network guard loaded before imports. Tests require no original repository, Nest packages, private files or network. Packaging is checked outside the checkout with production dependencies, mocked SDK and original licenses inside each dependency.

Fixture SHA-256: `732287cc4aec10c9b49562e76b157cd45664dc3a2574fcd10728fc3de4edc144`.

## Application source provenance

Repository: [portfolio-api](https://github.com/matigaleanodev/portfolio-api/tree/a0ef80fa9f82d1cea5a31425a63ab0a344338c56). Commit: `a0ef80fa9f82d1cea5a31425a63ab0a344338c56`. Git blobs were read, not working-tree sources. The source repository is not modified.

| Consulted blob                         | SHA-256                                                          | Adaptation                                                          |
| -------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| src/contact/contact.dto.ts             | ca372034218ec6be2ae93404b76a947a49b96a6e72bf7f00438c42574c7e75e7 | DTO/decorators; explicit null and validation without ValidationPipe |
| src/contact/contact.service.ts         | c60972fc6eb3415d082e6f660634e42be6ba8424be2a4a545d2a61bf1f1091ef | text/date/awaited send; DI replaced by functions                    |
| src/contact/contact.controller.ts      | 128f2594d7f8f56ae74383a3720f6a55412c619ac93927f49ed9b93b6c315ff2 | routing/204/honeypot/quota; explicit composition                    |
| src/contact/contact.module.ts          | 394e5cefd5f7018021006c33cdba51449ef36c33260c6b07f3f1297490cecccb | composition responsibilities; no Nest module                        |
| src/contact/contact.controller.spec.ts | 76f18d6e0bcb5d0112d4986efeedfcb1c0528628b20b4b4b055a13fb7ae6270c | honeypot/send cases migrated to Vitest                              |
| src/contact/contact.service.spec.ts    | 37d751eefb508f9002d61d51740c69dee93bf655d497133b931491974dc786f4 | send/error/configuration cases adapted with mocks                   |
| test/contact.e2e-spec.ts               | 4c7c3273a6e8bcee950ca20e3b7bac135108759539111669dd8845ba405e7d90 | adapted contact HTTP scenarios                                      |
| src/config/runtime.config.ts           | 366b7c532275fda3aaee639db60884999e3a0ee8f268b4a983124f6f6f672890 | contact/CORS configuration presence and values                      |
| src/config/runtime.config.spec.ts      | 58563eaa8cefe638730012b3b2da9199d7bac226cfbf0a912470178c3d693845 | relevant configuration cases; no chat requirements                  |
| src/main.ts                            | c8aff3128c62d1c6c4925d34d494aac053748f10d68e7d8b0cb41c04424ca1f7 | parser/CORS/header order, limit and validation                      |
| src/app.module.ts                      | 7016d793fb8f0ac2a76c3b1b06d8f23d1755142ccc2f0b935b2e9f8e8d0201df | guard and per-method quota; no Nest bootstrap                       |
| package.json                           | 38599e23e6b9910f24f157ae19a55c30dcbf5e9e3d179d9dcdb4ab2f275e3961 | ownership/license and dependency review                             |
| package-lock.json                      | 1c8e0e7a8a82d944d61a4f6fe77c47c77bc48890ce5040e2a276010e8b7cbbd7 | reference versions/integrity; not copied                            |

The source declares UNLICENSED; public availability grants no third-party license. Both repositories are maintained by matigaleanodev. This implementation adopts [MIT](../LICENSE) by its copyright holder's decision; the pinned source retains its UNLICENSED status. No wholesale API or editorial-content copy.

## Packages consulted for historical reference

Tarballs were checked against source-lock sha512 integrity and the following files against SHA-256. They were consulted for fixtures or understanding earlier behavior; their implementations are not copied into the current runtime. Nest is not a dependency; Resend is now used through its installed SDK.

| Package                 | File                                | SHA-256                                                          |
| ----------------------- | ----------------------------------- | ---------------------------------------------------------------- |
| @nestjs/throttler@6.5.0 | dist/throttler.service.js           | 5850f253b1a2719c7ed0a38597552d050e0e9accd24a33fd475bc9d52bf7680b |
| @nestjs/throttler@6.5.0 | dist/throttler.guard.js             | f96d6921052ace949a5643d9e0787ac63088fbc2972bc7a55abb1b5a829b1d72 |
| resend@6.9.1            | dist/index.mjs                      | 346deced8e40b3c2d34b97999492389b880c66f26e918c884c05069ae13181d8 |
| @nestjs/common@11.1.13  | pipes/validation.pipe.js            | 5be8f691616ebb89f6289783d7323208bbca2f36fdb9015f53e0caf65c42a94c |
| @nestjs/core@11.1.13    | exceptions/base-exception-filter.js | 6aa1a71265bd693c1ab3f7c35ba98a670793c3beb3c5605df7e970088c0569fe |
| @nestjs/core@11.1.13    | router/routes-resolver.js           | 8b4b2444d27be7997398edcd4162a3d3dd8c546571bf8b53a2e99b57ae8a035d |

The application's own implementation is distributed under [MIT](../LICENSE), authored by Matias Galeano. Third-party copies/adaptations that motivated project-file attributions have been removed. Dependencies are used through public APIs and retain licenses inside their packages; there is no separate attribution file.

## Actual remaining work

Distributed quotas, managed proxies/IP, deadline/cancellation, secrets/startup policy, API Gateway/IAM tests and recovery. The local timer bug is resolved through the library replacement; stage 4 remains open for distribution. Editorial refresh remains immediately before production. [Application and checks](application.md).

The complete suite migrated to Vitest; 11 infrastructure cases were added without removing the 155 application cases. [QA case format](testing.md).

As of 2026-10-25 the current suite has 456 application, 12 tooling and 11 infrastructure tests (479). The previous 155 count describes the contact slice; two 404 expectations are replaced and 82 [subscription tests](subscriptions.md) are added. The quota module is now src/quota.ts, with unchanged contact semantics.

## Phase 4 update

The managed handler uses shared quotas, Secrets Manager configuration validated before business, a total deadline and provider cancellation. Descriptions of local memory, lazy configuration/500 and partial timeouts refer to the initial migration or local composition adapter. [Hardening](runtime-hardening.md) records current controls and differences; effective permissions/proxies/providers still require managed validation.
