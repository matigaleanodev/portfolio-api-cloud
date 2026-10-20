# Protección de ramas

[English](branch-protection.md) · 24/10/2026. Repositorio: matigaleanodev/portfolio-api-cloud.

## Política

Las ramas de trabajo usan `feat/`, `fix/` o `release/`. `codex/` y cualquier otro prefijo quedan bloqueados. `main` y `dev` requieren PR, CI y merge mediante automatización; no admiten push directo, borrado ni force.

| Ruleset | Reglas | Bypass estable |
| --- | --- | --- |
| [main-dev-workflow-merges-only](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799501) | Restrict updates sobre main/dev | ninguno hasta configurar la App |
| [main-dev-required-pr-and-ci](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799502) | PR, check verify de GitHub Actions, rama actualizada, conversaciones resueltas, solo merge commits; no delete/force | ninguno, tampoco administradores |
| [allowed-branch-prefixes](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799503) | restringe creación fuera de main/dev/feat/**/fix/**/release/** | ninguno |

La revisión de reglas por nombre confirmó protección de main/dev, bloqueo de codex/example y feature/example, y creación permitida para feat/example, fix/example y release/example. No se crearon ramas de prueba para esta verificación. Las aprobaciones de review requeridas son cero, por tratarse de un repositorio de mantenimiento individual; PR y CI siguen siendo obligatorios.

## Integración inicial

`dev` se inicializó con el commit raíz de exclusiones y es la rama predeterminada. `main` todavía no existe. El [PR #1](https://github.com/matigaleanodev/portfolio-api-cloud/pull/1) integró la preparación documental y de workflows en dev.

La integración inicial retiró temporalmente solo dev del bloqueo de updates, conservó PR/CI y restauró el ruleset al finalizar, con verificación efectiva por API. Esa excepción quedó consumida; no define el flujo habitual de entrega.

## Automatización pendiente

GitHub rechazó la App integrada GitHub Actions (15368) como bypass del ruleset con HTTP 422: `Actor GitHub Actions integration must be part of the ruleset source or owner organization`.

El flujo estable necesita una App dedicada instalada exclusivamente en este repositorio. Su ID será el único bypass pull_request del ruleset de updates; el ruleset de calidad continuará sin bypass. Mientras falta esa integración, el bloqueo estable también impide merges de workflows. [Configuración prevista](ci-cd.es.md).

El propietario puede editar reglas; la protección no es inmutable frente a la administración del repositorio.

Referencias: [rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets), [API de reglas por nombre](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch).

## Estado después de la integración inicial

PR #1 integrado en dev y bloqueo de updates restaurado. La excepción inicial está consumida. La App dedicada sigue pendiente; este incremento local no modifica reglas, permisos ni automatizaciones remotas.
