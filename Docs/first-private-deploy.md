# Verified first private deployment

[Español](first-private-deploy.es.md) · 2026-10-25.

Stack portfolio-api-cloud-test reached CREATE_COMPLETE on 2026-10-25 in us-east-1. One Lambda uses real Secrets Manager and DynamoDB clients; contact, subscriptions and AI providers are simulated. Business access requires SigV4/IAM.

Sequential HTTP checks verified all six contracts, anonymous and Observer rejection (403), and the shared contact quota: five 204 responses with remaining count 4→0; the sixth returns 429 with Retry-After. Lambda code matches the SHA256 of the reviewed S3 ZIP. Integrated CI passed all 617 tests.

| Method and route          | Result                   |
| ------------------------- | ------------------------ |
| GET /api/health           | 200                      |
| POST /api/contact         | 204                      |
| POST /api/subscriptions   | 200                      |
| DELETE /api/subscriptions | 200                      |
| GET /api/chat/starters    | 200                      |
| POST /api/chat            | 201, simulated source=ai |

## Provenance and execution

[CI](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40238188400) · [plan](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40239897203) · [execute](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40240008983) · [foundation UPDATE](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40239753311)

- Artifact revision: `2790d385da9aaeb8477d1d8e448e53d0a5fe9c1b`.
- Workflow revision: `5e56b48741ce571808b9c916cb56c27fd536caca`.
- Artifact: `12615778214`; digest `sha256:6c6e7e5a08e9c73cd1c0e8d9d2db6bacb7ae2c91516886742208324341f747b8`.
- Receipt: `sha256:c6bfd903bae0e36635750d3e961aa924cd11e3cffd5b0f3e31785d53a3350ea7`.
- Lambda ZIP SHA256: `072ad2e1a201cd9716ff426c3469cc071d5eb851955de1acef410f596fecce89`.

The full failure, load and recovery matrix was not run; real external providers remain unverified. There were zero paid AI calls and no real deliveries. The original API, EC2, DNS/Cloudflare and production traffic retain their configuration. v0.1.0 retains its original revision. All four deployment flags are false.

The simulated variant has no concurrency reservation: the verified regional quota is 10 and Lambda requires leaving 100 executions unreserved to configure one. Gateway rate is 2/s with burst 5; normal synthesis retains reservation 5 and needs a compatible quota. Real providers, editorial content, the operational matrix and reducing regional bootstrap permissions to the created API ID remain before production.
