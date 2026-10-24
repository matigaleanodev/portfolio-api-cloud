# Portfolio API Cloud

[English](README.md)

Migración de la API pública de Portfolio desde EC2 compartida hacia servicios administrados de AWS. El objetivo es reducir la operación de servidores, conservar los contratos existentes y medir el costo total antes de cambiar producción.

## Estado actual

La auditoría y la planificación están completas. El repositorio contiene documentación bilingüe, validación documental y workflows de CI, preparación de despliegue test y merges protegidos. Todavía no tiene código de aplicación, stack CDK ni recursos AWS desplegados.

La integración inicial se concentra en `dev`. `main` queda reservada para una etapa posterior. La API original continúa siendo el respaldo operativo.

## Responsabilidades

- `portfolio`: frontend Angular, contenido editorial estático y Firebase Hosting.
- `portfolio-api`: implementación NestJS actual de health, contacto, chat y fachada de suscripciones.
- `portfolio-cloud`: persistencia de suscriptores, notificaciones, imágenes OG, procesamiento de releases y publicación del conocimiento del chat.
- `portfolio-api-cloud`: futura implementación administrada de los seis endpoints de la API pública.

El código auditado no tiene base de datos de aplicación, uploads, WebSockets ni streaming. La persistencia de suscripciones y la automatización editorial siguen en `portfolio-cloud`.

## Documentación

1. [Auditoría funcional y evidencia](Docs/audit.es.md)
2. [Arquitectura y herramientas de infraestructura](Docs/architecture.es.md)
3. [Costos y supuestos](Docs/costs.es.md)
4. [Migración y recuperación](Docs/migration.es.md)
5. [Registro de decisiones](Docs/decisions.es.md)
6. [CI/CD](Docs/ci-cd.es.md)
7. [Evaluación del runtime](Docs/runtime-evaluation.es.md)
8. [Protección de ramas](Docs/branch-protection.es.md)
9. [Fuentes consultadas el 24/10/2026](Docs/sources.es.md)

## Decisiones abiertas

CDK TypeScript es la opción de infraestructura preferida; SAM es la alternativa más cercana por su uso en `portfolio-cloud`. La elección del runtime sigue abierta entre NestJS adaptado y handlers Node.js livianos. Lambda Event Function con HTTP API es la base inicial de evaluación; sus límites, latencia, protección contra abuso y costo deben validarse antes de cerrar la arquitectura.

## Desarrollo y entrega

El entorno local es Ubuntu-26.04 en WSL. Las ramas de trabajo usan `feat/`, `fix/` o `release/`; `codex/` está prohibido. `main` y `dev` requieren PR, CI y el flujo de integración definido en [protección de ramas](Docs/branch-protection.es.md).

La validación documental se ejecuta con `python3 scripts/check_docs.py`. Los scripts npm/CDK corresponden a la implementación futura.

La convivencia con EC2 permite validar la migración de Portfolio sin interrumpir las otras aplicaciones del servidor compartido. Su retiro depende de completar las migraciones restantes y el período de estabilización.
