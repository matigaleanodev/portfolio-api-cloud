# Branch protection

[Español](branch-protection.es.md) · 2026-10-24. Repository: matigaleanodev/portfolio-api-cloud.

## Policy

Work branches use `feat/`, `fix/` or `release/`. `codex/` and other prefixes are blocked. `main` and `dev` require PRs, CI and automated merges; direct pushes, deletion and force are prohibited.

| Ruleset | Rules | Steady-state bypass |
| --- | --- | --- |
| [main-dev-workflow-merges-only](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799501) | Restrict main/dev updates | none until App configuration |
| [main-dev-required-pr-and-ci](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799502) | PR, GitHub Actions verify check, current branch, resolved conversations, merge commits only; no deletion/force | none, including administrators |
| [allowed-branch-prefixes](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799503) | restrict creation outside main/dev/feat/**/fix/**/release/** | none |

Branch-name rule queries confirmed main/dev protection, creation blocking for codex/example and feature/example, and permitted creation for feat/example, fix/example and release/example. No test branches were created. Required review approvals are zero for solo maintenance; PR and CI remain mandatory.

## Initial integration

`dev` was initialized with the root exclusions commit and is the default branch. `main` does not exist yet. [PR #1](https://github.com/matigaleanodev/portfolio-api-cloud/pull/1) integrated documentation and workflow preparation into dev.

Initial integration temporarily removed only dev from the update lock, preserved PR/CI, and restored the original ruleset condition with effective API verification. That exception is consumed and does not define the regular delivery process.

## Pending automation

GitHub rejected integrated GitHub Actions App 15368 as a ruleset bypass with HTTP 422: `Actor GitHub Actions integration must be part of the ruleset source or owner organization`.

The steady-state flow needs a dedicated App installed only in this repository. Its ID will be the update ruleset's sole pull_request bypass; the quality ruleset retains no bypass. Until that integration exists, the steady-state update lock also blocks workflow merges. [Planned configuration](ci-cd.md).

The owner can edit rules; protection is not immutable against repository administration.

References: [rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets), [branch-name rules API](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch).

## Status after initial integration

PR #1 is integrated into dev and updates restrictions are restored. The initial exception is consumed. The dedicated App remains pending; this local increment does not modify rules, permissions or remote automation.
