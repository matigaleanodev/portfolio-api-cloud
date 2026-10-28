# Portfolio API Cloud

[Español](README.es.md)

![Node.js 24](https://img.shields.io/badge/Node.js-24-5FA04E?logo=nodedotjs&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white) ![AWS Lambda](https://img.shields.io/badge/AWS-Lambda-FF9900) ![AWS CDK](https://img.shields.io/badge/IaC-AWS_CDK-FF9900) ![Vitest](https://img.shields.io/badge/tests-Vitest-6E9F18?logo=vitest&logoColor=white) ![MIT](https://img.shields.io/badge/license-MIT-blue)

The serverless API for my portfolio, written in TypeScript with AWS Lambda handlers. It handles contact, chat and a subscription facade while preserving the NestJS implementation's contracts.

## Stack

Node.js 24, strict TypeScript and ESM; API Gateway HTTP API, ARM64 Lambda, DynamoDB for shared controls and Secrets Manager for configuration. CDK defines infrastructure; GitHub Actions delivers verified artifacts through OIDC and reviewed changesets.

Contact uses Resend. Chat combines local FAQs, editorial knowledge from Cloudflare R2 and OpenAI Responses with GPT-6 Luna. Subscriptions delegate data and operations to `portfolio-cloud`. The Angular frontend and Firebase Hosting belong to `portfolio`.

## Endpoints

| Method | Route                | Success |
| ------ | -------------------- | ------- |
| GET    | `/api/health`        | 200     |
| POST   | `/api/contact`       | 204     |
| GET    | `/api/chat/starters` | 200     |
| POST   | `/api/chat`          | 201     |
| POST   | `/api/subscriptions` | 200     |
| DELETE | `/api/subscriptions` | 200     |

DTO validation, origin-based CORS, shared quotas and controlled errors. FAQs do not invoke AI; paid generation requires a prior monetary reservation.

## Local development

```bash
npm ci --ignore-scripts
npm run check
```

Use Node from `.nvmrc` and Python 3. Tests block network access and use simulated providers; CDK synthesis does not query AWS.

## Documentation

- [Architecture](Docs/architecture.md)
- [HTTP contracts](Docs/api.md)
- [Development and testing](Docs/development.md)
- [Operations and recovery](Docs/operations.md)
- [Technical decisions](Docs/decisions.md)

## License

[MIT](LICENSE) · Matias Galeano.
