# Migración reversible hasta producción

[English](migration.md) · 24/10/2026.

**Estado vigente de fase 4:** [controles del runtime](runtime-hardening.es.md), implementados y probados localmente: cuota compartida, presupuesto GLOBAL de IA, sesión/origen, cancelación, fallback versionado, configuración y observabilidad. Las referencias al traslado inicial conservan su evidencia histórica; no implican validación AWS.

La migración a serverless está decidida. Este plan corresponde a Portfolio; Foodly Notes y Modo Playa conservan sus dominios y su planificación independiente. Las tres APIs actuales permanecen operativas durante la migración completa.

## Etapas y criterios de salida

| Etapa                                         | Entrega                                                                                   | Criterio de salida                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 0. Evidencia documental                       | auditoría, procedencia, comparación local, decisiones y costos hipotéticos                | documentación bilingüe y enlaces verificables desde un checkout sin código experimental                                         |
| 1. Estructura inicial                         | handlers TypeScript, composición mínima, configuración explícita, scripts y tests locales | build y tipos correctos; red/proveedores reales bloqueados en pruebas; sin stack o abstracciones ficticias                      |
| 2. Lógica reutilizada                         | recuperar solo fuentes necesarias del SHA fijado y registrar procedencia                  | dominio, contenido y DTOs conservados; imports transitivos Nest eliminados del runtime de handlers                              |
| 3. Contratos completos                        | seis rutas y casos de error, validación, headers y límites                                | 201 chat, 204 contacto, body DELETE y 400/413/429/500/502/503; efectos simulados, sin duplicados ni tráfico de negocio          |
| 4. Endurecimiento                             | IP confiable, cuotas compartidas, deadline/cancelación, fallback íntegro y logs acotados  | pruebas de concurrencia, expiración, spoofing, corrupción, proveedor caído y resultado ambiguo                                  |
| 5. Infraestructura local                      | cerrar herramienta y definir test aislado, IAM/red/retención/rutas                        | synth sin lookups y assertions; revisar boundaries y separación pipeline/publicación/ejecutor/runtime                           |
| 6. Entrega protegida                          | App dedicada, environments y workflows compatibles con el nuevo runner                    | PR/CI/merge por workflow sin excepciones nuevas al bloqueo; no confundir documentación con aplicación validada                  |
| 7. Preparación AWS de test                    | identidad, roles, bootstrap y datos/proveedores aislados                                  | configuración revisada, recursos y costos previstos, sin acceso a datos o destinos productivos                                  |
| 8. Despliegue test                            | artefacto inmutable y endpoint independiente                                              | changeset exacto revisado y ejecución trazable; el workflow inicial solo prepara, no ejecuta el despliegue                      |
| 9. Validación administrada                    | contratos/e2e/seguridad/observabilidad y mediciones reales                                | frío demostrado con telemetría, latencia/error/costo por ruta, cuota IA y alertas; proveedores simulados primero                |
| 10. Corte y recuperación preparados           | URL/routing, runbook, imagen/config original y ensayo de retorno                          | un solo destino de escritura por request; retorno probado con EC2 operativa y artefactos retenidos                              |
| 11. Renovación final del conocimiento del bot | actualizar perfil profesional y proyectos, fuentes curadas/editoriales y fallback         | procedencia, checksum, fechas, enlaces y respuestas representativas verificados en el paquete final; versión previa recuperable |
| 12. Puesta en producción                      | publicar el paquete final y conmutar según el runbook                                     | smoke controlado, monitoreo y reversión operativa; EC2 sigue encendida                                                          |
| 13. Estabilización                            | observar comportamiento, costos y efectos reales                                          | criterios de estabilidad cumplidos y recuperación vigente; duración según evidencia                                             |
| 14. Conservación de EC2                       | completar también las otras dos migraciones y verificar backup/restauración               | apagar la instancia y conservarla detenida, sin terminarla ni desmantelarla                                                     |

La etapa 11 es el último paso antes del despliegue productivo. Las comprobaciones del conocimiento y del paquete final pertenecen a esa misma etapa; no se intercala otra entrega entre su cierre y producción.

## Etapa 1 implementada localmente

La base está implementada con health, configuración/composición explícitas, tipos estrictos, build ESM, cerco de red y CI separada. [Cobertura, procedencia y comprobaciones](application.es.md). El experimento permanece como evidencia histórica; no se recuperaron sus fuentes.

Revisar los archivos locales antes de reutilizarlos. Recuperar del origen únicamente lo necesario, con commit, rutas y hashes. Mantener el runtime sin dependencias transitivas Nest/Express; conservar class-validator/class-transformer u otras utilidades existentes cuando reduzcan riesgo de cambiar contratos. No introducir un framework nuevo, plataforma genérica o capa multicloud.

Las etapas 2/3 avanzaron con [contacto](contact.es.md): lógica/DTO y casos del SHA fijado, procedencia, proveedor simulado y cuota local. El incremento de [chat](chat.es.md) completa las dos rutas restantes y su procedencia. Alta y baja se completan en el incremento de [suscripciones](subscriptions.es.md), con cuotas independientes y proveedor HTTP simulado. Los seis contratos tienen pruebas locales y diferencias explícitas; sigue etapa 4 e integración administrada antes de exposición.

## Datos, efectos y convivencia

Portfolio no tiene esquema de aplicación que migrar. Suscriptores y releases siguen bajo portfolio-cloud/R2. No duplicar persistencia, cron, process-release, notify-post o publicación de knowledge. Cada request de contacto/suscripción se dirige a una sola implementación; no usar shadow/replay de escrituras ni retries automáticos tras un timeout ambiguo.

Las pruebas comienzan con fixtures y proveedores simulados. La integración posterior usa datos y destinos aislados; la disponibilidad de ese entorno debe verificarse. Cambios necesarios en portfolio-cloud conservan su ownership y se gestionan por separado.

La intercambiabilidad se limita a implementaciones de Portfolio: mantener HTTP y comportamiento para cambiar la implementación consumida por el frontend. URL/routing pueden requerir configuración. No se intercambian dominios entre aplicaciones.

## Validación y observabilidad

- Funcional: seis rutas, cuerpos/status/headers, validación, errores, FAQ/IA/fallback, historial y fechas Argentina.
- Seguridad: sourceIp y proxies reales, ausencia de rutas de bypass, cuotas concurrentes/TTL, límite de 16 KiB, IAM mínimo y secretos fuera de logs/artefactos. CORS no autentica.
- Rendimiento y costo: separar arranque local de AWS INIT/billed duration; registrar muestra, entorno, memoria, latencia, 429/5xx/timeouts, cachés, llamadas y tokens.
- Operación: distinguir fallback HTTP exitoso de disponibilidad del proveedor, acotar cancelación y reintentos, verificar alarmas y procedimiento de corte.
- Aceptación: fijar umbrales con datos; no afirmar cumplimiento ni ahorro neto con muestras insuficientes o solo escenarios hipotéticos.

## Renovación del bot inmediatamente antes de producción

Actualizar los hechos sobre experiencia, tecnologías y proyectos desde fuentes verificables; revisar FAQs, prompts y contenido curado que dependa de esos hechos. Regenerar el conocimiento editorial, publicarlo mediante su owner y empaquetar un fallback consistente.

Verificar checksum/envelope, fechas de publicación, enlaces, separación entre experiencia profesional y proyectos, consultas con historial y respuestas con R2 caído. Mantener recuperable el artifact y el paquete anteriores. Una renovación de datos no justifica cambiar contratos o proveedores silenciosamente.

## Retorno con EC2 disponible

Antes del corte, verificar contenedores originales, imagen por digest/SHA retenida, configuración privada fuera de Git, SSM, Tunnel/Traefik y mecanismo de URL/routing. El runbook debe permitir devolver tráfico sin repetir efectos en vuelo.

Volver al servidor no revierte cambios ya aplicados en el upstream compartido. La retención actual de imágenes debe revisarse para no perder el digest necesario. No prometer RTO/RPO sin ensayo.

## EC2 detenida y backup recuperable

EC2 se apaga solo después de completar las tres migraciones, estabilizar y comprobar recuperación. Se conserva la instancia; no se termina ni se desmantela su entorno. Mantener un backup recuperable del modelo EC2 para poder retomarlo.

Definir contenido, destino y retención del respaldo: volúmenes/snapshots o AMI pertinentes, imágenes por digest, Compose/Traefik, scripts, configuración privada segura y dependencias de arranque/acceso. Los secretos no se copian a este repositorio. Los datos R2 se recuperan con el procedimiento de su owner, no con un snapshot EC2.

El retorno desde una instancia detenida exige arranque y comprobación de red, volúmenes, Docker, acceso, ingress y health; no equivale al rollback inmediato durante convivencia. Los recursos y backups retenidos deben formar parte del costo total.

## Avance local de infraestructura

Se adelantó la definición local de la etapa 5: CDK elegido, stack de test con IAM y 11 assertions/synth sin lookups. No altera los requisitos de etapas 3/4 ni habilita test AWS o producción. [Recursos, paquete y prerrequisitos](infrastructure.es.md).

## Actualización de fase 4

El handler administrado usa cuotas compartidas, configuración de Secrets Manager validada antes de negocio, deadline total y cancelación de proveedores. Las descripciones de memoria local, configuración lazy/500 y timeouts parciales corresponden al traslado inicial o al adaptador de composición local. Los controles actuales y diferencias están en [endurecimiento](runtime-hardening.es.md); permisos/proxies/proveedores reales siguen pendientes de validación administrada.
