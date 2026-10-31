# Desarrollo y pruebas

[English](development.md)

Requiere Node según [.nvmrc](../.nvmrc), npm y Python 3. Las versiones de dependencias pertenecen a los manifiestos y al lock raíz.

```bash
npm ci --ignore-scripts
npm run check
```

## Comandos

Desde la raíz:

| Comando                  | Alcance                                                                        |
| ------------------------ | ------------------------------------------------------------------------------ |
| `npm run format:check`   | Formato Prettier sin escribir; `npm run format` lo aplica.                     |
| `npm run typecheck`      | Tipos estrictos de cada workspace, tests e infraestructura.                    |
| `npm run build`          | Compila contratos y runtime y arma los artifacts en `.tmp/lambda-*`.           |
| `npm test`               | Suites Vitest de aplicación, editorial, tooling e infraestructura.             |
| `npm run test:app`       | Contratos HTTP, dominio, proveedores, cadena Middy y controles de runtime.     |
| `npm run test:editorial` | Funciones editoriales, estado de publicación, OG y store de suscriptores.      |
| `npm run test:tooling`   | Validadores y workflows con fixtures locales.                                  |
| `npm run test:infra`     | Aserciones CDK y variante de validación.                                       |
| `npm run test:package`   | Artifacts empaquetados y verificados fuera del checkout.                       |
| `npm run boundaries`     | Límites de imports, dependencias y versiones entre paquetes.                   |
| `npm run synth:local`    | Síntesis CDK con credenciales ficticias y sin lookups.                         |
| `npm run check:docs`     | Documentos requeridos, pares ES/EN y enlaces locales.                          |
| `npm run check`          | Boundaries, formato, tipos, suites, artifacts, síntesis local y documentación. |

Cada workspace expone sus scripts con `npm --workspace`: por ejemplo `npm run typecheck --workspace=@portfolio-api-cloud/runtime` o `npm run synth --workspace=@portfolio-api-cloud/infrastructure` (síntesis sin lookups que sí usa el entorno AWS heredado; `synth:local` lo descarta).

## Organización

- `packages/contracts`: datos neutrales compartidos por runtime, infraestructura y tests. Exporta TypeScript por subpaths explícitos (`/routes`, `/functions`, `/configuration`...).
- `packages/runtime/src`: `http/` (scope, cadena Middy, router, composición por función), `handlers/` (un entrypoint por función), `chat/`, `subscriptions/`, `editorial/`, `validation/` y módulos compartidos de configuración, ingress y control.
- `packages/runtime/dev`: utilidades manuales fuera del build y de los tests (render OG, invocaciones editoriales, migración de suscriptores). Se compilan con `npx tsc -p packages/runtime/dev` y sin `--execute` solo muestran lo que harían.
- `packages/infrastructure`: stack CDK y plantillas revisadas.
- `scripts/`: build, empaquetado, validadores y herramientas de entrega; `test/`: suites, fixtures y soporte.

Los casos usan IDs en español y redacción Dado/Cuando/Entonces.

## Artifacts

`npm run build` genera seis directorios: `api`, `chat`, `editorial`, `og`, `validation-api` y `validation-chat`. Cada uno recibe solo los archivos compilados alcanzables desde sus entrypoints y las dependencias de producción permitidas en [package.mjs](../scripts/package.mjs); un import fuera de la lista corta el build. `api` y `chat` incluyen el fallback editorial, `og` incluye las fuentes y el binario nativo linux-x64 de resvg, y las variantes de validación solo existen para la síntesis con proveedores ficticios.

`npm run test:package` arma ZIP deterministas, los extrae fuera del checkout con rutas verificadas y ejecuta cada entrypoint con red bloqueada y SDK simulados. Comprueba contenido, dependencias y que el render OG coincida con la referencia del runtime compilado.

## Pruebas

Las suites de aplicación, editorial e infraestructura bloquean la red, los metadatos de AWS y los proveedores reales. Los subprocesos de tooling reciben un entorno mínimo y respuestas sintéticas. Los fixtures de referencia fijan el comportamiento heredado: las diferencias aceptadas se declaran en tests sin reescribir fixtures para ocultarlas.

Los tests cubren comportamiento, concurrencia, expiración, cancelación y comandos AWS. No establecen disponibilidad de proveedores, permisos efectivos ni rendimiento administrado.

`npm run synth:local` reemplaza las variables `AWS_*` y `CDK_*` heredadas por credenciales ficticias, sintetiza sin consultar la cuenta y revisa el template (seis funciones y ausencia de permisos amplios). CI conserva `verify` como check requerido agregado.

[Contratos](api.es.md) · [Entrega protegida](operations.es.md)
