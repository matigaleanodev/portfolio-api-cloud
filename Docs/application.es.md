# Base local de handlers

[English](application.md) · 24/10/2026.

## Estructura y configuración

- `src/handler.ts`: entrada Lambda `handler`; lee el ambiente una vez por inicialización.
- `src/config.ts`: recibe un mapa explícito, normaliza y congela CORS; no lee archivos ni credenciales.
- `src/application.ts`: composición agrupada, routing por rawPath, CORS y respuestas HTTP API v2.
- `src/health.ts`: estado del proceso, sin llamadas ni inicialización de proveedores.

Health no comprueba disponibilidad de Resend, R2, IA o upstream. No se agregan interfaces vacías para esos proveedores: la composición y configuración necesarias llegarán con cada sección real. Las otras cinco rutas devuelven 404; un preflight CORS general no registra rutas de negocio.

CORS conserva lista, deshabilitado por ausencia y wildcard que refleja origen. Un origen no listado no recibe Allow-Origin; no es autenticación. OPTIONS habilitado devuelve 204 antes de los headers de seguridad, igual que el orden del bootstrap original. La futura infraestructura deberá evitar otra configuración CORS que duplique esta capa.

## Toolchain y paquete

Node objetivo **24.22.1 LTS**, Linux x64 / WSL2. Es la LTS más reciente al 24/10/2026; Node 26 sigue en Current. La [publicación del 21/10](https://nodejs.org/en/blog/release/v24.22.1) incluye correcciones de seguridad. .nvmrc, engines y todos los jobs Node apuntan a 24.22.1. Se ejecutó mediante un paquete npm aislado, sin cambiar el Node global de WSL. El experimento histórico conserva su medición con 24.19.0.

TypeScript 6.0.3, @types/node 24.19.2 y @types/aws-lambda 8.10.164 son dependencias de desarrollo fijadas. TypeScript 6 usa el compilador JS y evita los paquetes binarios por plataforma de 7.0.2. Tipos Node 24 mantienen la API objetivo. El lock nuevo incluye además undici-types 7.24.6 como dependencia de tipos; no es un cliente HTTP de runtime. No se arrastró el lock experimental.

Build con tsc a ESM/ES2023, sin bundler ni dependencias de runtime. `dist/` y `package.json` forman la base del paquete; los imports de tipos AWS se eliminan. No hay ZIP de despliegue ni template de infraestructura. `typecheck` incluye fuentes y tests con strict, exactOptionalPropertyTypes y noUncheckedIndexedAccess; no usa skipLibCheck.

## Comprobaciones locales

```bash
npm ci --ignore-scripts
npm run check
python3 -m unittest discover -s scripts -p 'test_*.py'
python3 scripts/ci_scope.py
actionlint
npm audit
```

28 tests de aplicación, 5 de detección CI y 7 de validación del workflow de merge aprobados. Tipos, build, smoke ESM fuera del checkout, pares/enlaces documentales y actionlint aprobados. Suite actual aprobada en Node 24.22.1 LTS. La review corrigió CORS_ORIGIN con comas/espacios sin orígenes: deshabilita CORS como el origen, con regresión específica. npm audit del nuevo lock: **0 vulnerabilidades reportadas**, incluyendo desarrollo; no garantiza ausencia de problemas futuros.

El runner elimina el ambiente heredado antes de ejecutar specs y carga el cerco de red antes de importar aplicación. Bloquea fetch/WebSocket, HTTP(S), sockets/TLS/UDP, DNS y procesos hijos; el propio cerco tiene prueba de regresión. Es protección contra llamadas accidentales, no un sandbox frente a código hostil. No hay SDKs ni proveedores reales instalados. Futuros tests de negocio deberán inyectar mocks explícitos.

El smoke copia dist y manifiesto fuera del checkout, sin node_modules, crea un .env sintético y verifica que health responde sin tomarlo. Los scripts requieren solo archivos públicos y dependencias del lock. Se reprodujo npm ci y la validación en un árbol temporal sin .git, privados, node_modules ni dist previos, en Node 24.22.1; actionlint recibió rutas explícitas de workflows. No se midieron tiempos de arranque ni se extrapoló costo.

## Cobertura contractual parcial

| Cubierto             | Evidencia                                                                         |
| -------------------- | --------------------------------------------------------------------------------- |
| GET /api/health      | 200, JSON exacto, headers funcionales, sin cuota ni proveedores                   |
| Transporte de health | rawPath independiente de stage/query, barra final/mayúsculas, HEAD sin body       |
| CORS                 | origen listado/no listado/wildcard, preflight y headers en error 404              |
| Body básico          | límite 16 KiB, UTF-8/base64, urlencoded y rechazo 400 de JSON inválido/primitivo  |
| Rutas pendientes     | 404 explícito, sin éxitos simulados                                               |
| Aislamiento          | configuraciones independientes, sin credenciales, ambiente limpio y red bloqueada |

Los textos exactos de errores de parsing originales, compresión/content-encoding, charsets, validación DTO y parsing urlencoded anidado todavía no tienen paridad demostrada. El 400 actual usa un mensaje controlado; no se presenta como equivalencia diferencial del original. Tampoco se cubren cuotas distribuidas, timers Throttler, cinco contratos de negocio, proveedores, fallback/editorial, IAM o transporte AWS real. La salud sin configuración de negocio es deliberada para esta sección; la validación de startup completa llegará al componer esas rutas.

## Procedencia y propiedad

Referencia: [portfolio-api](https://github.com/matigaleanodev/portfolio-api/tree/a0ef80fa9f82d1cea5a31425a63ab0a344338c56), commit `a0ef80fa9f82d1cea5a31425a63ab0a344338c56`. Solo se leyeron blobs fijados; no se recuperó el prototipo ni se modificó el origen.

| Blob consultado              | SHA-256                                                          | Uso                                                |
| ---------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| src/app.controller.ts        | 4c590447c3a5451e12ee62392ed42f3858fb9d551a330032f99d36448ff8c59a | contrato health; función sin decoradores           |
| src/main.ts                  | c8aff3128c62d1c6c4925d34d494aac053748f10d68e7d8b0cb41c04424ca1f7 | rutas, límite, CORS y headers; adaptación a evento |
| src/config/runtime.config.ts | 366b7c532275fda3aaee639db60884999e3a0ee8f268b4a983124f6f6f672890 | semántica CORS; configuración explícita mínima     |
| package.json                 | 38599e23e6b9910f24f157ae19a55c30dcbf5e9e3d179d9dcdb4ab2f275e3961 | licencia y comparación de dependencias             |

Ambos repos son mantenidos por matigaleanodev. El origen declara UNLICENSED y no tiene LICENSE/ LICENSE.md en ese SHA; este manifiesto conserva UNLICENSED. Repositorio público no implica concesión de licencia a terceros. TypeScript declara Apache-2.0; los paquetes de tipos declaran MIT. No se copia toda la API ni contenido profesional/editorial.

La siguiente etapa es reutilizar progresivamente lógica/DTOs desde ese SHA con procedencia por archivo, empezando por una sección de negocio con proveedores simulados. La renovación del bot sigue reservada para inmediatamente antes de producción.
