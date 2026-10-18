# Migración reversible y criterios de aceptación

[English](migration.md) · 24/10/2026. Etapas propuestas; solo preparación documental/workflows y protección GitHub autorizadas.

## Etapas

| Etapa | Incremento | Aceptación y límite |
| --- | --- | --- |
| 0. Preparación actual | repo público vacío, auditoría, docs bilingües y workflows locales | validar enlaces/YAML y preservar originales; sin commit/push ni AWS mutaciones |
| 1. Reutilización local | copiar únicamente runtime/tests/config de build necesarios desde un SHA aprobado de portfolio-api | registrar SHA, lista de archivos y hashes; no copiar .git/.env/node_modules/dist ni generated de origen; revisar licencia UNLICENSED y ownership del código propio |
| 2. Compatibilidad offline | comparar composición de handlers y bootstrap Nest/adaptador Express 5 con eventos HTTP API v2 y dependencias simuladas | seis contratos completos, 201 chat/204 contacto/body DELETE, 400/413/429/500/502/503; ningún tráfico a proveedores |
| 3. Endurecimiento | límites distribuidos, IP confiable, timeouts reales, fallback empaquetado, logs acotados | concurrencia, spoof headers, TTL, cancelación, corrupción/fallo R2, cold start; comparar native Web Functions si cambia la elección |
| 4. Infraestructura revisable | CDK test sin lookups; assertions de IAM/red/retención/rutas; diseñar roles/bootstrap | synth offline; ningún prod ARN/import/recurso ni wildcard admin. Revisar permisos ejecución/publicación/runtime y boundaries; bootstrap por autorización separada |
| 5. Test administrado | endpoint independiente y recursos/config test; activar workflow plan solo tras aprobación | OIDC restringido a repo/ref/environment, cuenta/región verificadas; revisar changeset exacto; ejecución de test requiere autorización posterior, no existe en el workflow actual |
| 6. Validación aislada | frontend de prueba con URL test, dobles de Resend/OpenAI/upstream inicialmente | e2e navegador y contratos, CORS/headers, bytes multibyte, errores y métricas; emails y llamadas pagas solo con destinatario/datos/presupuesto explícitos |
| 7. Preparar corte | decidir dominio/frontera Cloudflare, URL y fallback; capturar estado original sin secretos | runbook específico, TTL/caché, certificado, artifact e imagen fijados, rollback ensayado; aprobación explícita antes de producción |
| 8. Corte autorizado | un solo camino de escritura por request, sin shadow/replay de POST | monitoreo y reversión según umbrales; EC2 sigue disponible; no apagar otras apps |
| 9. Estabilización | observar 2–4 semanas propuestas y casos reales relevantes | sin regresiones, costos observados y rollback vigente; plazo/umbrales acordados con usuario. Retiro EC2 recién después de Foodly Notes y Modo Playa |

## Primer incremento de implementación propuesto, NO ejecutado

Fijar el SHA de código fuente que apruebe el usuario y crear una rama `feat/lambda-compatibility` en este repo. Copiar runtime y pruebas con un manifiesto de procedencia (repo, commit, ruta, hash), conservando atribución e historial consultable en origen. No hace falta importar toda la historia Git para trazabilidad. No tomar un branch local antiguo como producción confirmada.

Comparar primero la candidata Nest con la candidata de handlers livianos según [el protocolo](runtime-evaluation.es.md), reutilizando lógica y contratos. Probar bootstrap/composición y eventos v2 para health/starters/contacto/chat/suscripciones con fetch, Resend y R2 simulados. Aplicar la configuración real de pipes/body limits/CORS en tests para no validar una app distinta de main. Agregar pruebas específicas de adapter para 201/204/DELETE/base64/rawPath y límites multibyte. No agregar infraestructura todavía. No presentar arranques locales como cold starts medidos en AWS. Done: paquete reproducible local, contratos preservados, cero emails/modelos/escrituras remotas y lista concreta de incompatibilidades. Eso no prueba IAM ni cold start AWS.

## Datos, efectos y convivencia

La API no tiene esquema propio que migrar. El estado de suscriptores y releases permanece en portfolio-cloud/R2; no crear otro bucket productivo ni mover ese ownership. Si ambas APIs apuntan al mismo upstream, observan el mismo estado y pueden modificarlo; cada request debe dirigirse a una sola API y no copiarse como shadow traffic.

Test inicial: artifact editorial fixture versionado y upstream/provider dobles. Para integración real posterior, usar stage cloud aislado existente y autorizado, bucket/prefix privado de prueba y correo controlado; hoy no se verificó que tal stage exista. Si crearlo exige modificar portfolio-cloud, es un incremento separado con su owner. Hasta entonces no usar suscripciones prod para probar.

No duplicar cron diario, process-release, notify-post ni publicación de knowledge. No retry automático de contacto tras timeout ambiguo. Head+Put del upstream no prueba atomicidad bajo carrera; definir pruebas y una eventual corrección en cloud por separado. Cualquier evolución posterior de esquema/objeto debe ser aditiva, legible por API vieja y con ventana de compatibilidad; sin borrados o renombres incompatibles durante convivencia.

## Matriz de validación

- Funcional: todas las rutas, cuerpos, status, headers, validación/errores y fuentes FAQ/IA/fallback; perfil con R2 caído, fechas Argentina y proyectos/historial.
- Seguridad: requestContext/IP y bypass directo, CORS real, cuotas concurrentes por ruta, tamaño 16 KiB, upstream público, IAM mínimo y secretos fuera de artifacts/logs. CORS no es autenticación.
- Rendimiento: baseline agregado existente y test frío/caliente, p50/p95/p99, INIT/billed duration, memoria, 429/5xx/timeouts, R2/cache_hit y tokens. Muestreo acotado con proveedor mock; llamadas reales requieren presupuesto.
- Umbrales propuestos para acordar: cero pérdida/duplicación de efectos, cero regresiones de contrato; p95 caliente rápido ≤1 s y frío ≤2,5 s en rutas sin proveedor; chat p95 ≤8 s y deadline 25 s; comparar también contra baseline existente. Si no hay muestra suficiente, no afirmar cumplimiento.
- Costo: consumo por componente/ambiente y proyección 30 días, ratios de IA/fallback y alertas verificadas. Costo de test no es costo productivo.
- Operación: distinguir fallo proveedor con fallback HTTP exitoso de respuesta IA real; no usar solo 5xx como señal. Reintentos Lambda/SDK y cliente deben estar explícitos.

## Rollback con EC2 disponible

Antes del corte, comprobar salud del contenedor original, imagen por digest/SHA retenida, config privada válida fuera de Git, acceso SSM y rutas/tunnel originales. Mantener EC2 lista, no solo encendida. Documentar cómo volver el mismo dominio a Tunnel/Traefik o restaurar el frontend con la URL anterior, según el mecanismo elegido; certificado y cachés forman parte del ensayo.

Ante error/latencia/costo fuera del umbral acordado, o duplicación de efectos, detener el avance y devolver tráfico a la API anterior con autorización operativa acordada para ese corte. No reenviar contacto/suscripciones en vuelo: un timeout puede haber aplicado el efecto. Verificar lecturas y observabilidad; escrituras de smoke solo con autorización/datos controlados. Las dos APIs comparten cloud owner, por lo que volver al servidor no revierte suscripciones ya modificadas.

## Recuperación después de detener EC2

No es rollback inmediato. Puede exigir quitar stop protection con autorización, arrancar EC2, comprobar volumen/Docker/red/SSM/Tunnel/Traefik, recuperar config privada, pulls desde GHCR y health. Un recurso terminado o volumen perdido exige reconstrucción/restore y tarda más. No prometer RTO/RPO sin ensayo.

Conservar y probar: EBS/snapshot o AMI pertinentes, Compose/Traefik/deploy scripts y versiones cloudflared, imagen original por digest con retención protegida, dependencias GHCR, config/credenciales en respaldo privado seguro, grants/roles/acceso, rutas/domain/certificados y artefactos knowledge. No copiar secretos a este repo. El cleanup actual de tres tags puede borrar la imagen necesaria; resolver retención antes de apagar. Los datos R2 se recuperan mediante el procedimiento de su owner y su backup, no con snapshot EC2.

## Decisiones que requieren al usuario

Aprobar CDK y candidata de ejecución; prioridad de cold latency vs costo; límite diario IA/presupuesto y umbrales; política de knowledge stale; integración de test con efectos controlados; revisión IAM/bootstrap; publicación de estos archivos; cada despliegue y el corte productivo. Foodly Notes/Modo Playa y retiro EC2 requieren planificación posterior. No hace falta decidir nada de esto para completar la preparación actual.
