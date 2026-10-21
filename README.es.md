# Portfolio API Cloud

[English](README.md)

Implementación alternativa de la API pública de Portfolio mediante handlers TypeScript y servicios administrados. La migración a serverless está decidida; la comparación con NestJS conserva evidencia técnica de comportamiento y costos de implementación.

## Estado de esta entrega

Este repositorio versiona la planificación, auditoría, decisiones y resultados de un experimento local. El prototipo experimental se descarta después de registrar su evidencia; no forma parte de la base de código de la nueva API. El siguiente incremento construye su estructura inicial.

No hay aplicación productiva ni stack CDK implementados en esta entrega. La API NestJS original continúa operativa y se conserva como implementación independiente. Los resultados locales no son cold starts AWS ni prueban ahorro mensual.

## Alcance

- Seis contratos: health, contacto, starters, chat y alta/baja de suscripciones.
- portfolio conserva frontend, contenido editorial estático y hosting.
- portfolio-cloud conserva suscriptores, notificaciones, OG, releases y publicación de knowledge.
- La alternativa mantiene HTTP y comportamiento para cambiar la implementación consumida por el frontend; URL o routing pueden requerir configuración.
- Las APIs de dominios distintos no se intercambian entre sí.

## Documentación

1. [Auditoría y contratos](Docs/audit.es.md)
2. [Arquitectura](Docs/architecture.es.md)
3. [Costos hipotéticos y servicios auxiliares](Docs/costs.es.md)
4. [Migración, renovación del bot y recuperación](Docs/migration.es.md)
5. [Decisiones](Docs/decisions.es.md)
6. [CI/CD preparado](Docs/ci-cd.es.md)
7. [Comparación de runtime](Docs/runtime-evaluation.es.md)
8. [Resultados locales](Docs/local-runtime.es.md)
9. [Procedencia, muestras y dependencias](Docs/runtime-evidence.es.md)
10. [Protección de ramas](Docs/branch-protection.es.md)
11. [Fuentes](Docs/sources.es.md)

## Transición y entrega

Las tres APIs actuales permanecen operativas durante la migración. EC2 se apagará al completar las tres migraciones y validar recuperación, conservando la instancia sin terminarla ni desmantelarla y con un backup recuperable. Los recursos retenidos forman parte del costo total.

La renovación de los datos del bot sobre perfil y proyectos será el último paso antes del despliegue productivo. Incluye artifact publicado, fallback y validación del paquete final, con versión anterior recuperable.

Las ramas de trabajo usan feat/fix. main/dev requieren PR, CI y merge por workflow. PR #1 está integrado en dev, el bloqueo fue restaurado y la App dedicada sigue pendiente. CDK TypeScript es la opción de infraestructura preferida; roles/bootstrap y mecanismo de conmutación siguen abiertos.

La validación disponible en un checkout documental es python3 scripts/check_docs.py. No incluye comandos npm del experimento descartado. Entorno de trabajo: Ubuntu-26.04 en WSL.
