# Protección de ramas

[English](branch-protection.md) · 24/10/2026. Repositorio: matigaleanodev/portfolio-api-cloud.

## Política

Las ramas de trabajo usan `feat/`, `fix/` o `release/`. `codex/` y cualquier otro prefijo quedan bloqueados. `main` y `dev` requieren PR, CI y merge mediante automatización; no admiten push directo, borrado ni force.

| Ruleset | Reglas | Bypass estable |
| --- | --- | --- |
| [main-dev-workflow-merges-only](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799501) | Restrict updates sobre main/dev | Usuario 99203645 (matigaleanodev), solo `pull_request` |
| [main-dev-required-pr-and-ci](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799502) | PR, check verify de GitHub Actions, rama actualizada, conversaciones resueltas, solo merge commits; no delete/force | ninguno, tampoco administradores |
| [allowed-branch-prefixes](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799503) | restringe creación fuera de main/dev/feat/**/fix/**/release/** | ninguno |

La revisión de reglas por nombre confirmó protección de main/dev, bloqueo de codex/example y feature/example, y creación permitida para feat/example, fix/example y release/example. No se crearon ramas de prueba para esta verificación. Las aprobaciones de review requeridas son cero, por tratarse de un repositorio de mantenimiento individual; PR y CI siguen siendo obligatorios.

## Integración inicial

`dev` se inicializó con el commit raíz de exclusiones y es la rama predeterminada. `main` todavía no existe. El [PR #1](https://github.com/matigaleanodev/portfolio-api-cloud/pull/1) integró la preparación documental y de workflows en dev.

La integración inicial retiró temporalmente solo dev del bloqueo de updates, conservó PR/CI y restauró el ruleset al finalizar, con verificación efectiva por API. Esa excepción quedó consumida; no define el flujo habitual de entrega.

## Automatización configurada

GitHub rechazó la App integrada GitHub Actions (15368) como bypass del ruleset con HTTP 422: `Actor GitHub Actions integration must be part of the ruleset source or owner organization`.

La App privada `matigaleanodev-portfolio-merge` (5461240, instalación 174974385) está instalada exclusivamente en este repositorio, con selección de repositorios verificada por API. Fue el único bypass `pull_request` de updates hasta la transición del PR #5. El actor actual es el usuario 99203645, solo vía PR; calidad conserva cero bypass y sus reglas no cambiaron. [Configuración efectiva](ci-cd.es.md).

El propietario puede editar reglas; la protección no es inmutable frente a la administración del repositorio.

Referencias: [rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets), [API de reglas por nombre](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch).

## Estado después de la integración inicial

PR #1 integrado en dev y bloqueo de updates restaurado. La excepción inicial está consumida. La App dedicada ya está configurada sin volver a retirar dev del bloqueo. El [PR #2](https://github.com/matigaleanodev/portfolio-api-cloud/pull/2) fue integrado por la App mediante [workflow](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40147939891), con CI previa y posterior aprobada. La entrada de recuperación acotada al SHA se retira del workflow y del environment; no se habilitó bypass de PR/CI.

## Política de identidad de la siguiente integración

Los merges nuevos se atribuyen a matigaleanodev. El workflow verifica un token de usuario y no utiliza el token de instalación como fallback. El PR #5 instaló el mecanismo; se reemplazó únicamente el actor de updates por User 99203645, solo vía PR, y se verificó acceso efectivo pull_requests_only. PR/CI conserva sus reglas y cero bypass. El environment sigue limitado a main/dev. [Análisis de permisos y garantías](integration.es.md).
