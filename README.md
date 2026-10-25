# Portfolio API Cloud

[Español](README.es.md)

![Node.js 24](https://img.shields.io/badge/Node.js-24-5FA04E?logo=nodedotjs&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white) ![AWS Lambda](https://img.shields.io/badge/AWS-Lambda-FF9900) ![AWS CDK](https://img.shields.io/badge/IaC-AWS_CDK-FF9900) ![Vitest](https://img.shields.io/badge/tests-Vitest-6E9F18?logo=vitest&logoColor=white) ![MIT](https://img.shields.io/badge/license-MIT-blue)

Serverless API for my portfolio, written in TypeScript with AWS Lambda handlers. It handles contact, chat and the subscriptions facade while preserving the NestJS implementation contracts.

## Stack and architecture

Node.js 24, strict TypeScript and ESM; HTTP API Gateway v2, ARM64 Lambda, DynamoDB for shared quotas and Secrets Manager for configuration. AWS CDK infrastructure and GitHub Actions delivery use OIDC, verified artifacts and reviewed change sets. Vitest covers contracts and runtime controls.

Contact uses Resend. Chat combines local FAQ, editorial knowledge from Cloudflare R2 and OpenAI Responses with GPT-6 Luna as its only model. Subscriptions delegate to `portfolio-cloud`, which owns data, notifications and editorial publication. The Angular frontend, static content and Firebase Hosting belong to `portfolio`.

## Endpoints

| Method | Path                 | Response                   |
| ------ | -------------------- | -------------------------- |
| GET    | `/api/health`        | 200 · `{ "status": "ok" }` |
| POST   | `/api/contact`       | 204                        |
| GET    | `/api/chat/starters` | 200                        |
| POST   | `/api/chat`          | 201                        |
| POST   | `/api/subscriptions` | 200                        |
| DELETE | `/api/subscriptions` | 200                        |

JSON bodies, DTO validation, origin-based CORS and controlled errors. Contact applies a honeypot and 5/h/IP quota; subscribe and unsubscribe each allow 10/h/IP; chat and starters each allow 20/min/IP. FAQ never invokes AI. AI permits up to five replies per session and origin/day, with a global monetary reservation before generation and controlled behavior on limits or failures.

## Local development

```bash
npm ci --ignore-scripts
npm run check
```

Node 24.22.1 as pinned by `.nvmrc`, and Python 3 for documentation and delivery validation. `check` verifies formatting, types, tests, package, CDK synthesis without lookups and documentation links. Tests block network access and use simulated providers.

The production package exports `dist/handler.handler`; it includes production dependencies and the versioned editorial fallback. Configuration loads from Secrets Manager, with no `.env` in Lambda.

## Documentation

- [Architecture](Docs/architecture.md)
- [HTTP contracts](Docs/audit.md)
- [Contact](Docs/contact.md) · [Chat](Docs/chat.md) · [Subscriptions](Docs/subscriptions.md)
- [Runtime controls](Docs/runtime-hardening.md)
- [Delivery and recovery](Docs/deployment-design.md)
- [Production configuration](Docs/production.md)
- [Technical decisions](Docs/decisions.md)

## License

[MIT](LICENSE) · Matias Galeano.
