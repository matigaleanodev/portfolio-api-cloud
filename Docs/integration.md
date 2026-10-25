# Integration attributed to the account

[Español](integration.es.md) · 2026-10-24.

## Decision and status

New automated merges must be attributed to **matigaleanodev** (ID 99203645). The credential performing the operation determines identity, confirmed through GitHub's `merged_by`. Changing author/committer, merge title or date does not change the authenticated actor.

The workflow replaces the installation token with environment `merge` user secret `MERGE_USER_TOKEN`. It verifies login, ID and User type; retains same-repository PRs, main/dev base, full reviewed SHA, required checks, serial execution and API merge without --admin. It does not check out or execute PR code with credentials. Missing valid credentials or effective access fails before integration, without App fallback.

The mechanism is installed on dev after PR #5. [Updates](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799501) allows matigaleanodev through PRs only; [quality](https://github.com/matigaleanodev/portfolio-api-cloud/rules/25799502) retains zero bypass with unchanged rules.

## Required credential

The following alternatives attribute activity to a human account:

| Alternative                                            | Scope and maintenance                                                                                                                                                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing user OAuth credential — current configuration | GitHub CLI credential with broad repo and workflow scopes; its configuration is preserved and it is stored only as an environment secret. It does not change the account's ruleset access.                                                                                |
| Fine-grained PAT belonging to matigaleanodev           | Select only portfolio-api-cloud and a short expiry. Contents write for merge, Pull requests read for PR verification and Workflows write for this delivery modifying workflows; implicit Metadata read. No Administration write or access to other repositories required. |
| Dedicated App user access token                        | Requires explicit OAuth authorization by the account. Permissions intersect user and App access; installation-token bypass must not be assumed to transfer. Default expiry is 8 hours; renewal requires a protected refresh token.                                        |

Current configuration reuses user OAuth; a dedicated granular PAT remains an alternative to reduce scope without adding an App OAuth renewal service. MERGE_USER_TOKEN stays in the protected environment, with no value in documentation, conversation, arguments or logs. An installation private key is not converted into human identity. The read-only GITHUB_TOKEN retains check validation, so the merge credential needs no additional Checks access.

The existing GitHub CLI OAuth credential was stored as MERGE_USER_TOKEN in environment merge. GET /user verified login matigaleanodev, ID 99203645 and User type; the environment still admits only main/dev. No new token, expanded scopes, permission changes or expiry changes were introduced. The value was transferred through stdin without file storage or display. The workflow will repeat GET /user before integration.

## Protected transition completed

[Preparatory PR #5](https://github.com/matigaleanodev/portfolio-api-cloud/pull/5) installed the new workflow through one final App merge, with passing CI and existing protections. Only the update actor was then replaced with **User 99203645**, **pull_request** mode. Effective verification returns `current_user_can_bypass=pull_requests_only`.

The quality ruleset remains identical with no bypass: PRs, GitHub Actions verify, an updated base, resolved conversations and deletion/force protection remain required. Environment merge still admits only main/dev. No temporary feat/ access, protection removal or previous recovery path was introduced.

The account could now also merge a PR through the UI; a ruleset distinguishes actors rather than where a token was used. Operational policy still requires the workflow exclusively, without manual merges, direct pushes or --admin.

A token identifies the user, while effective rules determine authorization. The workflow checks both before requesting a merge, and GitHub applies the rules again to the exact SHA. Each integration's attribution is confirmed through PR `merged_by`, for example [application PR #4](https://github.com/matigaleanodev/portfolio-api-cloud/pull/4).

## Local verification

Seven tests execute the workflow's actual Python blocks using fictional responses: reviewed PR SHA/base/prefix, expected user versus bots/other accounts, PR-only access versus missing/broad bypass, active rules and no quality bypass, GitHub Actions verify and updated base, actual actor/commit and rejection of a changed head. Actionlint checks YAML and shell scripts. These do not verify a new token's real permissions or a remote merge.

## Sources

- [GitHub App authentication identities](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/about-authentication-with-a-github-app)
- [Activity on behalf of a user](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-with-a-github-app-on-behalf-of-a-user)
- [User access token generation and expiration](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [Fine-grained PATs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [PR merge and permissions](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request)
- [Rulesets and bypass actors](https://docs.github.com/en/rest/repos/rules)
