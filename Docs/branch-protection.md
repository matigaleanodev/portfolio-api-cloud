# Branch protection: applied state

[Español](branch-protection.es.md) · Verified through GitHub API on 2026-10-24. Applies only to matigaleanodev/portfolio-api-cloud.

| Active ruleset | Rules | Bypass |
| --- | --- | --- |
| [main-dev-workflow-merges-only](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799501) | Restrict main/dev updates | none until dedicated App configuration |
| [main-dev-required-pr-and-ci](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799502) | PR, GitHub Actions verify check with up-to-date branch, resolved threads, merge commits only; no deletion/force | none, including administrators |
| [allowed-branch-prefixes](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799503) | restrict creation outside main/dev/feat/**/fix/**/release/** | none |

Applicable-rule queries returned update/PR/status/non-fast-forward/deletion for main/dev, creation blocking for codex/example and feature/example, and no creation block for feat/example, fix/example and release/example. No test branches/push attempts were made. This verifies configuration, not an actual merge.

When these rules were applied, the repository was empty with no main/dev refs or real default branch. Rulesets still target those future names. No commit/push occurred at that stage; publication and dev-only integration were authorized afterward. Required human approvals remain zero to support a solo maintainer; this does not bypass the workflow/check. Initial branch seeding needs a separately agreed authorized Git bootstrap.

## Encountered restriction and pending resolution

GitHub rejected integrated GitHub Actions App 15368 as sole pull_request update bypass with HTTP 422: `Actor GitHub Actions integration must be part of the ruleset source or owner organization`. That rejected request created no rule. It was not a Codex automatic-review rejection.

Instead of allowing human merges, the active update ruleset has **no bypass** and blocks workflows too. A dedicated personal GitHub App must be installed only in this repo, added as its sole pull_request update bypass, and configured for the merge environment. Leave the quality ruleset without bypass so PR/check requirements still apply to the App. No App/key/secret/professional permission was created. Installation requires a user decision. [Prepared workflow](ci-cd.md).

Do not claim merges already work, weaken the lock, add administrator bypass or substitute a human PAT. The repository owner can edit rules; protection is not immutable against its administrator.

The user's latest repo policy allows feat/, fix/, release/ and forbids codex/. It overrides the earlier workspace rule naming only feat/fix for this repository.

References: [rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets), [branch-name rules API, including nonexistent branches](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch).
