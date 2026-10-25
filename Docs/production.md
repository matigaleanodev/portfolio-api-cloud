# Production configuration

[Español](production.es.md)

I retained the physical `portfolio-api-cloud-test` installation to avoid another API, table and set of roles. The production package uses `dist/handler.handler`, without simulated providers. The candidate requires IAM; `PublicAccess=true` enables anonymous access after private smoke validation. CORS permits only configured origins. Client identity comes from the direct gateway's `requestContext.http.sourceIp`; client headers cannot replace it. The frontend can switch its base URL while retaining all six contracts.

## AI and costs

GPT-6 Luna is the only model accepted by configuration and provider. Responses uses explicit `reasoning.effort=none`, `store=false`, Standard tier (`default`), no tools, alternative generation or retries. Preflight counting uses the same model, input, format and reasoning. The 600-token output cap includes invisible and reasoning tokens. Only a `completed` response from the expected model can succeed.

Standard rates verified on 2026-10-25 are USD 0.10/M input tokens and USD 0.50/M output tokens. Admission reserves USD 0.125/M input to cover a possible cache write and USD 0.50/M for all output, without cache discounts. Inputs above 272,000 tokens are rejected to avoid long-context rates. Metrics distinguish input, cache hits, cache writes, output and reasoning; reasoning is already included in output and must not be billed twice.

FAQ stays local. Five AI replies per session and origin/day and atomic global reservations remain enforced before generation. Failures, timeouts and incomplete responses retain their reservation and return controlled contact guidance. Aborting local transport does not prove provider billing has stopped; cancellation by response ID only supports background Responses, which this app does not use. Pricing must be reviewed within 31 days; expiry blocks business until configuration is renewed.

## Operations and recovery

Regional concurrency is 10. Lambda has no reservation: reserving 5 requires a quota above 100 to preserve the unreserved minimum. Gateway throttle remains 2/s, burst 5, alongside DynamoDB quotas and preflight spending reservations. Regional exhaustion can yield controlled errors without increasing admitted spend. No quota increase is requested.

Foundation permissions narrow API Gateway administration to API ID `9vxryiyill`, with regional bootstrap disabled. Real configuration uses a secret separate from validation. Logs omit text/PII and expire after 14 days; alarms cover errors, throttles and duration. Alarms without actions require operational review and never replace spending admission.

Traffic rollback restores the frontend base URL to `https://api.matiasgaleano.dev/api` and publishes a recoverable revision through Actions. EC2, the NestJS API, subscriber data and `portfolio-cloud` automation remain available. Reviewed assemblies recover code and infrastructure without restoring or deleting data or secrets.

## Sources

- [Luna model](https://developers.openai.com/api/docs/models/gpt-6-luna)
- [Pricing](https://developers.openai.com/api/docs/pricing)
- [Counting and invisible tokens](https://developers.openai.com/api/docs/guides/token-counting)
- [Reasoning](https://developers.openai.com/api/docs/guides/reasoning)
- [Cancellation](https://developers.openai.com/api/reference/resources/responses/methods/cancel)
