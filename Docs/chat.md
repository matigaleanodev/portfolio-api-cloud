# Starters and chat with explicit providers

[Español](chat.es.md) · 2026-10-25.

## Contracts and composition

GET /api/chat/starters returns **200** with suggestedQuestions: “¿Quién sos y a qué te dedicás?” and “¿Qué tecnologías usás?”. HEAD shares this route/quota with an empty body. POST /api/chat returns **201** with answer, suggestedQuestions and source (faq, ai or fallback). Routing retains case/trailing-slash behavior, the shared 16 KiB parser, CORS and functional headers. Each method has an independent **20/min/IP** quota, also independent from contact and subscriptions; identity comes from event sourceIp, never XFF.

src/chat/ retains concrete source domain modules: DTO, FAQ, content, contextual selection, Argentina publication dates, OpenAI provider, knowledge repository and metrics. chat.providers.ts constructs explicit instances; application.ts adapts HTTP without Nest/Express. handler.ts creates and retains chat composition on the first valid POST. Starters requires no provider configuration.

Validation: nonblank message string, maximum 500 UTF-16 units; optional/null sessionId string up to 100; optional/null history array of at most six turns; role user/assistant and nonblank content string up to 1500. Text is neither trimmed nor normalized. Unknown fields, including nested ones, are rejected; stopAtFirstError per property and history.0 error prefixes are preserved. History travels in the request: sessionId provides neither identity nor persisted conversation.

Preserved order: out-of-scope → FAQ only without history → context selection → FAQ rephrasing/AI → fallback. FAQ can consume AI; source faq does not imply no provider cost. Professional queries use curated profile without R2. Editorial queries need valid knowledge and retain **503** when unavailable, even with a FAQ match. AI failure with context yields technical fallback rather than claiming missing facts. Suggestion merging, deduplication and limits follow the source.

Ranking, conversational references, separation of professional/project facts, links and prompts are retained. The only content correction is the professional location: **Posadas, Misiones, Argentina**, confirmed by the owner, replaces Villa Gesell from the audited SHA and propagates to context and FAQ. Five exported-value hashes normalize only this substitution; historical responses and requests declare the same adaptation without rewriting the fixture. The rest of the profile was not revalidated, and projects, editorial sources and prompts were not refreshed. General renewal remains immediately before production. Future/invalid posts are excluded using Argentina day boundaries.

## Configuration and providers

OpenAI reads OPENAI_API_KEY without trim and OPENAI_CHAT_MODEL defaulting to gpt-4.1-mini. Missing key/context returns null without a provider call. Native fetch to /v1/responses, temperature 0.3, max_output_tokens 300, JSON mode, ordered history and prompt text are preserved. No new SDK or store/retention change. [OpenAI Docs](https://developers.openai.com/api/docs/guides/text).

AI abort remains 15 seconds; failed HTTP, invalid JSON/response, network error or abort yield null/fallback. The original first output/content block indexing is retained. SHA-256 cache keys include message/context/history/links/suggestions, TTL 24 hours, maximum 200 entries and insertion-order eviction; no AI single-flight or application retries.

R2 requires trimmed R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY together. With none, only filesystem is used; partial configuration fails. R2_REGION defaults to auto; CHAT_KNOWLEDGE_OBJECT_KEY to artifacts/chat/knowledge.json; CHAT_KNOWLEDGE_CACHE_TTL_MS uses parseInt, minimum 1000 ms and five-minute default. S3 client has explicit endpoint/credentials and forcePathStyle; GetObject receives Bucket/Key. Tests use no professional credentials or AWS queries.

Knowledge order: remote cache → single-flight R2 → stale in-memory cache on failure → local fallback → error. Fallback retains cwd .generated/chat/knowledge.json and ../portfolio/.generated/chat/knowledge.json; the first existing file wins, without trying the second if invalid. Local cache uses path/mtime. It accepts a validated plain artifact or v1 envelope with source, generatedAt and SHA-256 contentHash; validates shape, unique slugs, optional fields and HTTP(S) URLs without credentials. Envelope integrity does not establish authorship.

**Preserved, tested limits:** the five-second R2 timeout surrounds send, does not cancel the SDK and does not cover transformToString; stale has no maximum age. SDK retries retain defaults, without application retries. Caches are per environment and lost on restart. They solve neither total deadlines nor distributed quotas. The package currently carries no real editorial artifact: cold editorial queries return 503 without valid R2/fallback. Smoke writes synthetic fallback only inside its temporary directory; this is not distributed bot content.

## Dependencies and explicit differences

Only required direct pinned dependencies are added: **@aws-sdk/client-s3 3.1156.0**, npm latest checked at implementation, engines >=20, Apache-2.0; and **reflect-metadata 0.2.2**, latest, Apache-2.0. S3 avoids handwritten R2 signing/transports. reflect-metadata is required by class-transformer @Type for history, without Nest DI/metadata. Reproducible lock; package licenses remain in their distributions. [S3 metadata](https://registry.npmjs.org/@aws-sdk/client-s3/3.1156.0), [reflect-metadata metadata](https://registry.npmjs.org/reflect-metadata/0.2.2).

- Professional location corrected to Posadas, Misiones, Argentina; the original source and historical hashes retain Villa Gesell. This is an explicit content adaptation, without a general editorial refresh.
- Two root arrays use body must be an object; unknown prototype is rejected at root/history rather than silently removed by ValidationPipe. Four divergent references are explicit, with original expectations preserved.
- rate-limiter-flexible uses a fixed window from first attempt and a 60-second block from the exceeded attempt, without extending it on retries; the Throttler algorithm/timer bug is not recovered.
- Configuration is read on first valid POST: incomplete R2 yields controlled 500 while health/starters remain available. The source validated whole-application startup.
- Free-form repository/provider logs that could include endpoint/path/network details are omitted. Bounded JSON metrics retain event, outcome, duration and valid token counts through stdout without Nest Logger. No message, history, sessionId or exception text. Correlation and cross-cutting observability remain pending.
- Current S3 replaces source 3.1004.0; local compatibility checks configuration/command/mocked body rather than real transport or R2.

Outside the declared differences, no other deliberate content/validation/error change. Tests cover 400/413/429/503 and controlled 500; existing contracts retain 204/200 and 400/502/503 mappings.

## Local evidence

**223 new cases**: 59 DTO references; 18 domain/effect references generated by executing original blobs; five content hashes; 74 scenarios adapted from original suites (FAQ, conversation, context, publication); 20 provider/metrics; 33 repository/configuration/SDK; 14 HTTP/quotas/composition. Two 404 expectations are replaced and an existing contact test now expects 400 from chat without message.

**479 passing**: 456 application, 12 tooling and 11 infrastructure. Formatting, strict types, ESM build, package smoke outside checkout without devDependencies, documentation, CI scope, actionlint and synthesis without lookups are checked locally with Node 24.22.1 LTS. npm audit reports no vulnerabilities in the current lock. Public reproduction runs npm ci --ignore-scripts and check without .git/private files/previous dist/node_modules, with fake environment/credentials. This does not establish managed integration, provider availability or AWS costs.

test/chat-reference.json SHA-256: 5f3ec1524ebd9d9d8a740b19d6fc5333e5afd9bc39d563fdbe331903c16be401.
test/chat-domain-reference.json SHA-256: 2aeddfabc6061692c3c4c649624a17b9d9e0a996071d3f2d5c9b0a57dfea2492.
Both are excluded from Prettier as pinned evidence. Contact/subscription fixture hashes remain unchanged. Generation used Nest common 11.1.13, class-validator 0.14.3, class-transformer 0.5.1, reflect-metadata 0.2.2 and rxjs 7.8.2; tarball integrity was not reverified. Normal tests need neither source repository, Nest, Jest nor private tools.

## Provenance and ownership

Source: [portfolio-api@a0ef80fa9f82d1cea5a31425a63ab0a344338c56](https://github.com/matigaleanodev/portfolio-api/tree/a0ef80fa9f82d1cea5a31425a63ab0a344338c56). Only pinned blobs were consulted. Domain/content moves with the declared location correction and without a general editorial refresh; DTO adds direct/nested validation; services replace DI with explicit constructors; configuration accepts maps; providers accept fetch/R2 reader; routing/quotas/errors adapt to events. Controller/module/specs guide contracts/composition without joining runtime. Pinned main.ts, app.module.ts and manifests retain provenance in [application](application.md) and [contact](contact.md).

| Consulted blob                             | SHA-256                                                          |
| ------------------------------------------ | ---------------------------------------------------------------- |
| src/chat/chat-content.config.ts            | a49b0629cad4f2f3d0792b796da8f1e9987aa76da7a16bac6f7e5febd6bc6202 |
| src/chat/chat-knowledge.repository.spec.ts | b1f0c6915f6111afeb0f964031bf8ddcaf0c7ae544f6ca41dfde25793800f0ac |
| src/chat/chat-knowledge.repository.ts      | cc85890ff78ba83a51f3db1fd6f7f162d58724f868c50865ce8e6c4c6c9d1930 |
| src/chat/chat-metrics.spec.ts              | 1681c37f5df94561ed3ba1fe8e2307bc1bf8849568d5b7668c1c27b860c9aef1 |
| src/chat/chat-metrics.ts                   | 3bc37f3773d68b87de71e07bd02390c7f2b04e31b8491025cea4f4d20b333513 |
| src/chat/chat.controller.ts                | ec61358bb2acee22ff63b623e5b6354a636d37b722e39aad1d00ce8fd093121d |
| src/chat/chat.dto.ts                       | a81df32e362a49951d732f35dfcae8d09f5e00e7436d2d15af32805a725ee13a |
| src/chat/chat.module.ts                    | 7592b98926a1e99cb4acffffc5d717f31b78c11f2399e1fb52a380585ac9fa8b |
| src/chat/chat.service.spec.ts              | 85aa23038a31444535165dff17b03dbdef6d70b7aa0ca03d25153c6bf95a9409 |
| src/chat/chat.service.ts                   | d4690a40574281b664fe2ccd60dc070ada8a9ea7c4a0771869d504071869d5e4 |
| src/chat/chat.types.ts                     | 0d65cb1eb935311fc2c25c9e03ca9e5c799d5d75e3d857d3b2d35c716f0d427f |
| src/chat/content/chat-faq.data.ts          | 5d7ee8c37438ebf0ecc468e0ca4cbc67577c2f578b0b19130440b17de1f0be75 |
| src/chat/faq.service.spec.ts               | 810cb3f903db23ecea03191086504b2ad0e25b3f5e986afc69cd9f427c0ed4e2 |
| src/chat/faq.service.ts                    | 2236d2381e66e6d5407adba4f189c7f93df7dd89b7fe82f5ac21af4204d72247 |
| src/chat/knowledge.service.spec.ts         | 0071c9e2ae4f07e8251bf88ba5487080ea995e39325cf9a3cb9a494eba613488 |
| src/chat/knowledge.service.ts              | 7da4497f947eae75945fb19adf7b24274aa70acdd6a940e99d7f99087cf578e2 |
| src/chat/knowledge/cloud.knowledge.ts      | d8cabb15a53fdbaf4469f0c4dca86032db8d54eb66d73170d006157fb117fb29 |
| src/chat/knowledge/professional-profile.ts | 4545a60efdc17e3b63dab046923a8831d6ffa790a371321df848dddc687dbcbe |
| src/chat/knowledge/profile.knowledge.ts    | 4cdf04f94f770d3e92533890a24febfd67ae5e64126c60efcff43da30447de7f |
| src/chat/openai.service.spec.ts            | 8491bb44ca515fc4e6885fc653509d911336f73ff4ea6dccd3d038eb90c4b6a8 |
| src/chat/openai.service.ts                 | db7cdb23866e144668239c2740461369bb2d65c35f606d5cf76c347c08a8662c |
| src/chat/publication.spec.ts               | 4a3e4efcd62aaa23f1c69420e12fa9fd3860dedbab6e6928f1cf845d8e8d908c |
| src/chat/publication.ts                    | f5bb155418f572b279abc5f0f597b92651e059d929c7cac719da73f37e36e4cd |
| src/config/runtime.config.spec.ts          | 58563eaa8cefe638730012b3b2da9199d7bac226cfbf0a912470178c3d693845 |
| src/config/runtime.config.ts               | 366b7c532275fda3aaee639db60884999e3a0ee8f268b4a983124f6f6f672890 |
| test/chat-conversation.e2e-spec.ts         | 89de1cca53222c963f5390e8649fe2ec420ae3d732678cb10c31e5a5e720af60 |
| test/chat-runtime.e2e-spec.ts              | 420e8c8b8e215ef5d8d77611acfef96045c427cc319fe67c79c6344885c16920 |
| test/chat.e2e-spec.ts                      | c1ffcaa5914d0ccb545e7c495d0145793a35cbcc62f1268147879a663b6b442e |

Both repositories have the same maintainer. Source remains UNLICENSED: public visibility grants no third-party license. The owned implementation retains [MIT](../LICENSE), without NOTICE/manual license inventory; dependencies retain their package notices.

## Next stage

All six contracts are implemented and locally tested with finite differential scope and declared differences. Stage 4 follows: shared/atomic quotas, real IP/proxies, AI budget, deadline/cancellation, versioned fallback/stale policy, retention and secrets/startup. The stack is not deployed and public exposure remains closed. Editorial refresh stays immediately before production.
