# Branch protection

[Español](branch-protection.es.md) · 2026-10-24. Repository: matigaleanodev/portfolio-api-cloud.

## Policy

Work branches use `feat/`, `fix/` or `release/`. `codex/` and other prefixes are blocked. `main` and `dev` require PRs, CI and automated merges; direct pushes, deletion and force are prohibited.

| Ruleset                                                                                               | Rules                                                                                                          | Steady-state bypass                                 |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [main-dev-workflow-merges-only](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799501) | Restrict main/dev updates                                                                                      | User 99203645 (matigaleanodev), `pull_request` only |
| [main-dev-required-pr-and-ci](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799502)   | PR, GitHub Actions verify check, current branch, resolved conversations, merge commits only; no deletion/force | none, including administrators                      |
| [allowed-branch-prefixes](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799503)       | restrict creation outside main/dev/feat/**/fix/**/release/**                                                   | none                                                |

Branch-name rule queries confirmed main/dev protection, creation blocking for codex/example and feature/example, and permitted creation for feat/example, fix/example and release/example. No test branches were created. Required review approvals are zero for solo maintenance; PR and CI remain mandatory.

## Initial integration

`dev` was initialized with the root exclusions commit and is the default branch. Initial `main` uses the [v0.1.0](releases/v0.1.0.md) revision without changing update rules. [PR #1](https://github.com/matigaleanodev/portfolio-api-cloud/pull/1) integrated documentation and workflow preparation into dev.

Initial integration temporarily removed only dev from the update lock, preserved PR/CI, and restored the original ruleset condition with effective API verification. That exception is consumed and does not define the regular delivery process.

## Configured automation

GitHub rejected integrated GitHub Actions App 15368 as a ruleset bypass with HTTP 422: `Actor GitHub Actions integration must be part of the ruleset source or owner organization`.

Private App `matigaleanodev-portfolio-merge` (5461240, installation 174974385) is installed exclusively in this repository, with repository selection verified through the API. It was the update ruleset's sole `pull_request` bypass until the PR #5 transition. The current actor is user 99203645, PR-only; quality retains zero bypass actors and unchanged rules. [Effective configuration](ci-cd.md).

The owner can edit rules; protection is not immutable against repository administration.

References: [rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets), [branch-name rules API](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch).

## Status after initial integration

PR #1 is integrated into dev and updates restrictions are restored. The initial exception is consumed. The dedicated App is configured without removing dev from the lock again. [PR #2](https://github.com/matigaleanodev/portfolio-api-cloud/pull/2) was merged by the App through a [workflow](https://github.com/matigaleanodev/portfolio-api-cloud/actions/runs/40147939891), with passing CI before and after integration. The SHA-bound recovery entry is removed from the workflow and environment; no PR/CI bypass was enabled.

## Identity policy for the next integration

New merges are attributed to matigaleanodev. The workflow verifies a user token and never falls back to an installation token. PR #5 installed the mechanism; only the update actor changed to User 99203645, PR-only, with effective pull_requests_only access verified. PR/CI retains its rules and zero bypass. The environment remains limited to main/dev. [Permission and guarantee analysis](integration.md).
