# Portfolio API Cloud

[Español](README.es.md)

![Node.js 24](https://img.shields.io/badge/Node.js-24-5FA04E?logo=nodedotjs&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white) ![AWS Lambda](https://img.shields.io/badge/AWS-Lambda-FF9900) ![AWS CDK](https://img.shields.io/badge/IaC-AWS_CDK-FF9900) ![Vitest](https://img.shields.io/badge/tests-Vitest-6E9F18?logo=vitest&logoColor=white) ![MIT](https://img.shields.io/badge/license-MIT-blue)

The serverless API for my portfolio, written in TypeScript for AWS Lambda. It handles contact, chat and subscriptions over HTTP, and blog editorial publication (OG images, subscriber notifications and chat knowledge) through direct invocation, while preserving the NestJS implementation's contracts.

## Stack

Node.js 24, strict TypeScript and ESM in npm workspaces (`contracts`, `runtime`, `infrastructure`). API Gateway HTTP API, six Lambda functions with Middy (`@middy/core` only), DynamoDB for shared controls and SSM Parameter Store (`SecureString`) for sensitive configuration. CDK defines infrastructure; GitHub Actions delivers verified artifacts through OIDC and reviewed changesets.

Contact and blog notifications use Resend. Chat combines local FAQs, editorial knowledge in Cloudflare R2 and OpenAI Responses with GPT-6 Luna. Subscribers live in a private R2 bucket. The Angular frontend, content and the workflow that triggers publication belong to `portfolio`.

## Endpoints

| Method | Route                | Success |
| ------ | -------------------- | ------- |
| GET    | `/api/health`        | 200     |
| POST   | `/api/contact`       | 204     |
| GET    | `/api/chat/starters` | 200     |
| POST   | `/api/chat`          | 201     |
| POST   | `/api/subscriptions` | 200     |
| DELETE | `/api/subscriptions` | 200     |

DTO validation, origin-based CORS, shared quotas and controlled errors. FAQs do not invoke AI; paid generation requires a prior monetary reservation. Editorial functions have no HTTP routes: the `portfolio` publication workflow invokes them.

## Local development

```bash
npm ci --ignore-scripts
npm run check
```

Use Node from `.nvmrc` and Python 3. Tests block network access and use simulated providers; CDK synthesis does not query AWS.

## Documentation

- [Architecture](Docs/architecture.md)
- [HTTP and editorial contracts](Docs/api.md)
- [Development and testing](Docs/development.md)
- [Operations, configuration and recovery](Docs/operations.md)
- [Technical decisions](Docs/decisions.md)

## License

[MIT](LICENSE) · Matias Galeano.
