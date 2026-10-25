# Portfolio API Cloud

[English](README.md)

Implementación alternativa de la API pública de Portfolio con handlers TypeScript. La migración a serverless está decidida; la API NestJS original se conserva como implementación independiente.

## Estado actual

Aplicación local con composición explícita y entrada HTTP API v2: `GET /api/health` → 200 `{"status":"ok"}` y `POST /api/contact` → 204 vacío, con validación, honeypot, proveedor simulado en pruebas y cuota local 5/h/IP. Las otras cuatro rutas siguen pendientes y devuelven 404. La cobertura contractual es parcial. La stack CDK de test está definida y sintetizada localmente; no se desplegó.

El prototipo comparativo fue descartado. Sus [resultados](Docs/local-runtime.es.md) se conservan como evidencia histórica y no son mediciones de esta base, cold starts AWS ni prueba de ahorro mensual.

## Desarrollo local

Ubuntu-26.04 en WSL. Objetivo Node **24.22.1 LTS** (`.nvmrc`), la LTS más reciente al 24/10/2026. Versión comprobada mediante ejecución aislada, sin instalaciones globales.

```bash
npm ci --ignore-scripts
npm run check
```

`check` verifica el formato y ejecuta tipos estrictos, build ESM, tests sin red, smoke fuera del checkout y validación documental. Los comandos de verificación no corrigen fuentes. El paquete usa `dist/handler.js`, export `handler`, y requiere el `package.json` con `type: module`. Requiere `node_modules` de producción según el lock y `LICENSE`. No carga `.env`; únicamente la entrada Lambda lee el ambiente para CORS y contacto (`RESEND_API_KEY`, `CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL`). Health sigue disponible sin esas claves. [Contrato, procedencia y límites](Docs/contact.es.md).

[Stack de test y requisitos](Docs/infrastructure.es.md) · [Casos de prueba en español](Docs/testing.es.md). Vitest ejecuta 178 casos (155 aplicación, 12 tooling, 11 infraestructura).

Formato estándar con Prettier **3.9.10**, sin personalizar sus valores predeterminados (`.prettierrc.json`). `npm run format` aplica el formato; `npm run format:check` lo verifica sin modificar archivos y es obligatorio en CI. Usa 2 espacios, comillas dobles, punto y coma y ancho orientativo de 80 columnas. Se respetan `.gitignore` y `.prettierignore`; el lock y el fixture histórico con hash fijado quedan fuera.

## Alcance

- Seis contratos previstos: health, contacto, starters, chat y alta/baja de suscripciones.
- portfolio conserva frontend, contenido editorial estático y hosting.
- portfolio-cloud conserva suscriptores, notificaciones, OG, releases y publicación de knowledge.
- La sustitución de implementación conserva HTTP y comportamiento; URL/routing pueden requerir configuración.
- La compatibilidad completa todavía requiere migrar las cuatro rutas de negocio restantes y sus escenarios.

## Documentación

1. [Base implementada, pruebas y procedencia](Docs/application.es.md)
2. [Auditoría y contratos](Docs/audit.es.md)
3. [Arquitectura](Docs/architecture.es.md)
4. [Costos hipotéticos y servicios auxiliares](Docs/costs.es.md)
5. [Migración y recuperación](Docs/migration.es.md)
6. [Decisiones](Docs/decisions.es.md)
7. [CI/CD](Docs/ci-cd.es.md)
8. [Comparación de runtime](Docs/runtime-evaluation.es.md)
9. [Resultados históricos](Docs/local-runtime.es.md)
10. [Evidencia del experimento](Docs/runtime-evidence.es.md)
11. [Protección de ramas](Docs/branch-protection.es.md)
12. [Fuentes](Docs/sources.es.md)

## Transición

Las tres APIs actuales permanecen operativas durante toda la migración. Después de migrar y estabilizar las tres y validar recuperación, EC2 se apagará conservando instancia y backup recuperable. Sus recursos retenidos forman parte del costo total.

La renovación de perfil/proyectos del bot sigue siendo el último paso previo al despliegue productivo. Las ramas main/dev requieren PR, CI y merge por workflow. La [integración atribuida a matigaleanodev](Docs/integration.es.md) utiliza una credencial de usuario y mantiene PR/CI obligatorios. CDK TypeScript queda elegido; roles/bootstrap y conmutación de tráfico permanecen abiertos.

## Licencia

[MIT](LICENSE). LICENSE contiene la licencia de la implementación propia y la autoría de Matias Galeano; no se mantiene un archivo de atribuciones de terceros. Las dependencias mantienen sus licencias dentro de sus paquetes.
