# Integración atribuida a la cuenta

[English](integration.md) · 24/10/2026.

## Decisión y estado

Los nuevos merges automatizados deben quedar atribuidos realmente a **matigaleanodev** (ID 99203645). La identidad se determina por la credencial que realiza la operación y se confirma con `merged_by` de GitHub. Cambiar author/committer, el título del merge o su fecha no cambia al actor autenticado.

El workflow local reemplaza el token de instalación por un secreto de usuario `MERGE_USER_TOKEN` del environment `merge`. Verifica login, ID y tipo User; mantiene PR del mismo repo, base main/dev, SHA completo revisado, checks requeridos, ejecución serial y API merge sin --admin. No hace checkout ni ejecuta código del PR con credenciales. Falta una credencial válida o el acceso efectivo: falla antes de integrar, sin fallback a la App.

Esta preparación no está activada ni comprobada mediante un merge remoto. La configuración efectiva inspeccionada sigue siendo la anterior: [updates](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799501) permite solo a la App 5461240 vía PR; [calidad](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799502) no tiene bypass. La consulta con la identidad de cuenta devuelve `current_user_can_bypass=never`. No se modificaron esos rulesets.

## Credencial necesaria

Las siguientes alternativas atribuyen la actividad a una cuenta humana:

| Alternativa | Alcance y mantenimiento |
| --- | --- |
| OAuth de usuario existente — configuración actual | Credencial de GitHub CLI con scopes repo y workflow, de alcance amplio; se conserva su configuración y se almacena únicamente como secreto de environment. No modifica el acceso de la cuenta frente a los rulesets. |
| Fine-grained PAT de matigaleanodev | Elegir solo portfolio-api-cloud y caducidad corta. Contents write para merge, Pull requests read para verificar el PR y Workflows write para este corte que modifica workflows; Metadata read implícito. No requiere Administration write ni acceso a otros repos. |
| User access token de la App dedicada | Requiere autorización OAuth explícita de la cuenta. Conserva la intersección de permisos del usuario y de la App; no hereda por suposición el bypass de su token de instalación. La expiración predeterminada es 8 horas; una renovación requiere refresh token y su protección. |

La configuración actual reutiliza OAuth de usuario; un PAT granular dedicado sigue siendo una alternativa para reducir alcance sin agregar un servicio de renovación OAuth de la App. MERGE_USER_TOKEN se mantiene en el environment protegido, sin valores en documentación, conversación, argumentos o logs. La clave privada de instalación no se convierte en identidad humana. GITHUB_TOKEN de solo lectura conserva la validación de checks, por lo que la credencial de merge no necesita acceso adicional a Checks.

Se guardó la credencial OAuth existente de GitHub CLI como MERGE_USER_TOKEN en el environment merge. GET /user verificó login matigaleanodev, ID 99203645 y tipo User; el environment conserva únicamente main/dev. No se creó un token nuevo, no se ampliaron scopes, no se cambiaron permisos ni se modificó su caducidad. El valor se transfirió por stdin y no se guardó en archivos ni se mostró. El workflow repetirá GET /user antes de integrar.

## Acceso protegido y transición pendiente

Una credencial identifica al usuario, pero no le otorga un permiso que la cuenta no tiene. El workflow exige acceso efectivo **solo por PR** en el ruleset de updates y ausencia de bypass en PR/CI. GitHub vuelve a aplicar las reglas al integrar el SHA exacto.

Cambiar el bypass de updates al usuario 99203645, con modo pull_request, es una posible modificación administrativa; no se realizó. Mantendría el bloqueo de push directo y las reglas independientes de PR/CI, pero también permitiría a esa cuenta integrar un PR desde la UI. El ruleset distingue actores, no certifica que un token humano se utilizó exclusivamente dentro de Actions. Ese compromiso difiere de la restricción actual exclusiva de la App y necesita una decisión explícita.

Además, el workflow versionado en dev todavía utiliza el token de instalación. El candidato local solo acepta dispatch desde main/dev y conserva el environment limitado a esas ramas. Por tanto, no puede usarse desde feat/ para integrarse a sí mismo. No se agregó una entrada temporal, no se amplió el environment y no se reactivó la recuperación anterior.

La transición inicial debe resolverse de forma específica sin falsificar identidad, omitir CI ni ejecutar un merge manual. Hasta resolver credencial, acceso y activación, el corte puede quedar revisado en un PR, pero su merge bajo esta política sigue bloqueado.

## Verificación local

Siete pruebas ejecutan los bloques Python reales del workflow con respuestas ficticias: SHA/base/prefijo del PR, usuario esperado frente a bots/otras cuentas, permiso por PR frente a ausencia o bypass amplio, reglas activas y sin bypass de calidad, verify de GitHub Actions y base actualizada, actor/commit real y rechazo de un head cambiado. Actionlint valida el YAML y sus scripts. No prueban permisos reales de un token nuevo ni un merge remoto.

## Fuentes

- [Identidades de autenticación GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/about-authentication-with-a-github-app)
- [Actividad en nombre de un usuario](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-with-a-github-app-on-behalf-of-a-user)
- [Generación y expiración de user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [PAT granular](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [Merge de PR y permisos](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request)
- [Rulesets y actores de bypass](https://docs.github.com/en/rest/repos/rules)
