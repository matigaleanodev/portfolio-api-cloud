# Production validation

[Español](production-rollout.es.md) · 2026-10-25.

The published portfolio consumes the TypeScript Lambda API through its HTTPS API Gateway URL. I preserved all six contracts and changed only the Angular services' base URL, without rewriting the frontend. Chat uses GPT-6 Luna as its only model, with explicit `none` reasoning and no alternative generation.

## Delivery and checks

I promoted the real `dist/handler.handler` package within the existing physical `portfolio-api-cloud-test` installation, with real Secrets Manager configuration. The candidate first passed private SigV4 smoke validation; anonymous and Observer calls returned 403. Public ingress was then enabled through one change-set modification without replacement. Lambda's code hash matches the reviewed ZIP.

Application revision: `1cc2cd32dd48b6fd6f8d09be36b824994d0f514d`; artifact: `12618050015`; digest: `sha256:a85f2fa509d68241da3818b5c87008fafb83d43dde2f12b3ccb1d6a8fea22646`. CI passed 625 tests and type, package, documentation and synthesis checks. The published frontend is merge `7cb9f15c3607f5a3ccec4115e30bbc4625aadd2c`, checked through publication-state and a real browser.

The following passed from `https://matiasgaleano.dev`:

| Method and path           | Result                                        |
| ------------------------- | --------------------------------------------- |
| GET /api/health           | 200                                           |
| POST /api/contact         | 204, test email received                      |
| GET /api/chat/starters    | 200, visible suggestions                      |
| POST /api/chat            | 201, AI from the interface and FAQ without AI |
| POST /api/subscriptions   | 200                                           |
| DELETE /api/subscriptions | 200                                           |

I used unique temporary addresses under my domain for subscribe/unsubscribe; both test records were removed. Other subscribers were neither queried nor modified. Operations delegate to portfolio-cloud. Its publisher refreshed canonical R2 knowledge with three published projects and 15 posts; curated profile facts retain Comafi/Boreal IT and Posadas.

CORS and preflight allow both portfolio origins; an unrelated origin receives no CORS permission. Different X-Forwarded-For/CF-Connecting-IP headers consumed the same quota, confirming they cannot replace sourceIp. There is no Function URL. Regional concurrency remains 10, without a reservation or increase. Regional bootstrap is disabled, and effective API Gateway permissions are restricted to `9vxryiyill` and its resources.

## Observed Luna usage

| Check             | Input | Cache writes | Output | Reasoning |    USD cost |
| ----------------- | ----: | -----------: | -----: | --------: | ----------: |
| Backend/cloud     |  1478 |         1475 |    107 |         0 | 0.000238175 |
| Foodly/Modo Playa |  3115 |         3112 |    167 |         0 | 0.000472800 |

Total including the initial 14-input/6-output-token model probe: **USD 0.000715375**. This is calculated from real usage and verified Standard rates, not an invoice or an AWS/Resend total. No reasoning tokens were observed. Provider duration was 4.603 s and 3.281 s for the two representative queries.

Admission reserved input at USD 0.125/M to cover 30-minute cache writes, plus a maximum of 600 output tokens at USD 0.50/M including reasoning. Shared state also retained earlier simulated-validation reservations: changing model/configuration neither reset the counter nor refunded money. FAQ produced no generation events or AI reservations.

## Recovery and limits

EC2 remains running and the legacy NestJS health endpoint returns 200 with the portfolio origin; its domain and existing data remain available. Traffic recovery reverts the frontend URL through a PR to `https://api.matiasgaleano.dev/api` and publishes through Actions, followed by all six contract checks. No functional regression required rollback during this cutover. Assemblies and receipts retain the previous new-infrastructure revision.

- Review rates and renew AI_PRICING_VALID_UNTIL before 2026-11-24; expiry blocks business. Packaged fallback also needs renewal within its 30-day freshness window.
- The monetary ceiling applies to admission by the new runtime, not account billing, infrastructure, Resend or the legacy API. Conservative reservations are not refunded after ambiguous failures.
- All three alarms were OK and have no notification actions. An alert channel and coverage for controlled HTTP errors remain pending. Logs retain 14 days without chat text or visitor identity.
- No exhaustive load, failure, recovery or forced-alarm matrix was run. Aborting transport does not prove provider billing stopped. People behind NAT share the additional origin/day limit.
- Clients with an older bundle must reload to adopt the new URL. Remote knowledge caches for five minutes; packaged fallback is a dated snapshot rather than a continuous replica.

## Provenance

[CI API](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40242591045) · [Foundation](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40242825388) · [Candidate](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40243378109) · [Public ingress](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40243932314) · [Frontend](https://github.com/matigaleanodev/portfolio/actions/runs/40244153897)

[Configuration and official pricing sources](production.md).
