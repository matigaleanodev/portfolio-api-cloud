# Casos de prueba

[English](testing.md) · 24/10/2026.

Vitest **5.0.5** ejecuta toda la suite: **178 casos**, distribuidos en 155 de aplicación, 12 de tooling y 11 de infraestructura. Se migraron los 155 casos de node:test y los 12 de unittest; no se mantiene un segundo runner para esas suites. Los scripts productivos de CI siguen en Python y sus validaciones se ejercitan desde Vitest con fixtures locales. El smoke del paquete sigue siendo un verificador ejecutable con Node sin dependencias de desarrollo.

Los títulos usan español y **Dado/Cuando/Entonces**. Expresan una condición, la acción y un resultado verificable. Los nombres de campos y contratos HTTP conservan sus identificadores técnicos. Los fixtures históricos no se reescriben: el título explica el escenario y las aserciones conservan sus valores originales.

## Ejecución

```bash
npm ci --ignore-scripts
npm test
```

Los comandos `npm run test:app`, `npm run test:tooling` y `npm run test:infra` ejecutan cada ámbito por separado. `npm run check` agrega tipos, paquete, synth sin lookups y documentación. Los resultados se muestran en la consola de Vitest.

| Familia                   | Casos | Cobertura                                                                 |
| ------------------------- | ----: | ------------------------------------------------------------------------- |
| Health y HTTP             |    22 | health, rutas, CORS y límites de cuerpos                                  |
| Validación de contacto    |    69 | tipos, campos requeridos, bordes, Unicode, extras y campo trampa          |
| Interpretación de cuerpos |    36 | MIME, charset, formularios, base64, compresión y errores                  |
| Contacto y proveedor      |    18 | envío simulado, concurrencia, configuración, proveedor y errores          |
| Cuotas                    |     5 | ventana, bloqueo, vencimiento lógico y aislamiento de IP                  |
| Aislamiento               |     5 | ambiente, composición y cerco de red                                      |
| Tooling                   |    12 | detección de alcance y validaciones del workflow con respuestas ficticias |
| Infraestructura           |    11 | recursos, IAM, payload v2, límites, logs, roles y asset                   |

## Aislamiento y límites

Antes de ejecutar Vitest se elimina el ambiente heredado y se deshabilitan metadata AWS y lectura de `.env`. Los proyectos application e infrastructure cargan el cerco de red antes de sus imports y bloquean proveedores, sockets, DNS y procesos hijos. Los tests de tooling necesitan procesos Python locales para ejecutar las validaciones reales; usan un ambiente mínimo y respuestas GitHub sintéticas, sin ejecutar gh ni workflows. TypeScript compila antes de entrar al cerco para conservar el comportamiento de los decoradores del build real.

Los casos de infraestructura inspeccionan CloudFormation y assets; no emulan AWS. Quedan pendientes firma SigV4, permisos/boundaries efectivos, bootstrap, integración HTTP API/Lambda, errores de plataforma, secretos/proveedores aislados, cuota distribuida, deadline/cancelación y recuperación. [Stack y requisitos](infrastructure.es.md). Las pruebas no validan las cuatro rutas todavía sin implementar.
