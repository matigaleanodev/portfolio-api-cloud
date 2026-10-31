# Arquitectura

[English](architecture.md)

Cloudflare recibe el tráfico de `api.matiasgaleano.dev`; API Gateway HTTP API reparte las seis operaciones entre dos funciones HTTP. Cuatro funciones editoriales sin rutas completan la publicación del blog. Todas usan Node.js 24 fuera de una VPC.

## Paquetes

npm workspaces con un único lock en la raíz y la misma versión en todos los paquetes:

| Paquete                   | Contenido                                                                                                                         | Puede importar                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `packages/contracts`      | Rutas, cuotas, catálogo de funciones, nombres de configuración y parámetros, eventos editoriales y claves R2. Sin dependencias.   | Nada (ni módulos de Node)                    |
| `packages/runtime`        | HTTP, dominio, proveedores, handlers, variante de validación, fallback editorial, fuentes OG y utilidades de desarrollo (`dev/`). | `contracts` y sus dependencias de producción |
| `packages/infrastructure` | App y stack CDK, plantillas de foundation y delivery-access.                                                                      | `contracts`, `aws-cdk-lib`, `constructs`     |

`npm run boundaries` rechaza imports relativos entre paquetes, dependencias fuera de la lista de cada uno, imports de `contracts` sin export explícito y versiones desalineadas. Infraestructura y runtime solo comparten contratos.

## Funciones

| Función                  | Artifact      | Disparador                                          | Responsabilidad                                                                                |
| ------------------------ | ------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `api`                    | `api`         | Ruta `$default` y `OPTIONS /{proxy+}`               | Health, contacto, alta/baja de suscripciones, preflight, 404 y variantes no canónicas de chat. |
| `chat`                   | `chat`        | `POST /api/chat`, `GET` y `HEAD /api/chat/starters` | Starters y respuestas de chat; cualquier otra ruta responde 404 sin leer configuración.        |
| `process-release`        | `editorial`   | Workflow de publicación de `portfolio`              | Detecta posts nuevos del manifiesto e invoca generate-og y notify-post con estado idempotente. |
| `generate-og`            | `og` (x86_64) | `process-release`                                   | Renderiza la imagen OG con resvg y la sube a R2.                                               |
| `notify-post`            | `editorial`   | `process-release`                                   | Envía el aviso del post a cada suscriptor por Resend.                                          |
| `publish-chat-knowledge` | `editorial`   | Workflow de publicación de `portfolio`              | Publica en R2 el envelope versionado del conocimiento del chat.                                |

El catálogo vive en [functions.ts](../packages/contracts/src/functions.ts): nombre físico, handler, artifact, memoria, timeout, arquitectura, claves requeridas/opcionales y parámetro SSM. Todas son ARM64 salvo `generate-og`, que conserva x86_64 por el binario nativo de resvg. Cada función tiene rol propio con la boundary de runtime y log group explícito retenido.

API Gateway selecciona por ruta y método exactos: las rutas canónicas de chat van a `chat` (HEAD necesita su propia ruta) y todo lo demás cae en `$default`. Por eso `api` también contiene el router de chat y atiende variantes como `/api/Chat/` con el parámetro de chat cargado de forma diferida. Las caches en memoria (conocimiento y respuestas) son por entorno de ejecución: las variantes atendidas por `api` no las comparten con `chat`.

## Cadena HTTP

Fuera de Middy, una capa de request scope valida ingress (versión 2.0, IP, API ID, dominio y stage → 403), resuelve el visitante de Cloudflare, abre el contexto con deadline y `AbortSignal`, agrega `x-request-id` y registra `http_request`. Dentro, `middy({ timeoutEarlyInMillis: 0 })` aplica:

1. `serializer` (registrado primero para que su `after` y `onError` corran al final).
2. `runtimeConfig`: lee el parámetro SSM, verifica el secreto de origen en el dominio custom (también OPTIONS y health) y compone servicios; corta con 403 o 503.
3. `body`: parser compatible con body-parser; sus errores cortan sin CORS, seguridad ni cuota.
4. `cors`: OPTIONS responde 204 y corta antes de los headers de seguridad.
5. `security`: headers de seguridad.
6. Handler: router por regex de contratos (cuota → DTO → servicio) y serialización (HEAD/204 sin body).

Un `before` que devuelve respuesta omite el handler y los `after`, así que esos cortes llegan serializados. `onError` responde 500 controlado sin relanzar, y una cuota inaccesible se traduce en 503.

## Ingress y controles

En el dominio custom el runtime exige origen Cloudflare, secreto `x-portfolio-origin` e IP válida antes de confiar en `CF-Connecting-IP`; ignora `X-Forwarded-For`. CORS se resuelve en la aplicación y no autentica.

DynamoDB usa operaciones condicionales para cuotas y transacciones para la admisión de IA; `api` y `chat` comparten tabla, prefijos y claves HMAC, de modo que una cuota no se duplica al separar funciones. La expiración lógica no depende del TTL. Las conversaciones no se persisten.

Cada request tiene hasta 25 segundos, reducidos según el tiempo restante de Lambda. Envíos, suscripciones y reservas ambiguas no se reintentan; cancelar el transporte no deshace efectos aceptados.

## Conocimiento y publicación editorial

Las FAQ responden directo. `chat` lee de R2 el envelope publicado por `publish-chat-knowledge`, con cache y un fallback versionado dentro del artifact; el envelope valida esquema, checksum y antigüedad máxima. Configuración R2 ausente usa el fallback; incompleta o inválida deja chat en 503 sin afectar health, contacto ni suscripciones.

La generación usa solo GPT-6 Luna por Responses, con `store=false`, sin herramientas ni reintentos, y exige tarifas vigentes, cupos por sesión/origen y reserva monetaria global previa.

`process-release` lee y escribe `state/posts.json` en el bucket de medios, invoca sincrónicamente `generate-og` y `notify-post` con reintentos acotados y guarda solo códigos de error saneados, porque ese bucket es público. Los suscriptores viven en `subscribers/<email>.json` de un bucket privado distinto, compartido por la fachada HTTP y `notify-post`.

## Infraestructura y costo

Las funciones se separan por permisos y dependencias: cada artifact contiene solo lo que su handler importa y cada rol lee solo su parámetro. Separar no agrega capacidad: sin reserved concurrency, todas comparten la cuota regional de concurrencia de la cuenta. Los proveedores públicos no requieren VPC ni NAT; DynamoDB es on-demand y los parámetros SSM estándar con `aws/ssm` no tienen cargo mensual. Tres alarmas cubren la observabilidad esencial dentro de la capa gratuita de CloudWatch. El presupuesto de IA limita la admisión, no la factura completa.

Los nombres físicos con `portfolio-api-cloud-test` identifican la única instalación y se conservan para no recrear recursos.

[Contratos](api.es.md) · [Operación](operations.es.md) · [Decisiones](decisions.es.md)
