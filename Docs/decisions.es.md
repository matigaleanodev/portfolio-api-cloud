# Registro de decisiones

[English](decisions.md) · 24/10/2026.

## Decisiones cerradas

- La migración abarca toda la API pública, con la implementación original como respaldo.
- `portfolio` conserva la entrega estática y `portfolio-cloud` sus responsabilidades actuales.
- La implementación nueva vive en un repositorio público independiente.
- La primera integración se realiza en `dev`; `main` queda para una etapa posterior.
- La transición admite uno o dos meses de convivencia. EC2 permanece disponible hasta completar las migraciones restantes y la estabilización.
- El trabajo usa exclusivamente la cuenta AWS personal y la región principal us-east-1.

## ADR-001 — Infraestructura como código

Estado: **abierta; CDK TypeScript es la opción preferida**.

Los criterios principales son experiencia operativa con CDK, TypeScript compartido con la API, control explícito de IAM y pruebas de infraestructura. SAM sigue siendo finalista por continuidad con `portfolio-cloud`. Ese repositorio conserva SAM; uniformar herramientas no justifica migrarlo.

Pendientes: diseño del bootstrap, roles, boundaries y confirmación de la herramienta con el runtime elegido. [Comparación](architecture.es.md).

## ADR-002 — Runtime de la API

Estado: **abierta**.

Las candidatas son NestJS adaptado y handlers Node.js livianos. Ambas deben conservar contratos y comportamiento. Event Function con HTTP API, fuera de VPC y con cuotas distribuidas, es la base común de evaluación. La separación del chat en otra función depende de contención o necesidades de permisos comprobadas.

La decisión se cierra con compatibilidad funcional, medidas de arranque y latencia, costo y mantenimiento. Lambda Web Functions sigue como alternativa si su modelo de ejecución resulta más conveniente. [Protocolo de evaluación](runtime-evaluation.es.md).

## ADR-003 — Integración y entrega

Estado: **política definida; automatización pendiente**.

Las ramas de trabajo usan feat/fix/release. main y dev requieren PR, CI, conversaciones resueltas y protección contra borrado/force. El flujo estable de merge usará una App dedicada. La integración inicial del PR #1 contempla una excepción temporal limitada a dev; el bloqueo se restablece al finalizar.

CI distingue validación documental de pruebas de aplicación. El workflow test prepara un changeset, sin ejecutarlo, y no tiene camino productivo. [CI/CD](ci-cd.es.md) y [reglas](branch-protection.es.md).

## Decisiones abiertas restantes

- Presupuesto, cuota diaria de IA y objetivos de latencia.
- Edad máxima del conocimiento stale y política de fallback.
- Aislamiento de datos y proveedores en test.
- Roles, bootstrap y retención de artifacts.
- Mecanismo de dominio, corte de tráfico y ensayo de recuperación.

Faltan tráfico y costos reales para cerrar el presupuesto. Las hipótesis de los escenarios no representan consumos medidos.
