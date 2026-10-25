# Integration attributed to the account

[Español](integration.es.md) · 2026-10-24.

## Decision and status

New automated merges must be attributed to **matigaleanodev** (ID 99203645). The credential performing the operation determines identity, confirmed through GitHub's `merged_by`. Changing author/committer, merge title or date does not change the authenticated actor.

The local workflow replaces the installation token with environment `merge` user secret `MERGE_USER_TOKEN`. It verifies login, ID and User type; retains same-repository PRs, main/dev base, full reviewed SHA, required checks, serial execution and API merge without --admin. It does not check out or execute PR code with credentials. Missing valid credentials or effective access fails before integration, without App fallback.

This preparation is neither activated nor verified by a remote merge. Inspected effective configuration remains unchanged: [updates](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799501) allows only App 5461240 through PRs; [quality](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799502) has no bypass. The account-identity query returns `current_user_can_bypass=never`. These rulesets were not modified.

## Required credential

The following alternatives attribute activity to a human account:

| Alternative | Scope and maintenance |
| --- | --- |
| Existing user OAuth credential — current configuration | GitHub CLI credential with broad repo and workflow scopes; its configuration is preserved and it is stored only as an environment secret. It does not change the account's ruleset access. |
| Fine-grained PAT belonging to matigaleanodev | Select only portfolio-api-cloud and a short expiry. Contents write for merge, Pull requests read for PR verification and Workflows write for this delivery modifying workflows; implicit Metadata read. No Administration write or access to other repositories required. |
| Dedicated App user access token | Requires explicit OAuth authorization by the account. Permissions intersect user and App access; installation-token bypass must not be assumed to transfer. Default expiry is 8 hours; renewal requires a protected refresh token. |

Current configuration reuses user OAuth; a dedicated granular PAT remains an alternative to reduce scope without adding an App OAuth renewal service. MERGE_USER_TOKEN stays in the protected environment, with no value in documentation, conversation, arguments or logs. An installation private key is not converted into human identity. The read-only GITHUB_TOKEN retains check validation, so the merge credential needs no additional Checks access.

The existing GitHub CLI OAuth credential was stored as MERGE_USER_TOKEN in environment merge. GET /user verified login matigaleanodev, ID 99203645 and User type; the environment still admits only main/dev. No new token, expanded scopes, permission changes or expiry changes were introduced. The value was transferred through stdin without file storage or display. The workflow will repeat GET /user before integration.

## Protected access and pending transition

A credential identifies the user but cannot grant access the account lacks. The workflow requires effective **PR-only** access to the update ruleset and no PR/CI bypass. GitHub applies rules again when merging the exact SHA.

Replacing the update bypass actor with user 99203645 in pull_request mode is one possible administrative change; it was not performed. Direct pushes would remain blocked and independent PR/CI rules would still apply, but that account could also merge PRs through the UI. A ruleset distinguishes actors; it cannot certify that a human token was used exclusively inside Actions. This differs from the current App-only restriction and requires an explicit decision.

Additionally, dev's versioned workflow still uses an installation token. The local candidate accepts dispatch only from main/dev and retains the environment limited to those branches. It therefore cannot run from feat/ to integrate itself. No temporary entry, environment expansion or previous recovery path was introduced.

Initial transition must be resolved specifically without false identity, skipped CI or manual merges. Until credentials, access and activation are resolved, the delivery can remain reviewed in a PR, but merging under this policy remains blocked.

## Local verification

Seven tests execute the workflow's actual Python blocks using fictional responses: reviewed PR SHA/base/prefix, expected user versus bots/other accounts, PR-only access versus missing/broad bypass, active rules and no quality bypass, GitHub Actions verify and updated base, actual actor/commit and rejection of a changed head. Actionlint checks YAML and shell scripts. These do not verify a new token's real permissions or a remote merge.

## Sources

- [GitHub App authentication identities](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/about-authentication-with-a-github-app)
- [Activity on behalf of a user](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-with-a-github-app-on-behalf-of-a-user)
- [User access token generation and expiration](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [Fine-grained PATs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [PR merge and permissions](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request)
- [Rulesets and bypass actors](https://docs.github.com/en/rest/repos/rules)
