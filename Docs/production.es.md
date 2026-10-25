# Configuración productiva

[English](production.md)

Conservé la instalación física `portfolio-api-cloud-test` para evitar otra API, tabla y conjunto de roles. El paquete productivo usa `dist/handler.handler`, sin proveedores simulados. La candidata exige IAM; `PublicAccess=true` habilita acceso anónimo luego del smoke privado. CORS solo admite los orígenes configurados. La identidad procede de `requestContext.http.sourceIp` del gateway directo; ningún header del cliente reemplaza esa IP. El frontend puede cambiar solo su URL base, conservando los seis contratos.

## IA y costos

GPT-6 Luna es el único modelo admitido en configuración y proveedor. Uso Responses, `reasoning.effort=none`, `store=false`, tier Standard (`default`), sin herramientas, generación alternativa ni reintentos. El conteo previo usa el mismo modelo, input, formato y reasoning. El límite de 600 tokens cubre toda la salida, incluidos tokens no visibles y de razonamiento. Solo una respuesta `completed` del modelo esperado puede ser éxito.

La tarifa Standard verificada el 25/10/2026 es USD 0,10 por millón de tokens de entrada y USD 0,50 de salida. La reserva usa USD 0,125/M de entrada para cubrir también una posible escritura de caché y USD 0,50/M para toda la salida, sin descuentos por cache hits. Se rechazan entradas superiores a 272.000 tokens para evitar tarifas de contexto largo. Las métricas distinguen entrada, caché, escritura, salida y razonamiento; el razonamiento ya está incluido en salida y no se cobra dos veces.

Las FAQ siguen siendo locales. Se conservan cinco respuestas IA por sesión y origen/día y reserva atómica global antes de generar. Los fallos, timeouts y respuestas incompletas conservan la reserva y devuelven continuidad controlada con contacto. Abortar el transporte local no demuestra que el proveedor haya dejado de facturar; cancelar por ID solo está disponible para Responses en background, que esta aplicación no utiliza. Las tarifas requieren revisión en un máximo de 31 días; al vencer se bloquea negocio hasta renovar configuración.

## Operación y recuperación

La cuota regional es 10. La Lambda no reserva concurrencia: una reserva de 5 requeriría una cuota mayor de 100 para dejar el mínimo sin reservar. Conservo el throttle 2/s y burst 5, las cuotas DynamoDB y el presupuesto previo; el agotamiento regional puede devolver errores controlados y no amplía gasto admitido. No se pide aumento de cuota.

La fundación reduce la administración API Gateway al ID `9vxryiyill`, con bootstrap regional deshabilitado. Configuración real en un secreto independiente del de validación. Logs sin texto/PII con retención 14 días; alarmas de errores, throttles y duración. Las alarmas sin acciones necesitan revisión operativa; no sustituyen el corte de gasto.

El rollback de tráfico restaura la URL base del frontend a `https://api.matiasgaleano.dev/api` y publica la revisión recuperable por Actions. EC2, API NestJS, datos de suscriptores y automatización de `portfolio-cloud` se conservan. El assembly revisado permite recuperar código e infraestructura, sin restaurar ni borrar datos o secretos.

## Fuentes

- [Modelo Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)
- [Tarifas](https://developers.openai.com/api/docs/pricing)
- [Conteo y tokens no visibles](https://developers.openai.com/api/docs/guides/token-counting)
- [Reasoning](https://developers.openai.com/api/docs/guides/reasoning)
- [Cancelación](https://developers.openai.com/api/reference/resources/responses/methods/cancel)

## Comprobación

[HTTP, usage y recuperación](production-rollout.es.md).
