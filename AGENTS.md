# portfolio-api-cloud

## Contexto de trabajo

Si existe un workspace con AGENTS.md en los directorios padre, leerlo explícitamente antes de editar y seguir sus referencias. Una raíz Git anidada puede impedir la herencia automática. Fuera de ese entorno, este archivo y el README deben ser suficientes para trabajar.

## Estructura y contratos

- TypeScript ESM para Lambda/HTTP API; CDK en infra/ y runtime en src/.
- Conservar seis contratos HTTP: health, contact, chat/starters, chat y alta/baja de subscriptions.
- DynamoDB mantiene controles compartidos; configuración sensible se resuelve mediante Secrets Manager.
- Contacto usa proveedor encapsulado; chat conserva FAQ/fallback y reservas monetarias previas a IA.
- Las FAQs no invocan modelos; las suscripciones delegan a portfolio-cloud.
- Mantener dominio público, CORS, cuotas, límites y comportamiento compatible de DTOs/errores.
- No confundir diseños futuros con la arquitectura implementada.

## Desarrollo y verificación

- Usar Node indicado por .nvmrc y requisitos de Docs/development.md.
- npm ci --ignore-scripts instala; npm run check ejecuta verificación compuesta.
- npm run typecheck, npm test y npm run test:package verifican código y ZIP.
- npm run check:docs verifica documentación técnica y enlaces locales.
- Los tests bloquean red y usan proveedores simulados; synth local no debe consultar AWS.

## Restricciones

- Conservar runtime separado de infraestructura y sin dependencias NestJS.
- No duplicar escrituras con la implementación compatible portfolio-api.
- No introducir llamadas pagas o ensayos productivos en comprobaciones locales.
- Las entregas autorizadas siguen artifacts verificados, OIDC y changesets revisados.
- Consultar Docs/operations.md para procedimientos técnicos de recuperación.
