# Arquitectura

[English](architecture.md)

Cloudflare recibe el tráfico de `api.matiasgaleano.dev`; API Gateway HTTP API entrega las seis operaciones a una Lambda Node.js ARM64 fuera de VPC. CDK TypeScript define infraestructura en `infra/`, separada del runtime de `src/`.

## Responsabilidades

| Componente       | Responsabilidad                                                         |
| ---------------- | ----------------------------------------------------------------------- |
| `handler.ts`     | Entrada administrada, identidad, configuración, deadline y composición. |
| `application.ts` | Routing, parsing, CORS, DTO, cuotas y respuestas HTTP.                  |
| Contacto         | Validación, honeypot y envío mediante el SDK Resend.                    |
| Suscripciones    | Fachada HTTP hacia `portfolio-cloud`.                                   |
| `chat/`          | FAQ, contexto, conocimiento editorial y proveedor IA.                   |
| DynamoDB         | Cuotas efímeras y reservas de IA compartidas.                           |
| Secrets Manager  | Configuración validada con caché y renovación acotadas.                 |

`portfolio` conserva frontend y contenido estático. `portfolio-cloud` conserva suscriptores, notificaciones y publicación editorial. `portfolio-api` mantiene la implementación NestJS independiente. Conservar contratos permite cambiar URL o routing sin reescribir el frontend.

## Entrada y controles

El handler valida API, stage y dominio. En el dominio personalizado exige origen Cloudflare, secreto de origen e IP válida antes de confiar en `CF-Connecting-IP`; ignora `X-Forwarded-For`. CORS se resuelve en la aplicación y no autentica.

DynamoDB usa operaciones condicionales para cuotas y transacciones para admisión de IA. La expiración es lógica, independiente de la limpieza eventual del TTL. Las claves de origen y sesión se derivan con HMAC; no se persisten conversaciones. El limiter en memoria se limita a composición local.

Cada request dispone de hasta 25 segundos, reducidos según el tiempo restante de Lambda. Un `AbortSignal` alcanza almacenamiento y proveedores. No se reintentan envíos, suscripciones ni reservas ambiguas; cancelar transporte no revierte efectos aceptados.

## Conocimiento y continuidad

Las FAQ responden directamente. R2 aporta conocimiento editorial con caché y fallback versionado dentro del paquete. El envelope valida esquema, checksum y edad máxima; el build conserva su fecha de generación.

La generación usa únicamente GPT-6 Luna mediante Responses, con `store=false`, sin herramientas ni reintentos. Exige tarifas vigentes, cupos de sesión/origen y reserva monetaria global previa. Los límites permiten continuar con FAQ o contacto; una consulta editorial sin conocimiento válido devuelve error controlado.

## Infraestructura y costo

Una función agrupada evita multiplicar despliegues sin necesidad demostrada de aislamiento. Los proveedores públicos no requieren VPC ni NAT. DynamoDB usa capacidad bajo demanda; logs y secretos tienen costos propios. El presupuesto IA limita la admisión del runtime, no la factura completa.

Los nombres físicos `portfolio-api-cloud-test` identifican una única instalación y se conservan para evitar recrear recursos. Esta migración no elimina el costo de la EC2 compartida mientras otras aplicaciones dependan de ella.

[Contratos](api.es.md) · [Operación](operations.es.md) · [Decisiones](decisions.es.md)
