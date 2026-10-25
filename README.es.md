# Portfolio API Cloud

[English](README.md)

![Node.js 24](https://img.shields.io/badge/Node.js-24-5FA04E?logo=nodedotjs&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white) ![AWS Lambda](https://img.shields.io/badge/AWS-Lambda-FF9900) ![AWS CDK](https://img.shields.io/badge/IaC-AWS_CDK-FF9900) ![Vitest](https://img.shields.io/badge/tests-Vitest-6E9F18?logo=vitest&logoColor=white) ![MIT](https://img.shields.io/badge/license-MIT-blue)

API serverless de mi portfolio, escrita en TypeScript con handlers para AWS Lambda. Resuelve contacto, chat y la fachada de suscripciones conservando los contratos de la implementación NestJS.

## Stack y arquitectura

Node.js 24, TypeScript estricto y ESM; HTTP API Gateway v2, Lambda ARM64, DynamoDB para cuotas compartidas y Secrets Manager para configuración. Infraestructura con AWS CDK y entrega por GitHub Actions mediante OIDC, artifacts verificados y changesets revisados. Vitest cubre contratos y controles del runtime.

Contacto usa Resend. El chat combina FAQ locales, conocimiento editorial de Cloudflare R2 y OpenAI Responses con GPT-6 Luna como único modelo. Las suscripciones se delegan a `portfolio-cloud`, que conserva datos, notificaciones y publicación editorial. El frontend Angular, sus contenidos y Firebase Hosting pertenecen a `portfolio`.

## Endpoints

| Método | Ruta                 | Respuesta                  |
| ------ | -------------------- | -------------------------- |
| GET    | `/api/health`        | 200 · `{ "status": "ok" }` |
| POST   | `/api/contact`       | 204                        |
| GET    | `/api/chat/starters` | 200                        |
| POST   | `/api/chat`          | 201                        |
| POST   | `/api/subscriptions` | 200                        |
| DELETE | `/api/subscriptions` | 200                        |

Bodies JSON, validación de DTO, CORS por origen y errores controlados. Contacto aplica honeypot y cuota 5/h/IP; suscripción y baja, 10/h/IP cada una; chat y starters, 20/min/IP cada uno. Las FAQ no invocan IA. La IA admite hasta cinco respuestas por sesión y origen/día, con reserva monetaria global previa y comportamiento controlado ante límites o fallos.

## Desarrollo local

```bash
npm ci --ignore-scripts
npm run check
```

Node 24.22.1 según `.nvmrc`, Python 3 para validaciones documentales y de entrega. `check` valida formato, tipos, pruebas, paquete, síntesis CDK sin lookups y enlaces documentales. Las pruebas bloquean la red y usan proveedores simulados.

El paquete productivo exporta `dist/handler.handler`; incluye dependencias de producción y el fallback editorial versionado. La configuración se carga de Secrets Manager, sin `.env` en Lambda.

## Documentación

- [Architecture](Docs/architecture.es.md)
- [HTTP contracts](Docs/audit.es.md)
- [Contact](Docs/contact.es.md) · [Chat](Docs/chat.es.md) · [Subscriptions](Docs/subscriptions.es.md)
- [Runtime controls](Docs/runtime-hardening.es.md)
- [Delivery and recovery](Docs/deployment-design.es.md)
- [Production configuration](Docs/production.es.md)
- [Technical decisions](Docs/decisions.es.md)

## Licencia

[MIT](LICENSE) · Matias Galeano.
