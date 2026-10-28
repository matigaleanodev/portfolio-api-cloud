# Desarrollo y pruebas

[English](development.md)

Usar Node según [.nvmrc](../.nvmrc), npm y Python 3. Las versiones de dependencias quedan en manifiesto y lock.

```bash
npm ci --ignore-scripts
npm run check
```

## Comandos

| Comando                | Alcance                                                              |
| ---------------------- | -------------------------------------------------------------------- |
| `npm run format:check` | Formato Prettier sin escritura.                                      |
| `npm run typecheck`    | Tipos estrictos de aplicación e infraestructura.                     |
| `npm test`             | Suites Vitest de aplicación, tooling e infraestructura.              |
| `npm run test:app`     | Contratos, dominio, proveedores y controles del runtime.             |
| `npm run test:tooling` | Validadores y workflows con fixtures locales.                        |
| `npm run test:infra`   | Assertions CDK y paquete de validación.                              |
| `npm run test:package` | Smoke de paquetes aislados del checkout.                             |
| `npm run check:docs`   | Documentos requeridos, pares ES/EN y enlaces locales.                |
| `npm run check`        | Formato, tipos, suites, paquetes, synth sin lookups y documentación. |

`npm run format` aplica formato. `npm run build` genera ESM en `dist/`. La entrada productiva es `dist/handler.handler`; el paquete incluye dependencias de producción y fallback editorial. `src/validation/` genera una variante separada con proveedores ficticios.

## Organización y pruebas

`src/` contiene aplicación y dominio; `infra/`, CDK; `scripts/`, build y validadores; `test/`, contratos, fixtures e infraestructura/tooling. Los casos usan ID y Dado/Cuando/Entonces en español.

Las suites de aplicación e infraestructura bloquean red, metadata AWS y proveedores reales. Los procesos de tooling reciben ambiente mínimo y respuestas sintéticas. Los fixtures históricos fijan comportamiento de referencia: las diferencias aceptadas se declaran en pruebas, sin reescribirlos para ocultarlas.

Las pruebas cubren comportamiento, concurrencia, expiración, cancelación y comandos AWS. El smoke comprueba paquetes fuera del checkout. Esto no acredita disponibilidad de proveedores, permisos efectivos ni rendimiento administrado.

La CI conserva `verify` como check agregado obligatorio. La documentación mantiene pares de idiomas y enlaces válidos, sin cantidades de casos ni resultados de ejecuciones en Markdown.

[Contratos](api.es.md) · [Entrega protegida](operations.es.md)
