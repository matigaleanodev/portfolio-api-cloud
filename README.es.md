# Portfolio API Cloud

[English](README.md)

Migración de **toda** la API pública de Portfolio desde EC2 compartida hacia infraestructura administrada en AWS. Este repositorio contiene la auditoría, una propuesta y preparación de workflows. **No tiene código de aplicación, stack CDK, dependencias instaladas ni recursos desplegados**.

## Alcance y responsabilidades

- `portfolio`: UI Angular, contenido editorial estático y Firebase Hosting.
- `portfolio-api`: API NestJS existente; se conserva como respaldo operativo.
- `portfolio-cloud`: automatización SAM existente, persistencia de suscriptores, notificaciones de releases, imágenes OG y publicación canónica del conocimiento del chat. Esas responsabilidades no se trasladan acá.
- `portfolio-api-cloud`: futuro reemplazo de health, contacto, chat y fachada de suscripciones.

El contrato público tiene seis rutas. La API no tiene base de datos de aplicación, uploads, WebSockets ni streaming. Son hallazgos del código; no prueban que producción coincida con cada archivo local.

## Orden de lectura

1. [Auditoría actual y evidencia](Docs/audit.es.md)
2. [Arquitectura y recomendación de framework](Docs/architecture.es.md)
3. [Escenarios de costos](Docs/costs.es.md)
4. [Migración, aceptación y recuperación](Docs/migration.es.md)
5. [Estado de decisiones](Docs/decisions.es.md)
6. [Preparación de CI/CD](Docs/ci-cd.es.md)
7. [Comparación de runtimes y criterios](Docs/runtime-evaluation.es.md)
8. [Protecciones aplicadas y App de merges pendiente](Docs/branch-protection.es.md)
9. [Referencias oficiales, consultadas el 24/10/2026](Docs/sources.es.md)

**Recomendación, pendiente de aprobación para implementar:** CDK TypeScript; comparar NestJS adaptado con handlers Node.js livianos antes de elegir runtime. Evaluar inicialmente Lambda Event Function con API Gateway HTTP API. El límite compartido por IP y los tiempos máximos de llamadas externas bloquean la salida a producción hasta validarlos. SAM es la alternativa más cercana. No se presupone ahorro por usar serverless.

## Autorización vigente

El usuario autorizó crear este repositorio público, documentación Markdown local, archivos de workflows y protección de ramas GitHub. El usuario autorizó después commits pequeños, publicación de la rama, integración solo a dev y limpieza posterior. main queda fuera de esta entrega. Siguen sin autorizarse implementación de la aplicación, mutaciones AWS, bootstrap CDK, despliegues o cambios de tráfico productivo. Las fechas Git solicitadas no cambian la fecha real de consulta de la auditoría (24/10/2026). El merge inicial depende de resolver la identidad de automatización y el bootstrap Git sin eludir protecciones.

## Trabajo local

Trabajar en Ubuntu-26.04 desde WSL. Las ramas nuevas usan `feat/`, `fix/` o `release/`. `agents.md` y sus variantes, `roadmap` y `mentor` son locales ignorados y no se publican. La documentación duradera tiene pares inglés/español. Validar la documentación actual con `python3 scripts/check_docs.py`. Todavía no existen comandos npm/CDK; el contrato futuro de scripts está en [CI/CD](Docs/ci-cd.es.md).

Conservar la API EC2 durante la migración de Portfolio. Foodly Notes y Modo Playa son migraciones posteriores independientes. Retirar EC2 queda fuera del alcance vigente.

Las ramas `codex/` están prohibidas. main/dev requieren PR fusionado por workflow; los updates siguen bloqueados hasta instalar la App dedicada. Ver la documentación de protección.
