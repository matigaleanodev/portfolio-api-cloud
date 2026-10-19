# Protección de ramas: estado aplicado

[English](branch-protection.md) · Verificado por API GitHub el 24/10/2026. Solo afecta matigaleanodev/portfolio-api-cloud.

## Reglas activas

| Ruleset | Reglas | Bypass |
| --- | --- | --- |
| [main-dev-workflow-merges-only](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799501) | Restrict updates sobre main y dev | ninguno actualmente: bloqueo estricto hasta configurar App |
| [main-dev-required-pr-and-ci](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799502) | PR obligatorio, check verify de GitHub Actions y rama actualizada, conversaciones resueltas, solo merge commits; no delete/force | ninguno, tampoco administradores |
| [allowed-branch-prefixes](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799503) | restringe creación fuera de main/dev/feat/**/fix/**/release/** | ninguno |

Se consultaron reglas aplicables a main/dev (update, PR, required_status_checks, non_fast_forward, deletion), codex/example y feature/example (creation bloqueada), y feat/example, fix/example, release/example (sin bloqueo de creación). No se crearon ramas de prueba ni se intentaron pushes. Son comprobaciones de configuración, no una prueba real de merge.

Al aplicar las reglas, el repo estaba vacío, sin refs main/dev ni default branch real. Los rulesets sí aplican a esos nombres cuando existan. No se hizo commit ni push en esa etapa; su publicación y la integración solo a dev se autorizaron posteriormente. No se requirió revisión de otro humano (0 aprobaciones) para no bloquear al mantenedor único; eso no autoriza fusionar sin el workflow/check. La creación inicial no demuestra un camino operativo: necesita un bootstrap Git acordado y autorizado por separado.

## Restricción encontrada y resolución pendiente

Se intentó configurar GitHub Actions App 15368 como único bypass pull_request del ruleset update. GitHub respondió HTTP 422: `Actor GitHub Actions integration must be part of the ruleset source or owner organization`. Ninguna regla se creó en ese intento rechazado. No es un rechazo del revisor automático de Codex.

Para no permitir merges humanos como alternativa, se aplicó el ruleset update **sin bypass**. Bloquea también los workflows. Hace falta una GitHub App personal dedicada instalada en este repo, agregar solo su ID como bypass pull_request de ese ruleset y configurar su token en environment merge. El quality ruleset debe seguir sin bypass, para exigir PR/check incluso a la App. No se creó App, clave, secret ni permiso profesional; su instalación es una decisión pendiente del usuario. [Workflow preparado](ci-cd.es.md).

No afirmar que los merges ya funcionan. Tampoco debilitar el lock, agregar bypass de administradores o copiar un PAT para sortearlo. Un administrador del repo puede editar reglas; la protección no es inmutable frente al propietario.

La política nueva permitida por el usuario es feat/, fix/ y release/; codex/ está prohibido. Reemplaza para este repo la regla previa del workspace que solo nombraba feat/fix.

Referencias: [rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets), [API de reglas por nombre, incluso si la rama no existe](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch).
