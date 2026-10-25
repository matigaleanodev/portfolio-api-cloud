# Primer experimento local de runtime

[English](local-runtime.md) · 24/10/2026.

La migración a serverless está decidida. La comparación documenta el comportamiento y las diferencias de implementación; no condiciona esa decisión. Los handlers TypeScript son la base del siguiente incremento y Nest queda como referencia técnica.

## Procedencia y reproducción

El experimento reutilizó portfolio-api@a0ef80fa9f82d1cea5a31425a63ab0a344338c56. Se leyeron blobs Git del SHA fijado y se verificaron hashes por archivo sin modificar la API original. La [evidencia conservada](runtime-evidence.es.md) identifica fuentes, insumos, paquetes y muestras.

La composición nativa eliminó decoradores DI e imports de soporte Nest para Logger, configuración y excepciones. DTOs, dominio, prompts, contenido, proveedores, cachés y timeouts se conservaron. No se introdujo una plataforma genérica.

Esta entrega es documental. Las herramientas, fuentes copiadas y paquetes del experimento se retiraron del checkout; los comandos npm del experimento no están disponibles en un checkout documental. La siguiente etapa es construir la estructura inicial mantenible de la API en este repositorio.

El experimento comprobó integridad y tipos estrictos sin editar las fuentes. Las 123 pruebas unitarias originales se transpilan con isolatedModules como en el origen; no constituyen un chequeo de tipos de sus specs. Las fuentes del prototipo se comprobaron por separado con tsc estricto.

92 escenarios diferenciales comparan status, JSON, headers funcionales y llamadas simuladas en procesos aislados. Date, Content-Length y ETag quedan fuera de la comparación de transporte. Incluyen los seis contratos, límites/ventanas/IP, rechazo de campos, historial, body DELETE/base64/urlencoded, 16 KiB exactos, errores de proveedores, checksum, fallback frío, 503 sin knowledge, cachés y stale.

Las cuotas actuales son por proceso y por método del controlador, también para GET/POST chat y POST/DELETE suscripciones. No hay una cuota compartida entre esas rutas. Ambas variantes usan sourceIp del evento HTTP API v2 e ignoran X-Forwarded-For como identidad. Esto valida la adaptación local, no la cadena real de proxies ni el control distribuido. Se conserva un borde de Throttler 6.5.0: al vencer un bloqueo cancela timers del grupo default que pertenecen a otras claves, pudiendo prolongar sus contadores. Un caso diferencial lo reproduce; el algoritmo requiere revisión antes de distribuir cuotas.

Los tests de ZIP extraen fuera del repo y verifican ejecución sin node_modules, fallback empaquetado, exclusión de privados, .env ignorado y red bloqueada.

## Resultados locales

Node v24.19.0; Linux x64 / WSL2; AMD Ryzen 7 9800X3D 8-Core Processor.

30 procesos nuevos por candidata, orden alternado e invertido en cada par, misma configuración y artifact. No se vació el page cache del SO ni se fijaron CPU/RAM como Lambda. El experimento usó Node 24. La CI preparada apunta a Node 22; no hay una ejecución remota de estos prototipos.

SDK reales de S3 y Resend incluidos en ambos bundles. Configuración/proveedores ficticios obligatorios: fetch, S3.send y sockets interceptados antes de importar los servicios. Ninguna opción habilita red real. Logs silenciados en ambas candidatas durante la medición.

| Metric (ms)               |              Nest | TypeScript handlers |
| ------------------------- | ----------------: | ------------------: |
| Import + init, p50 / p95  | 195.194 / 219.406 |   141.441 / 165.677 |
| Import + init, min / max  | 187.438 / 225.579 |   137.211 / 167.159 |
| Import, p50 / p95         | 147.569 / 166.439 |   131.108 / 153.752 |
| Init, p50 / p95           |   48.164 / 55.993 |     10.239 / 13.466 |
| Health first, p50 / p95   |     3.327 / 4.091 |       2.589 / 2.894 |
| Health warm, p50 / p95    |     0.194 / 0.580 |       0.100 / 0.346 |
| Chat mock warm, p50 / p95 |     0.845 / 5.539 |       0.679 / 4.456 |

| Package        |      Nest | TypeScript handlers |
| -------------- | --------: | ------------------: |
| Bundle (bytes) | 8,096,529 |           6,224,140 |
| ZIP (bytes)    | 1,684,535 |           1,405,179 |
| Modules        |     2,235 |               1,431 |

Import + init empieza antes de require y termina al obtener el handler listo; excluye el arranque del ejecutable Node. Percentiles nearest-rank. Warm combina 600 invocaciones por ruta/candidata dentro de esos 30 procesos, con cachés por entorno y proveedores instantáneos. processWallMs en el JSON incluye creación, todas las invocaciones y cierre: no es startup. No se calcula p99 con esta muestra. [Muestras de arranque, entorno, hashes y dependencias](runtime-evidence.es.md).

Ambos paquetes se compilan con metadata TypeScript y se bundlean con esbuild sin minificar, con el mismo fallback sintético. El handler nativo rechaza imports transitivos Nest/Express durante el build; conserva body-parser y class-validator/class-transformer para mantener semántica. Fuentes y specs quedan fuera del ZIP. Son paquetes de experimento local con mocks obligatorios, no entregables productivos.

## Interpretación y límites

Los handlers reducen inicialización y tamaño en esta muestra y no necesitan Nest para los casos comprobados. El resultado apoya continuar por esa dirección; no demuestra ahorro monetario ni cold starts AWS. Espera externa, billed duration, secretos y fragmentación de caché no están medidos. No se deducen GB-s de estos milisegundos.

La intercambiabilidad se limita a esta aplicación: sustituir su implementación conservando HTTP/comportamiento, con configuración de URL o routing si corresponde. Las otras APIs conservan dominios propios. No se implementó conmutación ni se ensayó recuperación productiva. La API original permanece intacta; la procedencia fijada permite recuperar la base de comparación.

Bloqueos para una salida pública: cuotas compartidas, deadline/cancelación completa, política stale/retención del proveedor, configuración/secretos por ambiente y recuperación real. npm audit --omit=dev reportó 15 dependencias afectadas en este lock (10 high, 5 moderate), incluidas ramas transitivas del baseline. [Registro de dependencias](runtime-evidence.es.md#dependencias-observadas). Se conservaron versiones de origen para comparar; actualización y reevaluación de alcance preceden la publicación del runtime.

Referencias: [Nest serverless](https://docs.nestjs.com/faq/serverless), [serverless-express](https://github.com/CodeGenieApp/serverless-express), [HTTP API v2](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html). [Costo total](costs.es.md) y [decisiones](decisions.es.md).

La API serverless productiva y la renovación de sus datos editoriales todavía no están implementadas. La renovación de perfil y proyectos será el último paso previo al despliegue productivo, conservando una versión previa recuperable del conocimiento.
