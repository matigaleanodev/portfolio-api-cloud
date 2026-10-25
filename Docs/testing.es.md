# Casos de prueba

[English](testing.md) · 25/10/2026.

**Estado vigente de fase 4:** [controles del runtime](runtime-hardening.es.md), implementados y probados localmente: cuota compartida, presupuesto GLOBAL de IA, sesión/origen, cancelación, fallback versionado, configuración y observabilidad. Las referencias al traslado inicial conservan su evidencia histórica; no implican validación AWS.

Vitest **5.0.5** ejecuta toda la suite: **558 casos**, distribuidos en 513 de aplicación, 27 de tooling y 18 de infraestructura. Se migraron inicialmente 155 casos de node:test y los 12 de unittest; no se mantiene un segundo runner para esas suites. Los scripts productivos de CI siguen en Python y sus validaciones se ejercitan desde Vitest con fixtures locales. El smoke del paquete sigue siendo un verificador ejecutable con Node sin dependencias de desarrollo.

Los títulos usan español y **Dado/Cuando/Entonces**. Expresan una condición, la acción y un resultado verificable. Los nombres de campos y contratos HTTP conservan sus identificadores técnicos. Los fixtures históricos no se reescriben: el título explica el escenario y las aserciones conservan sus valores originales.

## Ejecución

```bash
npm ci --ignore-scripts
npm test
```

Los comandos `npm run test:app`, `npm run test:tooling` y `npm run test:infra` ejecutan cada ámbito por separado. `npm run check` agrega tipos, paquete, synth sin lookups y documentación. Los resultados se muestran en la consola de Vitest.

| Familia                   | Casos | Cobertura                                                                             |
| ------------------------- | ----: | ------------------------------------------------------------------------------------- |
| Health y HTTP             |    18 | health, rutas, CORS y límites de cuerpos                                              |
| Validación de contacto    |    69 | tipos, campos requeridos, bordes, Unicode, extras y campo trampa                      |
| Interpretación de cuerpos |    36 | MIME, charset, formularios, base64, compresión y errores                              |
| Contacto y proveedor      |    18 | envío simulado, concurrencia, configuración, proveedor y errores                      |
| Cuotas                    |     5 | ventana, bloqueo, vencimiento lógico y aislamiento de IP                              |
| Aislamiento               |     5 | ambiente, composición y cerco de red                                                  |
| Suscripciones             |    82 | alta/baja: DTO, upstream, timeout, transporte, cuotas y composición                   |
| Tooling                   |    27 | detección de alcance y validaciones del workflow con respuestas ficticias             |
| Endurecimiento            |    57 | concurrencia, presupuesto global, sesiones, startup, cancelación y fallback           |
| Infraestructura           |    18 | recursos, IAM, payload v2, límites, logs, roles y asset                               |
| Chat                      |   223 | DTO, FAQ, contexto/historial, publicación, IA, R2/local, cachés, cuotas y composición |

## Aislamiento y límites

Antes de ejecutar Vitest se elimina el ambiente heredado y se deshabilitan metadata AWS y lectura de `.env`. Los proyectos application e infrastructure cargan el cerco de red antes de sus imports y bloquean proveedores, sockets, DNS y procesos hijos. Los tests de tooling necesitan procesos Python locales para ejecutar las validaciones reales; usan un ambiente mínimo y respuestas GitHub sintéticas, sin ejecutar gh ni workflows. TypeScript compila antes de entrar al cerco para conservar el comportamiento de los decoradores del build real.

Los casos de infraestructura inspeccionan CloudFormation y assets; no emulan AWS. Quedan pendientes firma SigV4, permisos/boundaries efectivos, bootstrap, integración HTTP API/Lambda, errores de plataforma, secretos/proveedores aislados, cuota distribuida, deadline/cancelación y recuperación. [Stack y requisitos](infrastructure.es.md). Los seis contratos están implementados localmente. [Chat, referencias y diferencias](chat.es.md).

Suscripciones suma **82 casos**: 36 referencias DTO/controlador, 28 referencias upstream y 18 pruebas adicionales; cada referencia ejercita POST y DELETE. Se comprueba timeout real de 8 s, errores exactos, cuota independiente y concurrente, formatos/límite, composición Lambda y ausencia de efectos reales. Dos expectativas anteriores de 404 se reemplazan por los contratos reales; health y contacto conservan su cobertura. [Procedencia y diferencias](subscriptions.es.md).

Chat agrega 223 pruebas: 59 referencias DTO, 18 de dominio/efectos, cinco hashes de contenido, 74 escenarios originales adaptados, 20 proveedor/métricas, 33 repositorio/configuración/SDK y 14 HTTP/cuotas/composición. Se reemplazan dos expectativas previas de 404; una aserción de contacto espera ahora 400 de chat sin message. Total de aplicación: 513.

## Actualización de fase 4

El handler administrado usa cuotas compartidas, configuración de Secrets Manager validada antes de negocio, deadline total y cancelación de proveedores. Las descripciones de memoria local, configuración lazy/500 y timeouts parciales corresponden al traslado inicial o al adaptador de composición local. Los controles actuales y diferencias están en [endurecimiento](runtime-hardening.es.md); permisos/proxies/proveedores reales siguen pendientes de validación administrada.

La ampliación de etapa 5/6 agrega 19 pruebas: trece del bundle, dos del workflow de preparación y cuatro assertions de infraestructura. [Diseño y criterios posteriores](deployment-design.es.md).
