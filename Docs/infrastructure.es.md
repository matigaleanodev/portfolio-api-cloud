# Stack de test en código

[English](infrastructure.md) · 24/10/2026.

AWS CDK v2 queda elegido para este repositorio. Dependencias locales de desarrollo fijadas: CLI **2.1146.1**, aws-cdk-lib **2.274.0**, constructs **10.8.1**. No se requiere instalación global. [Código](../infra/stack.ts), [entrada](../infra/app.ts) y [pruebas](../test/infra/stack.test.ts).

## Recursos definidos

Stack `PortfolioApiCloudTest`, nombre físico `portfolio-api-cloud-test`, cuenta personal `650387442642`, región `us-east-1`; se rechaza un contexto stage diferente de test.

- Una Lambda Event Function Node.js 24, ARM64, 512 MiB, 28 segundos y concurrencia reservada 5, fuera de VPC. Handler `dist/handler.handler`.
- HTTP API v2 con integración AWS_PROXY, payload 2.0 y timeout de 29 segundos; stage `$default` para no introducir un prefijo en rawPath. Rate global 2/s, burst 5, sujeto a validación real.
- `$default` exige firma IAM (SigV4) y delega las rutas al handler para conservar mayúsculas y errores. Solo `OPTIONS /{proxy+}` permite acceso anónimo para preflight. CORS sigue en la aplicación; gateway no lo duplica. No hay Function URL paralela.
- Log group propio, retención de 14 días y conservación al borrar/reemplazar la stack. El rol runtime solo permite escribir streams/eventos de ese grupo y exige una permissions boundary externa.
- `NODE_ENV=production` evita logs detallados del SDK Resend. El parámetro no secreto `CorsOrigin` queda vacío por defecto.

IAM es aislamiento de esta API de test; todavía no es el contrato público del frontend. Health también requiere firma. No se habilita negocio público mientras falten cuota compartida y deadline/cancelación. Los límites de gateway/concurrencia no reemplazan cuota por IP ni son un tope monetario.

La stack no introduce DB, NAT, VPC, dominio, frontend, alarmas ni proveedores nuevos. Health funciona; contacto no dispone de secretos en AWS y devuelve 500 controlado si se intenta enviar sin configuración. La recuperación segura de secretos y permisos correspondientes permanece pendiente; no se ingresan claves en parámetros, contextos, templates ni outputs. Las otras cuatro rutas siguen en 404.

## Paquete y síntesis local

```bash
npm ci --ignore-scripts
npm run test:infra
npm run cdk -- synth --no-lookups --context stage=test
```

`prepare-infra.mjs` compila y prepara `.tmp/lambda` con dist, package.json, LICENSE y dependencias de producción del lock. Es la misma función de empaquetado que verifica `test:package`. Excluye fuentes, tests, `.env`, archivos privados y herramientas CDK/Vitest. Conserva las licencias incluidas en cada dependencia. CDK registra un asset ZIP; `cdk.out` contiene template, manifest y copia local del asset. No se publica S3 ni se crea un change set con synth.

El typecheck de aplicación conserva `exactOptionalPropertyTypes`; `tsconfig.infra.json` lo desactiva solo para infraestructura y sus tests porque las declaraciones CDK de esta versión no son compatibles con esa opción. Ambos conservan strict, noUncheckedIndexedAccess y verificación de declaraciones, sin skipLibCheck.

## Requisitos antes de preparar AWS

El synthesizer usa qualifier `papiatest`, bucket esperado `cdk-papiatest-assets-650387442642-us-east-1` y parámetro de versión `/cdk-bootstrap/papiatest/version`. Esos recursos y roles se referencian; esta entrega no comprueba ni crea su existencia.

| Responsabilidad           | Rol esperado                                             |
| ------------------------- | -------------------------------------------------------- |
| Entrada GitHub OIDC       | PortfolioApiCloudTestGitHubDeployRole                    |
| Operaciones de deploy CDK | PortfolioApiCloudTestCdkDeployRole                       |
| Ejecución CloudFormation  | PortfolioApiCloudTestCloudFormationExecutionRole         |
| Publicación de archivos   | PortfolioApiCloudTestFilePublishingRole                  |
| Ejecución Lambda          | PortfolioApiCloudTestRuntimeRole (definido por la stack) |

La boundary obligatoria es `arn:aws:iam::650387442642:policy/PortfolioApiCloudTestRuntimeBoundary`, recibida en `RuntimePermissionsBoundaryArn` sin default. Revisar su contenido y permisos/trust/PassRole/bootstrap antes de cualquier ejecución. No usar el bootstrap por defecto con AdministratorAccess. No se necesita rol de publicación Docker para este asset.

El workflow de preparación permanece manual, con environment y activación explícita. El comando proporciona el ARN de boundary esperado; antes de habilitarlo se debe revisar/provisionar esa política, el bootstrap y los roles; no se ejecutó. [CI/CD](ci-cd.es.md). La síntesis y 11 assertions no demuestran permisos efectivos, ausencia de drift ni funcionamiento del servicio desplegado.
