# Auditoría de la API completa

[English](audit.md) · Fecha: 24/10/2026. Alcance: lectura de código, configuración versionada y metadata; sin ejecutar flujos de negocio.

## Evidencia y límites

La auditoría fija los commits inspeccionados para mantener trazabilidad de los contratos y las dependencias.

| Repo | HEAD local inspeccionado | Rama local | `main` verificado en GitHub |
| --- | --- | --- | --- |
| portfolio-api | `a0ef80fa9f82d1cea5a31425a63ab0a344338c56` | fix/aws-deployment-identity | `7d535b5713807a28081523c573445320bf1ad42e` |
| portfolio | `c1eac3492a54933f5c99540a3b4f61d0e70938cd` | fix/aws-deployment-identity | `34856adee211f57ddb32a8573b9af9578d73235b` |
| portfolio-cloud | `4c0b1735dde0759a9dbef5625aae7788386e9210` | feat/aws-oidc-migration | `bdc1510dbc8dca8765a69d278f65aa3ce6e7902b` |

Las referencias locales `origin/main` estaban desactualizadas. Se consultó `main` por GitHub sin fetch ni modificación. La comparación remota local-HEAD→main mostró solo workflows en API/frontend y workflows/README/template en cloud. La evidencia siguiente referencia el HEAD realmente leído. El SHA desplegado en EC2 no se verificó.

**Infraestructura observada:** en la cuenta personal, región us-east-1, una EC2 `t3.micro` en ejecución con 3/3 checks, Amazon Linux 2023, IMDSv2 requerido y protecciones de parada/terminación. El volumen raíz EBS tiene 8 GiB y no está cifrado. CloudFormation muestra `portfolio-cloud-prod` en `UPDATE_COMPLETE`, actualizado el 11/10/2026 19:40:43 AR, con drift `NOT_CHECKED`. Sus 16 recursos incluyen seis Lambdas, seis roles, HTTP API/stage y dos permisos de invocación. No aparece CDKToolkit en la lista de stacks activos consultada; esa observación se limita a esta región. La facturación real se mantiene en el registro privado; el [modelo público](costs.es.md) usa escenarios hipotéticos.

**Pendiente:** tráfico por ruta, latencias, CPU/créditos, tipo EBS, digest de imagen activa, valores de configuración efectiva, reglas vigentes Cloudflare, estado SSM y IAM efectivo. No se abrieron `.env`, secretos, parámetros sensibles ni datos de suscriptores. El documento `Docs/operations/aws-access-2026-10-11.es.md` del workspace se leyó como historia, no como evidencia viva.

## Módulos y contratos

Prefijo global `/api`, JSON/urlencoded de 16 KiB, DTOs con whitelist, rechazo de campos desconocidos y transformación. CORS toma una lista de `CORS_ORIGIN`; `*` refleja cualquier origen. No hay autenticación, JWT, sesiones ni endpoints admin. El historial del chat llega del navegador y no constituye identidad.

Fuentes: [bootstrap](https://github.com/matigaleanodev/portfolio-api/blob/a0ef80fa9f82d1cea5a31425a63ab0a344338c56/src/main.ts#L12), [módulos y guard global](https://github.com/matigaleanodev/portfolio-api/blob/a0ef80fa9f82d1cea5a31425a63ab0a344338c56/src/app.module.ts#L10).

| Método y ruta | Entrada → salida | Protección actual | Consumidor y validación futura |
| --- | --- | --- | --- |
| GET /api/health | sin body → 200 `{status:"ok"}` | sin throttling | deploy/operación; contrato y fallo real de inicialización |
| POST /api/contact | name 2–100, email ≤150, message 10–5000, company opcional ≤200 → 204 vacío | 5/h/IP; honeypot company omite envío | formulario; proveedor mock, errores 400/429/500, nunca enviar email real por auditoría |
| GET /api/chat/starters | sin body → 200 `{suggestedQuestions:string[]}` | guard chat 20/min/IP | widget; conservar contenido/forma y CORS |
| POST /api/chat | message no blanco ≤500, sessionId opcional ≤100, history opcional ≤6 turnos user/assistant ≤1500 cada uno → **201** `{answer,suggestedQuestions,source}` | chat 20/min/IP | widget; historial, FAQ/AI/fallback, 400/413/429/503 y status 201 |
| POST /api/subscriptions | email normalizado trim/lowercase ≤320 → 200 `{message,email?}` | 10/h/IP | formulario blog; mock upstream, errores y email normalizado |
| DELETE /api/subscriptions | mismo JSON **en body** → 200 `{message,email?}` | 10/h/IP | UI de baja; preservar body DELETE y errores |

Los overrides de `@Throttle` reemplazan la configuración default para esas rutas; no sumar 60/min como una segunda cuota independiente. El storage de Throttler es local al proceso. CORS y honeypot no bloquean clientes fuera del navegador.

Fuentes: [health](https://github.com/matigaleanodev/portfolio-api/blob/a0ef80fa9f82d1cea5a31425a63ab0a344338c56/src/app.controller.ts), [contacto](https://github.com/matigaleanodev/portfolio-api/blob/a0ef80fa9f82d1cea5a31425a63ab0a344338c56/src/contact/contact.controller.ts), [DTO contacto](https://github.com/matigaleanodev/portfolio-api/blob/a0ef80fa9f82d1cea5a31425a63ab0a344338c56/src/contact/contact.dto.ts), [chat](https://github.com/matigaleanodev/portfolio-api/blob/a0ef80fa9f82d1cea5a31425a63ab0a344338c56/src/chat/chat.controller.ts), [DTO chat](https://github.com/matigaleanodev/portfolio-api/blob/a0ef80fa9f82d1cea5a31425a63ab0a344338c56/src/chat/chat.dto.ts), [suscripciones](https://github.com/matigaleanodev/portfolio-api/blob/a0ef80fa9f82d1cea5a31425a63ab0a344338c56/src/subscriptions/subscriptions.controller.ts).

## Inventario por funcionalidad

| Funcionalidad y código | Dependencias y comportamiento comprobado | Conservar / riesgo de migración / verificación |
| --- | --- | --- |
| ContactService, `src/contact/contact.service.ts:15` | SDK Resend; envío esperado antes de terminar; fecha Argentina; error del SDK o excepción → 500 controlado | conservar texto y 204; no hay timeout explícito de aplicación ni clave de idempotencia. Probar timeout/resultado ambiguo con mock; no repetir automáticamente envíos |
| ChatService, `src/chat/chat.service.ts:63` | filtra fuera de alcance, FAQ sin historial, selección de contexto, reformulación con IA opcional, fallback | una FAQ puede consumir IA; `source=faq` no implica costo cero. No cambiar contratos ni adjudicar éxito solo por HTTP 201 |
| OpenAiService, `src/chat/openai.service.ts:87` | `fetch` nativo a `/v1/responses`, sin SDK OpenAI; default gpt-4.1-mini, configurable; timeout 15 s, max_output_tokens 300, JSON | sin tools/function calling, embeddings, vector DB ni streaming; preservar prompts/contexto/historial y fallback; probar parseo y fallo con fetch mock |
| ChatKnowledgeRepository, `src/chat/chat-knowledge.repository.ts:112` | SDK S3 contra Cloudflare R2; envelope v1/checksum SHA-256 o artifact local validado; single-flight por proceso | TTL remoto default 5 min; ante error usa stale sin edad máxima, luego filesystem. En instancia nueva no hay stale; empaquetar fallback válido y probar corrupción/R2 caído |
| KnowledgeService y publication, `src/chat/knowledge.service.ts:60` | perfil/FAQ/cloud curados y artifact editorial; selección por intención, hasta unos cuatro items; filtra fechas futuras/inválidas con día Argentina | perfil profesional puede responder sin R2; conservar aislamiento de proyectos, fecha, links e integridad. Probar frío/caliente y cambios de publicación |
| Caché IA, `src/chat/openai.service.ts:170` | Map hasta 200 entradas, TTL 24 h; hash de mensaje/contexto/historial/links/sugerencias | efímera y por entorno; no persistencia conversacional. Menor hit rate en Lambda puede aumentar gasto OpenAI; medir sin introducir Redis |
| FaqService, `src/chat/faq.service.ts:66` | datos versionados; incrementUsage es no-op | no hay contador que migrar. Conservar matching y sugerencias; tests existentes |
| SubscriptionsService, `src/subscriptions/subscriptions.service.ts:37` | HTTP a PORTFOLIO_CLOUD_API_URL + /subscriptions; timeout 8 s; 4xx→400, 5xx/éxito inválido→502, red→503 | conservar semántica incluso pérdida de 429 upstream como 400; no crear persistencia nueva; probar sin llamar upstream productivo |
| Observabilidad, `src/chat/chat-metrics.ts:34` | Nest Logger stdout, JSON con duración/outcome/tokens, sin texto o identidad del visitante para métricas chat | no hay exporter Prometheus ni alarmas versionadas para esta API; trasladar stdout a CloudWatch, correlación y retención limitada; revisar otros errores para evitar PII |

[Árbol completo de fuentes](https://github.com/matigaleanodev/portfolio-api/tree/a0ef80fa9f82d1cea5a31425a63ab0a344338c56/src).

### Persistencia del proveedor IA

La aplicación no guarda conversaciones en DB ni usa previous_response_id, pero su request Responses omite `store`. OpenAI Docs indica retención de objetos Response por defecto de 30 días y permite `store:false`; la política efectiva de la cuenta no se verificó. No confundir ausencia de persistencia propia con ausencia de persistencia del proveedor. Revisar retención como decisión explícita al migrar, sin cambiarla silenciosamente. [Estado y retención oficial](https://developers.openai.com/api/docs/guides/conversation-state).

## Datos, procesos y filesystem

- Sin ORM, MongoDB, SQL, migraciones, pool de conexiones ni base de datos de aplicación en código/dependencias. No hacen falta RDS, RDS Proxy ni VPC por un requisito actual.
- Sin uploads, multipart, escritura de archivos del runtime, cron, colas, workers ni tareas deliberadas posteriores a responder. Los timers de abort y cachés no son workers.
- Filesystem: lectura/stat del fallback `.generated/chat/knowledge.json`; alternativa de desarrollo `../portfolio/.generated/chat/knowledge.json`. Esa ruta hermana no existe en un ZIP Lambda. El Dockerfile copia `dist`, no el artifact; no asumir que la imagen actual lo incluye.
- Límite importante: el timeout R2 usa `Promise.race` equivalente, no aborta el SDK y solo rodea `send`; lectura del body ocurre después. Trabajo de red puede quedar pendiente tras el fallback. Se debe acotar conexión, lectura y reintentos realmente.
- ConfigModule carga `.env` por defecto. El paquete futuro no debe contener esos archivos y las pruebas deben usar `ignoreEnvFile` y mocks. No se ejecutaron las suites durante esta auditoría.

## Límites entre repos

[ApiService del frontend](https://github.com/matigaleanodev/portfolio/blob/c1eac3492a54933f5c99540a3b4f61d0e70938cd/src/app/services/api.service.ts) usa Angular HttpClient para las cinco rutas de negocio. `src/environments/environment.ts:2` fija `https://api.matiasgaleano.dev/api`. El chat conserva mensajes en localStorage; `chat-history.ts` envía hasta seis turnos y recorta el body a 15 KiB. No usa SSE ni WebSocket. Cambiar URL exige build/publicación del frontend o conservar el dominio mediante un corte de infraestructura.

[template SAM](https://github.com/matigaleanodev/portfolio-cloud/blob/4c0b1735dde0759a9dbef5625aae7788386e9210/template.yaml) declara seis funciones: subscribe, unsubscribe, generate-og, notify-post, process-release, publish-chat-knowledge. Las primeras dos se exponen por HTTP API; process-release invoca OG y notify. No hay EventBridge/schedule declarados en ese template. El workflow de `portfolio` tiene cron diario 12:17 UTC e invoca process-release/publish-chat-knowledge después del handoff editorial. No duplicarlo acá.

`portfolio-cloud/src/shared/subscribers.ts` guarda objetos JSON por email en R2 privado, separado del bucket de medios; alta hace Head+Put y baja Head+Delete. La creación no es una transacción condicional: dos altas paralelas pueden observar ausencia y escribir. Los handlers de alta/baja inspeccionados no envían correo; las notificaciones de publicaciones pertenecen a notify-post. Mantener un único owner y evitar reproducciones de escrituras contra el upstream durante validación. El upstream público puede eludir la fachada: limitar solo esta API no lo protege.

## Variables, sin valores secretos

| Grupo | Nombres de variables o referencias | Carácter |
| --- | --- | --- |
| HTTP/runtime | NODE_ENV, PORT, CORS_ORIGIN, TRUST_PROXY | configuración; cambiar origen/IP exige validación |
| Contacto | RESEND_API_KEY; CONTACT_FROM_EMAIL, CONTACT_TO_EMAIL | API key secreta; direcciones no requieren publicarse |
| IA | OPENAI_API_KEY, OPENAI_CHAT_MODEL | key secreta; modelo default en código, override efectivo no verificado |
| Integración | PORTFOLIO_CLOUD_API_URL | URL de configuración |
| Knowledge | R2_ENDPOINT, R2_REGION, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, CHAT_KNOWLEDGE_OBJECT_KEY, CHAT_KNOWLEDGE_CACHE_TTL_MS | credenciales R2 secretas; resto configuración |
| CI actual API | AWS_REGION, AWS_ROLE_ARN, EC2_INSTANCE_ID; GHCR_TOKEN, DEV_SYNC_PAT | variables AWS y referencias a tokens GitHub; no valores |

`runtime.config.ts:143` exige contacto y URL cloud en startup; OpenAI es opcional. Producción exige configuración R2 completa o artifact local en la ruta primaria. No se comprobó qué alternativa está configurada realmente.

## Empaquetado, operación y pruebas

Lockfile: Nest core/platform-express 11.1.13, Express 5.2.1, throttler 6.5.0, Resend 6.9.1, AWS S3 SDK 3.1004.0, TypeScript 5.9.3. Node 22 Alpine en Docker. No hay renderizador nativo ni binario del SO requerido por esta API; no copiar `@resvg/resvg-js` de cloud. Un adaptador Lambda, ZIP, metadata de decoradores, dependencias opcionales y CA/TLS requieren prueba real de empaquetado.

`portfolio-api/.github/workflows/ci.yml` ejecuta lint (actualmente con --fix), unitarias y e2e en PR a main. Deploy escucha push main/manual, OIDC + SSM, GHCR con sha y latest, timeout y cuenta permitida; no depende explícitamente del resultado de CI en el mismo workflow. `deploy-app.sh` del workspace permite solo tres apps, actualiza IMAGE, Compose pull/up, verifica imagen/health y limpia imágenes. El workflow retiene solo tres tags SHA en GHCR: insuficiente como única garantía de recuperación a meses. `sync-dev.yml` legado usa PAT y fallback force; no se replica esa política en el repo nuevo.

El bootstrap EC2 versionado describe Cloudflare Tunnel→Traefik interno→contenedor y observabilidad compartida Grafana/Loki/Promtail. Es evidencia de configuración declarada, no una inspección del host. `/api/health` solo confirma respuesta del proceso, no disponibilidad de Resend/R2/OpenAI/upstream.

Pruebas existentes inspeccionadas: DTO/config, contacto con Resend mock, suscripciones con fetch mock y mapeo de errores, FAQ/contexto, envelope/cache/fallback, fecha Argentina, historial, aislamiento del perfil y métricas. E2E con Supertest y módulos parcialmente simulados. **No se ejecutaron** y no prueban el futuro evento API Gateway, IP real, throttling distribuido, IAM, ZIP o cold starts. No se reproducen como resultados actuales los conteos de roadmaps históricos.

## Riesgos ordenados

| Impacto | Hallazgo | Tratamiento y evidencia necesaria |
| --- | --- | --- |
| Alto | cuotas por IP en memoria no sobreviven distribución/reinicio; CORS no autentica | límite compartido antes de salida pública; IP de evento confiable, pruebas de bypass/concurrencia; revisar upstream con su owner |
| Alto | pruebas de contacto o suscripciones reales duplican efectos | mocks por defecto; test aislado y sin retries automáticos de POST; no shadow writes |
| Alto | timeouts no acotan todo el chat/R2/contacto | deadline total menor que entrada HTTP, abort real del SDK/body, revisar Resend/reintentos y probar resultados ambiguos |
| Alto | fallback inexistente en entorno frío + R2 caído | empaquetar artifact versionado, checksum y fecha; probar error cold y definir staleness máximo |
| Medio | IAM/bootstrap nuevo sin diseño final; límites existentes son por proyecto | roles acotados y boundaries nuevas revisadas; no reutilizar roles SAM/SSM ni defaults admin |
| Medio | caché IA fragmentada aumenta costo/proveedor y cold start | medir hit rate, billed duration y tokens; no garantizar ahorro ni agregar Redis anticipadamente |
| Medio | salud superficial y métricas de API por ruta ausentes | logs sin cuerpos, latencia/error/timeout/429/fallback, costo; umbrales en entorno test |
| Medio | recuperación depende de artifacts/imagen/config y EC2 compartida | pin de imagen y documentación de restore; no apagar al terminar solo Portfolio |
