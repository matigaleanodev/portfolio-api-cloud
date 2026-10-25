# Subscriptions: local subscribe and unsubscribe slice

[Español](subscriptions.es.md) · 2026-10-25.

**Current phase 4 status:** [runtime controls](runtime-hardening.md), locally implemented and tested: shared quotas, GLOBAL AI budget, session/origin limits, cancellation, versioned fallback, configuration and observability. Initial migration references retain their historical evidence; they do not establish AWS validation.

POST and DELETE /api/subscriptions return **200** with validated upstream JSON: a string message and optional string email. DELETE retains JSON in the request body, never the query. The provider is awaited. Health and contact remain available; [starters/chat](chat.md) now complete all six local contracts.

## Validation and transport

SubscriptionEmailDto retains the original decorator order: MaxLength(320), IsEmail and IsString during validation; Transform applies trim().toLowerCase() only to strings. Numbers, booleans, objects, null and arrays are not coerced. IsEmail also enforces its own limits: the 254-character fixture passes and the 255-character one fails; the DTO 320 limit does not expand email validation. Length is checked after normalization.

Existing class-transformer/class-validator dependencies are used with whitelist, forbidNonWhitelisted, stopAtFirstError and forbidUnknownValues:false. Of 36 original DTO references, 33 match and three declared differences follow the accepted contact policy:

- Two root arrays receive 400 with message: ["body must be an object"], replacing ValidationPipe messages.
- An extra prototype property receives 400; the original silently removes it and accepts the request.
- constructor and **proto** retain direct class-transformer behavior for the tested cases. Nest helpers are not copied and original fixtures are not rewritten to conceal differences.

The shared parser runs before CORS/security/quota. JSON/extended forms, base64, charsets and compression retain the **16 KiB decoded or expanded limit**. Subscription tests exercise both methods with plain/base64/gzip JSON, exact/+1-byte limits, null/primitives, incorrect MIME, duplicate/nested fields and URL encoded forms. Existing parser coverage retains its 36 references. Parser failures do not consume quota or receive CORS/security headers; DTO failures do. rawPath, case/trailing slash and functional CORS/security headers are preserved. CORS is not authentication.

## Configuration and HTTP provider

readSubscriptionConfiguration accepts an explicit map: PORTFOLIO_CLOUD_API_URL is required, trimmed and stripped of all trailing slashes. The endpoint is baseUrl + /subscriptions. As in the source, no URL validation, authentication, path normalization or custom headers are added.

createSubscriptionSender receives explicit configuration and native fetch. It sends POST/DELETE, Content-Type: application/json, JSON.stringify(dto) and AbortSignal.timeout(8000). No new dependency or copied third-party HTTP client. There are no application retries and upstream idempotency is not claimed.

| Upstream condition                                                      | Local HTTP response                                                  |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 2xx with string message and absent/string email                         | 200, only message/email; returned values are not normalized          |
| 2xx with invalid JSON, null, incorrect message or null/non-string email | 502, "El servicio de suscripciones devolvio una respuesta invalida." |
| 4xx, including 429, with nonempty string error                          | 400, same message and error: "Bad Request"                           |
| 4xx with empty string error                                             | 400, {"message":"Bad Request","statusCode":400}, no error field      |
| 4xx without string error or valid JSON                                  | 400, "No se pudo validar la solicitud de suscripcion."               |
| Other unsuccessful statuses, including 5xx                              | 502, "No se pudo procesar la suscripcion en este momento."           |
| fetch/network/abort rejection                                           | 503, "No se pudo conectar con el servicio de suscripciones."         |

Except for empty error, provider errors contain message, error ("Bad Request", "Bad Gateway" or "Service Unavailable") and statusCode. Empty success strings, optional email and removal of extra fields are preserved. A valid upstream 201 becomes local 200. A JSON-less 204 is an invalid success and becomes 502.

parseJson catches every body-read rejection. Therefore timeout during fetch yields 503, while rejection during response.json after a 2xx yields 502. A test uses the real eight-second AbortSignal.timeout to verify both branches without network. This preserves the source; it is not a total application deadline or cancellation of other providers.

The Lambda entry reads process.env only when subscriptions are used and never loads .env. As with contact, missing configuration produces **controlled 500 when the route is invoked**, while health works. This explicitly differs from mandatory startup validation in the original. An unconfigured provider never produces fabricated success.

Original free-form logs containing endpoints/network details are omitted because they can contain sensitive configuration or data. HTTP mappings remain; structured PII-free observability/correlation is deferred to stage 4. No real subscriber data or sensitive logs are used.

## Independent quotas

src/quota.ts reuses RateLimiterMemory composition: contact 5/h/IP, POST subscriptions 10/h/IP and DELETE subscriptions 10/h/IP, each with its own instance/prefix. Only limit/prefix are generalized; contact retains its five quota tests.

The fixed window starts with the first attempt. Attempt 11 blocks for one hour from that point; retries do not extend it. Logical expiry and per-IP timers are independent. The previous decision to replace Throttler remains, without per-hit decrements or its cross-key timer bug. Identity comes from requestContext.http.sourceIp, never X-Forwarded-For.

Validation/upstream failures consume quota. Health, parser failures, unsupported methods and preflight do not. Tests check X-RateLimit-Limit/Remaining/Reset, Retry-After, 429 JSON, concurrent reservation, independent methods/IPs, composition reset and expiry. Counters remain local memory, lost on restart and not shared between Lambdas.

## Evidence and provenance

Repository: [portfolio-api](https://github.com/matigaleanodev/portfolio-api/tree/a0ef80fa9f82d1cea5a31425a63ab0a344338c56). Commit: a0ef80fa9f82d1cea5a31425a63ab0a344338c56. Only pinned blobs were extracted; working-tree implementation and discarded experiment were not reused, and the source repository was not modified.

| Consulted blob                                     | SHA-256                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| src/subscriptions/subscriptions.dto.ts             | 1517296d2736d996e84af9002b7ca008809050b4c7376b686a9fb24c785deabd |
| src/subscriptions/subscriptions.types.ts           | d8a8304c02e36f965fdf93a830646dfd46e5b6e23ec3b217586fc38330c3b2a0 |
| src/subscriptions/subscriptions.controller.ts      | 877cbe9be95ece5b04ec4b538a11c58ed1f73ea91c0b0a54572548484a47c998 |
| src/subscriptions/subscriptions.service.ts         | d15b1c681ccb440dc819bcdeb1946ae41c5a5de7c6b5caec8985e56b05c42be9 |
| src/subscriptions/subscriptions.module.ts          | ad73c1783e0c39cd17460f1f11acb5b371468b9d8e0691c3081293f3880be0ac |
| src/subscriptions/subscriptions.controller.spec.ts | b13b230f889779f7426547b76ebc0fc15606a6ed6b11a8b55dc51f776ad5d3d7 |
| src/subscriptions/subscriptions.service.spec.ts    | 0d5a7dcacf30daa144cb0ffe49fd3309a8ef1eb8296b29cbb31a24c921c41f0e |
| test/subscriptions.e2e-spec.ts                     | b591279a031a2e4614a4e0221269a135025b6eeda1ffe46e810b2616d32640fc |
| src/config/runtime.config.ts                       | 366b7c532275fda3aaee639db60884999e3a0ee8f268b4a983124f6f6f672890 |
| src/config/runtime.config.spec.ts                  | 58563eaa8cefe638730012b3b2da9199d7bac226cfbf0a912470178c3d693845 |
| src/main.ts                                        | c8aff3128c62d1c6c4925d34d494aac053748f10d68e7d8b0cb41c04424ca1f7 |
| src/app.module.ts                                  | 7016d793fb8f0ac2a76c3b1b06d8f23d1755142ccc2f0b935b2e9f8e8d0201df |
| package.json                                       | 38599e23e6b9910f24f157ae19a55c30dcbf5e9e3d179d9dcdb4ab2f275e3961 |
| package-lock.json                                  | 1c8e0e7a8a82d944d61a4f6fe77c47c77bc48890ce5040e2a276010e8b7cbbd7 |

Own DTO/types, HTTP rules, configuration and service are adapted into functions/custom errors without DI/controller decorators or Nest/Express imports. Original unit/e2e specs guide delegation, configuration and mapping scenarios; Vitest runs the new tests.

test/subscriptions-reference.json contains 36 DTO references and 28 upstream responses generated by running original blobs with networking blocked. Reference generation alone used local packages whose versions matched the source lock: @nestjs/common 11.1.13, class-validator 0.14.3, class-transformer 0.5.1, reflect-metadata 0.2.2 and rxjs 7.8.2. This is a behavior reference with checked versions, not a new tarball integrity verification. None is added to runtime by this change. The public fixture includes versions/hashes; normal tests do not require the original repository, Nest or private tooling.

Fixture SHA-256: 40b7462405ca79185a9787cb92bee7455bb8c62859f70508e84ac6eff1ec707f. Prettier excludes this pinned evidence. The historical contact fixture retains its hash.

Both repositories are maintained by matigaleanodev. The source declares UNLICENSED; public visibility does not grant third-party licensing rights. This own implementation retains MIT and Matias Galeano authorship without changing the source license, adding NOTICE or a manual dependency inventory. Dependencies retain their bundled licenses.

## Local verification and limits

**82 new subscription tests**: 36 DTO/controller references, 28 upstream response references and 18 transport/configuration/timeout/quota/composition cases. Each reference family covers both methods. Three validation differences are declared without changing source expectations. Two previous tests requiring subscription 404s are replaced by real contracts.

At the subscription increment closure: **258 passing tests** (235 application, 12 tooling, 11 infrastructure), with isolated environment/network guard. Strict types, ESM build, formatting, external-checkout package smoke, bilingual documentation, workflows and lookup-free synth are checked locally. Package smoke exercises subscribe/unsubscribe, normalization, DELETE body, missing configuration and quotas without devDependencies. Executed Node: 24.22.1 LTS; [official release index checked on 2026-10-25](https://nodejs.org/en/blog/release). No lock changes or new dependency.

This does not establish AWS integration, effective permissions, upstream availability or managed transport. Shared atomic quotas, managed proxies/IP validation, total deadline, secrets/startup and recovery remain pending. The stack is still undeployed; public exposure is not enabled. Editorial renewal stays immediately before production.

[Current state and 479-case suite](chat.md). The earlier 258 count is the historical subscription closure; the chat increment audits its new lock separately.

## Phase 4 update

The managed handler uses shared quotas, Secrets Manager configuration validated before business, a total deadline and provider cancellation. Descriptions of local memory, lazy configuration/500 and partial timeouts refer to the initial migration or local composition adapter. [Hardening](runtime-hardening.md) records current controls and differences; effective permissions/proxies/providers still require managed validation.
