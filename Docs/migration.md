# Reversible migration and acceptance gates

[Español](migration.es.md) · 2026-10-24. Proposed stages; only documentation/workflow preparation and GitHub protection are currently authorized.

| Stage | Increment | Acceptance and boundary |
| --- | --- | --- |
| 0. Current preparation | empty public repo, audit, bilingual docs and local workflows | links/YAML validated, original repos preserved; no commit/push/AWS mutation |
| 1. Local reuse | copy necessary runtime/tests/build config from an approved portfolio-api SHA | record source commit, paths and hashes; no .git/.env/node_modules/dist/source generated artifacts; review UNLICENSED ownership |
| 2. Offline compatibility | compare handler composition and Nest bootstrap/Express 5 adapter with HTTP API v2 events and mocks | all six contracts, chat 201/contact 204/DELETE body, 400/413/429/500/502/503; no provider traffic |
| 3. Hardening | shared quotas, trustworthy IP, real deadlines, packaged fallback, bounded logs | concurrency/spoof/TTL/cancellation/cold R2 failure/corruption tests; compare native Web Functions if selection changes |
| 4. Reviewable infrastructure | offline CDK test synth and IAM/network/retention/route assertions; design roles/bootstrap | no production ARN/import/resource/admin wildcard; separate publishing/execution/runtime and boundaries; bootstrap separately approved |
| 5. Managed test | independent endpoint, test config/resources, approved plan-workflow activation | exact repo/ref/environment OIDC, verified account/region and reviewed change set; test execution needs later approval and is absent from current workflow |
| 6. Isolated validation | preview frontend uses test URL; initially mock Resend/OpenAI/upstream | browser/contracts/CORS/headers/multibyte/errors/metrics; real emails/paid calls require explicit recipient/data/budget |
| 7. Cutover preparation | choose domain/Cloudflare boundary, URL/fallback; capture prior nonsecret state | specific runbook, TTL/cache/certificate, pinned image/artifact, rehearsed rollback; explicit production approval |
| 8. Approved cutover | one write path per request, no shadow/replayed POSTs | observe and revert against agreed thresholds; EC2 stays available |
| 9. Stabilization | proposed 2–4 weeks plus relevant real cases | no regressions, measured cost, viable rollback; user agrees thresholds/window. EC2 retirement waits for Foodly Notes and Modo Playa |

## First implementation increment proposed, NOT executed

Select a user-approved source SHA and start `feat/lambda-compatibility` here. Copy runtime/tests with a provenance manifest (repository, commit, path, hash), preserving attribution and traceable original history. Importing all Git history is unnecessary. Do not treat an old local branch as confirmed production.

First compare the Nest and lightweight-handler candidates under [the protocol](runtime-evaluation.md), reusing domain/contracts. Test bootstrap/composition and v2 events for health/starters/contact/chat/subscriptions, mocking fetch, Resend and R2. Use real pipes/body-limit/CORS setup rather than a different test app. Add adapter-specific 201/204/DELETE/base64/rawPath/multibyte checks. No infrastructure yet. Local startup timing is not measured AWS cold latency. Done means reproducible local package, preserved contracts, no emails/models/remote writes and a concrete incompatibility list; it does not establish AWS IAM/cold performance.

## State, effects and coexistence

There is no application schema to migrate. Subscriber/release state stays in portfolio-cloud/R2. Do not duplicate production buckets or ownership. Both APIs using the same upstream see and can change the same state; each request must reach only one API, with no mirrored business writes.

Initial testing uses versioned editorial fixtures and upstream/provider doubles. Later real integration needs an existing authorized isolated cloud stage, private test bucket/prefix and controlled email; such a stage was not verified. If creating it requires portfolio-cloud changes, scope that separately with its owner. Until then, do not test against production subscriptions.

Do not duplicate the frontend daily cron, process-release, notify-post or knowledge publication. Do not automatically retry contact after an ambiguous timeout. Upstream Head+Put does not guarantee race-free creation; any fix belongs in cloud separately. Future object/schema evolution must be additive and readable by the old API throughout coexistence, without incompatible deletes/renames.

## Validation matrix

- Functional: every route/body/status/header/validation/error; FAQ/AI/fallback, profile without R2, Argentina dates, project/history isolation.
- Security: event IP/direct bypass/spoofing, CORS, concurrent route quotas, 16 KiB bodies, exposed upstream, least privilege and no secret artifacts/logs. CORS is not authentication.
- Performance: existing aggregate baseline plus cold/warm p50/p95/p99, INIT/billed duration/memory, 429/5xx/timeouts, knowledge/cache hits/tokens. Bounded mock-provider traffic first; real paid calls need a budget.
- Proposed thresholds for agreement: zero lost/duplicated effects or contract regressions; fast-route warm p95 ≤1 s, cold ≤2.5 s; chat p95 ≤8 s and 25 s deadline. Compare with existing baseline too; insufficient samples cannot establish success.
- Cost: component/stage consumption, 30-day projection, AI/fallback ratios and verified alerts. Test cost is not production cost.
- Operations: successful HTTP fallback is not successful AI generation; do not rely only on 5xx. Make client/SDK/Lambda retry behavior explicit.

## Rollback while EC2 is available

Before cutover verify the original container, retained image SHA/digest, valid private configuration outside Git, SSM and original routes/tunnel. EC2 must be ready, not merely running. Document reverting the same hostname to Tunnel/Traefik or restoring the frontend's previous URL according to the selected mechanism. Include certificate/cache behavior in the rehearsal.

On agreed error/latency/cost threshold breach or duplicated effects, stop rollout and return traffic under the cutover's agreed operational authorization. Never replay in-flight contact/subscription calls: timed-out operations may already have applied. Check read health/observability; write smoke tests need authorization and controlled data. Returning to EC2 does not undo shared cloud subscription changes.

## Recovery after stopping EC2

This is not immediate rollback. It may require approved removal of stop protection, instance startup, volume/Docker/network/SSM/Tunnel/Traefik checks, private config recovery, registry pulls and health checks. Termination or volume loss needs reconstruction/restore and longer recovery. No RTO/RPO promise without rehearsal.

Preserve/test relevant EBS snapshot/AMI, Compose/Traefik/deploy scripts and cloudflared versions, pinned original image with protected retention, GHCR availability, secure private config/credentials backup, roles/access, routing/domain/certificates and knowledge artifacts. Never copy secrets here. Current three-tag cleanup can erase the required image; resolve retention before shutdown. R2 data recovery follows the cloud owner's backup plan, not an EC2 snapshot.

## User decisions

Approve CDK/runtime candidate, cold-latency versus cost priority, daily AI cap/budget/thresholds, maximum knowledge staleness, controlled-effect integration testing, IAM/bootstrap, file publication, each deployment and production cutover. Later apps/EC2 retirement require separate planning. None blocks completing current preparation.
