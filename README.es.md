# Portfolio API Cloud

[English](README.md)

![Node.js 24](https://img.shields.io/badge/Node.js-24-5FA04E?logo=nodedotjs&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white) ![AWS Lambda](https://img.shields.io/badge/AWS-Lambda-FF9900) ![AWS CDK](https://img.shields.io/badge/IaC-AWS_CDK-FF9900) ![Vitest](https://img.shields.io/badge/tests-Vitest-6E9F18?logo=vitest&logoColor=white) ![MIT](https://img.shields.io/badge/license-MIT-blue)

API serverless de mi portfolio, escrita en TypeScript con handlers para AWS Lambda. Resuelve contacto, chat y la fachada de suscripciones conservando los contratos de la implementación NestJS.

## Stack

Node.js 24, TypeScript estricto y ESM; API Gateway HTTP API, Lambda ARM64, DynamoDB para controles compartidos y Secrets Manager para configuración. Infraestructura con CDK y entrega por GitHub Actions mediante OIDC, artifacts verificados y changesets revisados.

Contacto usa Resend. El chat combina FAQ locales, conocimiento editorial de Cloudflare R2 y OpenAI Responses con GPT-6 Luna. Suscripciones delega datos y operaciones a `portfolio-cloud`. El frontend Angular y Firebase Hosting pertenecen a `portfolio`.

## Endpoints

| Método | Ruta                 | Éxito |
| ------ | -------------------- | ----- |
| GET    | `/api/health`        | 200   |
| POST   | `/api/contact`       | 204   |
| GET    | `/api/chat/starters` | 200   |
| POST   | `/api/chat`          | 201   |
| POST   | `/api/subscriptions` | 200   |
| DELETE | `/api/subscriptions` | 200   |

Validación de DTO, CORS por origen, cuotas compartidas y errores controlados. Las FAQ no invocan IA; la generación paga exige reserva monetaria previa.

## Desarrollo local

```bash
npm ci --ignore-scripts
npm run check
```

Node según `.nvmrc` y Python 3. Las pruebas bloquean la red y usan proveedores simulados; la síntesis CDK no consulta AWS.

## Documentación

- [Arquitectura](Docs/architecture.es.md)
- [Contratos HTTP](Docs/api.es.md)
- [Desarrollo y pruebas](Docs/development.es.md)
- [Operación y recuperación](Docs/operations.es.md)
- [Decisiones técnicas](Docs/decisions.es.md)

## Licencia

[MIT](LICENSE) · Matias Galeano.
