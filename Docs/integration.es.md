# Integración atribuida a la cuenta

[English](integration.md) · 24/10/2026.

## Decisión y estado

Los nuevos merges automatizados deben quedar atribuidos realmente a **matigaleanodev** (ID 99203645). La identidad se determina por la credencial que realiza la operación y se confirma con `merged_by` de GitHub. Cambiar author/committer, el título del merge o su fecha no cambia al actor autenticado.

El workflow reemplaza el token de instalación por un secreto de usuario `MERGE_USER_TOKEN` del environment `merge`. Verifica login, ID y tipo User; mantiene PR del mismo repo, base main/dev, SHA completo revisado, checks requeridos, ejecución serial y API merge sin --admin. No hace checkout ni ejecuta código del PR con credenciales. Falta una credencial válida o el acceso efectivo: falla antes de integrar, sin fallback a la App.

El mecanismo está instalado en dev tras el PR #5. [Updates](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799501) permite a matigaleanodev solo vía PR; [calidad](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799502) conserva cero bypass y sus reglas no cambiaron.

## Credencial necesaria

Las siguientes alternativas atribuyen la actividad a una cuenta humana:

| Alternativa | Alcance y mantenimiento |
| --- | --- |
| OAuth de usuario existente — configuración actual | Credencial de GitHub CLI con scopes repo y workflow, de alcance amplio; se conserva su configuración y se almacena únicamente como secreto de environment. No modifica el acceso de la cuenta frente a los rulesets. |
| Fine-grained PAT de matigaleanodev | Elegir solo portfolio-api-cloud y caducidad corta. Contents write para merge, Pull requests read para verificar el PR y Workflows write para este corte que modifica workflows; Metadata read implícito. No requiere Administration write ni acceso a otros repos. |
| User access token de la App dedicada | Requiere autorización OAuth explícita de la cuenta. Conserva la intersección de permisos del usuario y de la App; no hereda por suposición el bypass de su token de instalación. La expiración predeterminada es 8 horas; una renovación requiere refresh token y su protección. |

La configuración actual reutiliza OAuth de usuario; un PAT granular dedicado sigue siendo una alternativa para reducir alcance sin agregar un servicio de renovación OAuth de la App. MERGE_USER_TOKEN se mantiene en el environment protegido, sin valores en documentación, conversación, argumentos o logs. La clave privada de instalación no se convierte en identidad humana. GITHUB_TOKEN de solo lectura conserva la validación de checks, por lo que la credencial de merge no necesita acceso adicional a Checks.

Se guardó la credencial OAuth existente de GitHub CLI como MERGE_USER_TOKEN en el environment merge. GET /user verificó login matigaleanodev, ID 99203645 y tipo User; el environment conserva únicamente main/dev. No se creó un token nuevo, no se ampliaron scopes, no se cambiaron permisos ni se modificó su caducidad. El valor se transfirió por stdin y no se guardó en archivos ni se mostró. El workflow repetirá GET /user antes de integrar.

## Transición protegida aplicada

El [PR preparatorio #5](https://github.com/matigaleanodev/portfolio-api-cloud/pull/5) instaló el workflow nuevo mediante una última integración por la App, con CI aprobada y las protecciones vigentes. Después se reemplazó exclusivamente el actor de updates por **User 99203645**, modo **pull_request**. La verificación efectiva devuelve `current_user_can_bypass=pull_requests_only`.

El ruleset de calidad permanece idéntico, sin bypass: exige PR, verify de GitHub Actions, base actualizada, conversaciones resueltas y protección contra borrado/force. El environment merge conserva solo main/dev. No se agregó acceso temporal desde feat/, no se retiraron protecciones y no se reactivó la recuperación anterior.

La cuenta ahora también podría integrar un PR desde la UI; un ruleset distingue actores y no el lugar desde el que se utilizó un token. La política operativa sigue exigiendo exclusivamente el workflow, sin merge manual, push directo ni --admin.

El token identifica al usuario, pero la autorización depende de reglas efectivas. El workflow comprueba ambas cosas antes de solicitar el merge y GitHub vuelve a aplicar las reglas al SHA exacto. La atribución de cada integración se confirma mediante `merged_by` en el PR, por ejemplo el [PR de aplicación #4](https://github.com/matigaleanodev/portfolio-api-cloud/pull/4).

## Verificación local

Siete pruebas ejecutan los bloques Python reales del workflow con respuestas ficticias: SHA/base/prefijo del PR, usuario esperado frente a bots/otras cuentas, permiso por PR frente a ausencia o bypass amplio, reglas activas y sin bypass de calidad, verify de GitHub Actions y base actualizada, actor/commit real y rechazo de un head cambiado. Actionlint valida el YAML y sus scripts. No prueban permisos reales de un token nuevo ni un merge remoto.

## Fuentes

- [Identidades de autenticación GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/about-authentication-with-a-github-app)
- [Actividad en nombre de un usuario](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-with-a-github-app-on-behalf-of-a-user)
- [Generación y expiración de user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [PAT granular](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [Merge de PR y permisos](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request)
- [Rulesets y actores de bypass](https://docs.github.com/en/rest/repos/rules)
