# portfolio-api-cloud

## Contexto de trabajo

Si existe un workspace con AGENTS.md en los directorios padre, leerlo explícitamente antes de editar y seguir sus referencias. Una raíz Git anidada puede impedir la herencia automática. Fuera de ese entorno, este archivo, el README y Docs/ deben ser suficientes para trabajar.

## Estructura

- npm workspaces con lock raíz: packages/contracts (datos neutrales sin dependencias), packages/runtime (HTTP, dominio, handlers, editorial, validación) y packages/infrastructure (CDK y plantillas). Infraestructura solo importa contracts; npm run boundaries lo verifica.
- Seis Lambdas del catálogo en packages/contracts/src/functions.ts: api, chat, process-release, generate-og (x86_64), notify-post y publish-chat-knowledge, cada una con artifact, rol y parámetro propios.
- api y chat usan una cadena Middy con solo @middy/core; no agregar @middy/http-* sin preservar contratos observables.

## Contratos

- Conservar seis contratos HTTP: health, contact, chat/starters, chat y alta/baja de subscriptions, con DTOs, errores, CORS, cuotas y límites compatibles. Las variantes de mayúsculas/slash de chat las atiende api.
- Conservar los eventos editoriales y claves R2 de contracts (editorial.ts, storage.ts): los invoca el workflow de publicación de portfolio.
- Suscripciones y publicación editorial están integradas en este repositorio sobre R2; notify-post no deduplica por destinatario.
- DynamoDB mantiene cuotas y reservas compartidas entre api y chat. Chat conserva FAQ/fallback y reservas monetarias previas a la IA; las FAQ no invocan modelos.

## Configuración

- Claves sensibles en parámetros SSM SecureString segmentados (/portfolio/prod/{api,chat,editorial,notifications}, /portfolio/validation/{api,chat}); no sensibles como variables de entorno desde parámetros CloudFormation.
- La fuente de verdad son los GitHub Secrets del environment production-parameters publicados con sync-parameters.yml; no editar parámetros en la consola ni leer secretos desde herramientas locales.
- Agregar una clave exige actualizar contracts, catálogo, workflow de sync, IAM y tests en el mismo cambio.

## Desarrollo y verificación

- Node según .nvmrc; npm ci --ignore-scripts instala y npm run check ejecuta la verificación compuesta.
- npm run typecheck, npm test (o test:app, test:editorial, test:tooling, test:infra), npm run test:package, npm run synth:local y npm run check:docs verifican partes concretas.
- Los tests bloquean red y usan proveedores simulados; synth local no consulta AWS.

## Restricciones

- Mantener runtime separado de infraestructura y sin dependencias NestJS; no agregar dependencias de producción fuera de las listas de package.mjs y check-boundaries.
- Conservar logical IDs y nombres físicos existentes para no reemplazar recursos.
- No duplicar escrituras con la implementación compatible portfolio-api.
- No introducir llamadas pagas ni ensayos productivos en comprobaciones locales.
- Las entregas autorizadas siguen artifacts verificados, OIDC y changesets revisados; consultar Docs/operations.md para configuración, despliegue y recuperación.
- Documentación pública breve y vigente, en pares ES/EN.
