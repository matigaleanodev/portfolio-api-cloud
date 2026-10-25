# Portfolio API Cloud

[English](README.md)

**Incremento vigente:** [primera instalación con dobles y circuito Actions](Docs/managed-validation.es.md), implementados localmente. main/v0.1.0 ya existen; provisioning, ejecución y validación administrada siguen pendientes.

**Estado vigente de fase 4:** [controles del runtime](Docs/runtime-hardening.es.md), implementados y probados localmente: cuota compartida, presupuesto GLOBAL de IA, sesión/origen, cancelación, fallback versionado, configuración y observabilidad. Las referencias al traslado inicial conservan su evidencia histórica; no implican validación AWS.

Implementación alternativa de la API pública de Portfolio con handlers TypeScript. La migración a serverless está decidida; la API NestJS original se conserva como implementación independiente.

## Estado actual

Aplicación local con composición explícita y entrada HTTP API v2: `GET /api/health` → 200 `{"status":"ok"}` y `POST /api/contact` → 204 vacío, con validación, honeypot, proveedor simulado en pruebas y cuota compartida 5/h/IP en el handler administrado. POST y DELETE /api/subscriptions devuelven 200 con normalización del email, proveedor HTTP y cuotas compartidas independientes de 10/h/IP. GET /api/chat/starters devuelve 200 y POST /api/chat devuelve 201 con FAQ/IA/fallback, historial y cuotas independientes de 20/min/IP. Los seis contratos tienen cobertura local; la integración administrada permanece pendiente. La stack CDK de test está definida y sintetizada localmente; no se desplegó.

El prototipo comparativo fue descartado. Sus [resultados](Docs/local-runtime.es.md) se conservan como evidencia histórica y no son mediciones de esta base, cold starts AWS ni prueba de ahorro mensual.

## Desarrollo local

Ubuntu-26.04 en WSL. Objetivo Node **24.22.1 LTS** (`.nvmrc`), la LTS más reciente al 25/10/2026. Versión comprobada mediante ejecución aislada, sin instalaciones globales.

```bash
npm ci --ignore-scripts
npm run check
```

`check` verifica el formato y ejecuta tipos estrictos, build ESM, tests sin red, smoke fuera del checkout y validación documental. Los comandos de verificación no corrigen fuentes. El paquete usa `dist/handler.js`, export `handler`, y requiere el `package.json` con `type: module`. Requiere `node_modules` de producción según el lock y `LICENSE`. No carga `.env`; la entrada Lambda lee CORS y referencias no secretas del ambiente y valida un snapshot de Secrets Manager antes de negocio. Health sigue disponible como liveness sin esas claves. [Contrato, procedencia y límites](Docs/contact.es.md).

[Stack de test y requisitos](Docs/infrastructure.es.md) · [Casos de prueba en español](Docs/testing.es.md). Vitest ejecuta 617 casos (529 aplicación, 69 tooling, 19 infraestructura).

Formato legible con Prettier **3.9.10** y reglas explícitas en `.prettierrc.json`: 2 espacios, comillas simples, punto y coma, comas finales y ancho orientativo de 100 columnas. Los scripts separan preparación, ejecución y comprobación con líneas en blanco; Prettier conserva esa separación. `npm run format` aplica el formato; `npm run format:check` verifica sin modificar archivos y es obligatorio en CI. `.gitignore` y `.prettierignore` excluyen privados, generados, lock y fixture histórico con hash fijado.

## Alcance

- Seis contratos previstos: health, contacto, starters, chat y alta/baja de suscripciones.
- portfolio conserva frontend, contenido editorial estático y hosting.
- portfolio-cloud conserva suscriptores, notificaciones, OG, releases y publicación de knowledge.
- La sustitución de implementación conserva HTTP y comportamiento; URL/routing pueden requerir configuración.
- Los seis contratos están implementados; la compatibilidad completa requiere endurecimiento e integración administrada.

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

Suscripciones utiliza PORTFOLIO_CLOUD_API_URL, leída únicamente al invocar esa sección. [Contratos, configuración, errores y procedencia](Docs/subscriptions.es.md). Sin esa configuración devuelve 500 controlado; health sigue disponible.

[Starters/chat: contratos, configuración, referencias, diferencias y procedencia](Docs/chat.es.md). Dependencias nuevas: SDK S3 3.1156.0 para R2 y reflect-metadata 0.2.2 para historial anidado. Perfil/proyectos/prompts conservan el SHA auditado; renovación editorial pendiente.

La ubicación profesional del chat se corrige puntualmente a Posadas, Misiones, Argentina, con diferencia explícita frente al SHA fijado. FAQ y contexto también incluyen el correo profesional contacto@matiasgaleano.dev desde un único dato compartido. El resto del contenido conserva su alcance anterior y la renovación editorial general sigue inmediatamente antes de producción. [Detalle y referencias históricas](Docs/chat.es.md).

La fase 4 implementa el control compartido del handler administrado. La suite actual tiene 617 pruebas: 529 de aplicación, 69 de tooling y 19 de infraestructura. [Configuración, presupuesto global, sesiones, fallback y límites de validación](Docs/runtime-hardening.es.md).

## Infraestructura y entrega revisables

La etapa 5 se completa como diseño local; la etapa 6 incorpora retención del assembly y pruebas del plan. [Trust, PassRole, boundaries, bootstrap mínimo y recuperación](Docs/deployment-design.es.md). La preparación AWS y la validación administrada siguen pendientes.

[Preparación de etapas 6–10: controles Git, auditoría AWS, policies/bootstrap revisables y runbook](Docs/test-operations.es.md). Sin provisioning ni validación administrada.

## Versiones

[0.1.0 — primera revisión para inicializar main](Docs/releases/v0.1.0.es.md). El despliegue y la validación administrada siguen pendientes.
