# Production configuration

[Español](production.es.md)

I retained the physical `portfolio-api-cloud-test` installation to avoid another API, table and set of roles. The production package uses `dist/handler.handler`, without simulated providers. The candidate requires IAM; `PublicAccess=true` enables anonymous access after private smoke validation. CORS permits only configured origins. The definitive domain is `api.matiasgaleano.dev`, using a regional ACM certificate and Cloudflare proxy. The handler requires the expected API/stage/domain, an official Cloudflare egress IP and `x-portfolio-origin` overwritten by a rule exclusive to this hostname. Only then does it accept one valid `CF-Connecting-IP`, with IPv6 normalization; `X-Forwarded-For` is ignored. The execute-api endpoint is closed after domain verification. The frontend can switch its base URL while retaining all six contracts.

## AI and costs

GPT-6 Luna is the only model accepted by configuration and provider. Responses uses explicit `reasoning.effort=none`, `store=false`, Standard tier (`default`), no tools, alternative generation or retries. Preflight counting uses the same model, input, format and reasoning. The 600-token output cap includes invisible and reasoning tokens. Only a `completed` response from the expected model can succeed.

Standard rates verified on 2026-10-25 are USD 0.10/M input tokens and USD 0.50/M output tokens. Admission reserves USD 0.125/M input to cover a possible cache write and USD 0.50/M for all output, without cache discounts. Inputs above 272,000 tokens are rejected to avoid long-context rates. Metrics distinguish input, cache hits, cache writes, output and reasoning; reasoning is already included in output and must not be billed twice.

FAQ stays local. Five AI replies per session and origin/day and atomic global reservations remain enforced before generation. Failures, timeouts and incomplete responses retain their reservation and return controlled contact guidance. Aborting local transport does not prove provider billing has stopped; cancellation by response ID only supports background Responses, which this app does not use. Pricing must be reviewed within 31 days; invalid or expired configuration disables only paid generation, including cached responses on warm instances; unrelated contracts remain available.

## Operations and recovery

Regional concurrency is 10. Lambda has no reservation: reserving 5 requires a quota above 100 to preserve the unreserved minimum. Gateway throttle remains 2/s, burst 5, alongside DynamoDB quotas and preflight spending reservations. Regional exhaustion can yield controlled errors without increasing admitted spend. No quota increase is requested.

Foundation permissions narrow API Gateway administration to API ID `9vxryiyill`, with regional bootstrap disabled. Real configuration uses a secret separate from validation. Logs omit text/PII and expire after 14 days; alarms cover errors, throttles and duration. A log metric filter covers controlled HTTP 5xx responses; all four alarms can publish to the dedicated SNS channel. Pending email confirmation does not establish operational notifications. Alarms never replace spending admission.

Traffic rollback keeps the frontend URL and restores the proxied DNS target to the retained Cloudflare Tunnel, as detailed below. EC2, the NestJS API, subscriber data and `portfolio-cloud` automation remain available. Reviewed assemblies recover code and infrastructure without restoring or deleting data or secrets.

## Sources

- [Luna model](https://developers.openai.com/api/docs/models/gpt-6-luna)
- [Pricing](https://developers.openai.com/api/docs/pricing)
- [Counting and invisible tokens](https://developers.openai.com/api/docs/guides/token-counting)
- [Reasoning](https://developers.openai.com/api/docs/guides/reasoning)
- [Cancellation](https://developers.openai.com/api/reference/resources/responses/methods/cancel)

## Validation

[HTTP, usage y recuperación](production-rollout.md).

## Pricing and fallback maintenance

Invalid or expired AI configuration disables paid generation only, including on warm instances and before cache reuse. FAQ, health, starters, contact and subscriptions keep their contracts when their own configuration is valid. No alternate model or provider is enabled.

Before `AI_PRICING_VALID_UNTIL`, review Standard pricing and limits for the sole model using official sources. If prices change, update conservative reservations in `shared-control.ts`, tests and the artifact through PR/CI first. Then renew the review date in Secrets Manager for no more than 31 days, preserving `QUOTA_KEY_SECRET`, the budget and existing reservations. Without review, generation stays disabled. Extending the date never replaces a pricing review.

Refresh the fallback from the editorial artifact published by `portfolio-cloud`; validate schema, checksum and maximum 30-day age, then replace the versioned file through PR/CI. Never put a fresh date on old content. FAQ and unrelated contracts remain available; requests needing expired editorial knowledge fail in a controlled way.

Traffic rollback keeps the frontend URL and restores the proxied `api.matiasgaleano.dev` CNAME to `7dcf5fb8-082e-4601-9282-8a0311759f7a.cfargotunnel.com`. The tunnel hostname and legacy service remain configured. Check health with the frontend Origin/User-Agent and affected contracts. Restore routing first if cutover regresses, then diagnose.

A log metric filter covers controlled HTTP 5xx responses alongside Lambda errors, throttles and duration. `AlarmTopicArn` connects all four alarms to SNS; pending email confirmation does not establish operational delivery.

[Official Cloudflare ranges](https://www.cloudflare.com/ips/), [visitor headers](https://developers.cloudflare.com/fundamentals/reference/http-request-headers/#cf-connecting-ip), [header rules](https://developers.cloudflare.com/rules/transform/request-header-modification/), [closing execute-api](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-disable-default-endpoint.html).
