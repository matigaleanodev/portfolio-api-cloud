# Configuración productiva

[English](production.md)

Conservé la instalación física `portfolio-api-cloud-test` para evitar otra API, tabla y conjunto de roles. El paquete productivo usa `dist/handler.handler`, sin proveedores simulados. La candidata exige IAM; `PublicAccess=true` habilita acceso anónimo luego del smoke privado. CORS solo admite los orígenes configurados. El dominio definitivo es `api.matiasgaleano.dev`, con certificado ACM regional y proxy Cloudflare. El handler exige API/stage/dominio esperados, IP de salida en los rangos oficiales de Cloudflare y `x-portfolio-origin` sobrescrito por una regla exclusiva de ese hostname. Solo después acepta una única IP válida de `CF-Connecting-IP`; ignora `X-Forwarded-For`. Las cuotas conservan la identidad individual, incluida normalización IPv6. El endpoint execute-api se cierra tras comprobar el dominio. El frontend puede cambiar solo su URL base, conservando los seis contratos.

## IA y costos

GPT-6 Luna es el único modelo admitido en configuración y proveedor. Uso Responses, `reasoning.effort=none`, `store=false`, tier Standard (`default`), sin herramientas, generación alternativa ni reintentos. El conteo previo usa el mismo modelo, input, formato y reasoning. El límite de 600 tokens cubre toda la salida, incluidos tokens no visibles y de razonamiento. Solo una respuesta `completed` del modelo esperado puede ser éxito.

La tarifa Standard verificada el 25/10/2026 es USD 0,10 por millón de tokens de entrada y USD 0,50 de salida. La reserva usa USD 0,125/M de entrada para cubrir también una posible escritura de caché y USD 0,50/M para toda la salida, sin descuentos por cache hits. Se rechazan entradas superiores a 272.000 tokens para evitar tarifas de contexto largo. Las métricas distinguen entrada, caché, escritura, salida y razonamiento; el razonamiento ya está incluido en salida y no se cobra dos veces.

Las FAQ siguen siendo locales. Se conservan cinco respuestas IA por sesión y origen/día y reserva atómica global antes de generar. Los fallos, timeouts y respuestas incompletas conservan la reserva y devuelven continuidad controlada con contacto. Abortar el transporte local no demuestra que el proveedor haya dejado de facturar; cancelar por ID solo está disponible para Responses en background, que esta aplicación no utiliza. Las tarifas requieren revisión en un máximo de 31 días; al vencer o ser inválida la configuración de IA se deshabilita únicamente generación paga, también en una instancia caliente y antes de reutilizar caché. Las FAQ, health, starters, contacto y suscripciones mantienen sus contratos cuando su configuración propia es válida. No se habilita otro modelo ni proveedor.

## Operación y recuperación

La cuota regional es 10. La Lambda no reserva concurrencia: una reserva de 5 requeriría una cuota mayor de 100 para dejar el mínimo sin reservar. Conservo el throttle 2/s y burst 5, las cuotas DynamoDB y el presupuesto previo; el agotamiento regional puede devolver errores controlados y no amplía gasto admitido. No se pide aumento de cuota.

La fundación reduce la administración API Gateway al ID `9vxryiyill`, con bootstrap regional deshabilitado. Configuración real en un secreto independiente del de validación. Logs sin texto/PII con retención 14 días; alarmas de errores, throttles y duración. Un filtro de logs cuenta las respuestas HTTP 5xx controladas, además de las alarmas Lambda de errores, throttles y duración. `AlarmTopicArn` conecta las cuatro alarmas a SNS. Una suscripción email pendiente no equivale a notificaciones operativas; hay que confirmar su estado. Las alarmas no sustituyen el corte de gasto.

El rollback de tráfico conserva la URL del frontend y restaura el CNAME proxied de `api.matiasgaleano.dev` a `7dcf5fb8-082e-4601-9282-8a0311759f7a.cfargotunnel.com`. El hostname del túnel y su servicio anterior permanecen configurados. Comprobar health con Origin/User-Agent del frontend y los contratos afectados; ante una regresión del corte, restaurar primero el routing y diagnosticar. El secreto añadido por Cloudflare no altera los contratos de la API anterior. EC2, API NestJS, datos de suscriptores y automatización de `portfolio-cloud` se conservan. El assembly revisado permite recuperar código e infraestructura, sin restaurar ni borrar datos o secretos.

## Fuentes

- [Modelo Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)
- [Tarifas](https://developers.openai.com/api/docs/pricing)
- [Conteo y tokens no visibles](https://developers.openai.com/api/docs/guides/token-counting)
- [Reasoning](https://developers.openai.com/api/docs/guides/reasoning)
- [Cancelación](https://developers.openai.com/api/reference/resources/responses/methods/cancel)

## Comprobación

[HTTP, usage y recuperación](production-rollout.es.md).

## Revisión de tarifas y fallback

Antes de `AI_PRICING_VALID_UNTIL`, revisar tarifas Standard y límites del único modelo en las fuentes oficiales. Si cambian, actualizar primero la reserva conservadora en `shared-control.ts`, sus pruebas y el artifact por PR/CI. Después renovar en Secrets Manager la fecha de revisión, como máximo a 31 días, conservando `QUOTA_KEY_SECRET`, el presupuesto y las reservas existentes. Si no se revisa, la generación permanece deshabilitada. Nunca extender la fecha como sustituto de revisar precios.

Para renovar el fallback, recuperar el artifact editorial publicado por `portfolio-cloud`, validar esquema, checksum y fecha máxima de 30 días, y reemplazar el archivo versionado mediante PR/CI. No fabricar una fecha nueva sobre contenido viejo. FAQ y contratos ajenos al contenido editorial siguen disponibles; las preguntas que necesitan conocimiento vencido fallan de forma controlada.

[Rangos oficiales de Cloudflare](https://www.cloudflare.com/ips/), [headers de visitante](https://developers.cloudflare.com/fundamentals/reference/http-request-headers/#cf-connecting-ip), [reglas de headers](https://developers.cloudflare.com/rules/transform/request-header-modification/), [cierre de execute-api](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-disable-default-endpoint.html).
