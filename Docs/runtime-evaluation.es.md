# Decidir el runtime con evidencia

[English](runtime-evaluation.md) · 24/10/2026. La elección compara compatibilidad, latencia, costos y mantenimiento; conservar el framework actual no es un requisito.

**Infraestructura y runtime son decisiones separadas.** CDK define/despliega infraestructura. Nest o handlers Node.js ejecutan HTTP/negocio. La recomendación CDK puede mantenerse con cualquiera de los runtimes.

## Evidencia del proyecto

La API tiene seis rutas, sin DB, auth compleja, uploads, streaming ni workers. Eso favorece evaluar handlers livianos y una o dos funciones agrupadas, no un servicio por endpoint. Pero el chat suma 16 archivos y 2.621 líneas sin specs (incluye contenido), contacto 122, suscripciones 197 y runtime config 210. No es una app vacía que se pueda reemplazar sin trasladar comportamiento.

El acoplamiento Nest verificado incluye decoradores/DI, ConfigService, Logger, excepciones HTTP, ValidationPipe, throttler y bootstrap Express. FAQ, ranking, fechas, datos curados, prompts y parte de integración son reutilizables. Un runtime nativo requiere sacar dependencias Nest también de servicios/imports: envolver el controlador en un handler no las elimina. No hace falta cambiar lenguaje, IA, proveedor ni contratos.

La [guía oficial Nest serverless](https://docs.nestjs.com/faq/serverless) muestra que framework y bundling influyen en startup. Sus microbenchmarks de ejemplo en una máquina local **no son cold starts AWS de esta API**. No extrapolar sus milisegundos ni inventar una diferencia en segundos. Un cold start incluye runtime/imports/DI/config/secretos/knowledge; una respuesta chat añade red y generación. Optimizar el framework puede no resolver la latencia dominante.

## Comparación técnica documentada

| Candidata                                       | Qué reutiliza                                | Trabajo/riesgo                                                                                                            | Hipótesis a verificar                                           |
| ----------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| A. Nest/Express adaptado                        | servicios, DTOs, validación, errores y tests | bootstrap/adapter/paquete; cuotas y timeouts igual requieren cambios                                                      | menor migración; más inicialización/imports                     |
| B. Handler Node.js compacto por responsabilidad | dominio/contenido/SDKs y casos contractuales | composición explícita, parser/validación/error mapper, IP/límites/headers; reaprovechar class-validator si reduce cambios | menos dependencias/bootstrap; costo de migración aceptable      |
| C. Servidor en Web Functions                    | servidor/framework elegido                   | Node 24, endpoint/roles/cobro diferentes                                                                                  | beneficio de concurrencia/CPU activa compensa memoria residente |

No agregar otro framework HTTP, librería de validación o una arquitectura de ports/adapters por defecto. Empezar B con la menor superficie de composición/ruteo suficiente, sin reescribir el conocimiento. A es control comparativo real, no implementación descartada de antemano.

## Experimento y criterios técnicos

Primera etapa local implementada: misma versión Node para A/B, lockfiles reproducibles, mismo artifact, memoria, contratos y respuestas mock deterministas. Medir tamaño ZIP/dependencias, tiempo de import/inicialización en procesos nuevos y p50/p95, luego invocación caliente. Al menos 30 arranques alternados por candidata para exploración; reportar dispersión y advertir que no equivale a Lambda.

En un entorno AWS de prueba: mismas región/arquitectura/memoria (512 y 1024 MiB), red, secretos/cache y protección; comprobar frío mediante INIT/telemetría, no asumir que cada request lo es. Medir rutas rápidas y chat separadas, p50/p95/p99 cuando haya muestra suficiente, errores/fallback, billed duration y costo. Mantener proveedores simulados para aislar framework; una muestra real con presupuesto definido valida la experiencia final. No usar carga ni llamadas pagas en producción.

La migración está decidida y la estructura inicial se construirá con handlers TypeScript. Nest adaptado queda como control documental y la implementación NestJS original se conserva como alternativa independiente. La comparación no se usa para reabrir la decisión de migrar.

Los resultados locales, compatibilidad y límites están registrados en el [experimento](local-runtime.es.md) y su [evidencia](runtime-evidence.es.md). Las protecciones distribuidas, el comportamiento en AWS, los costos observados y la recuperación siguen siendo requisitos de aceptación de la implementación. No se deducen cold starts ni ahorro mensual de estos arranques locales.
