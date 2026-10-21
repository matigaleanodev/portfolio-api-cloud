# Portfolio API Cloud

[Español](README.es.md)

Alternative implementation of Portfolio's public API using TypeScript handlers and managed services. Serverless migration is decided; the NestJS comparison retains technical evidence of behavior and implementation tradeoffs.

## Delivery status

This repository versions planning, audit, decisions and local experiment results. The experimental prototype is discarded after its evidence is recorded; it is not the new API's code foundation. The next increment builds that initial structure.

This delivery has no production application or CDK stack implementation. The original NestJS API remains operational and is retained as an independent implementation. Local results are not AWS cold starts or proof of monthly savings.

## Scope

- Six contracts: health, contact, starters, chat and subscribe/unsubscribe.
- portfolio retains frontend, static editorial content and hosting.
- portfolio-cloud retains subscribers, notifications, OG, releases and knowledge publication.
- The alternative preserves HTTP and behavior so the frontend can change implementation; URL or routing may need configuration.
- APIs belonging to unrelated domains are not interchanged.

## Documentation

1. [Audit and contracts](Docs/audit.md)
2. [Architecture](Docs/architecture.md)
3. [Hypothetical costs and auxiliary services](Docs/costs.md)
4. [Migration, bot refresh and recovery](Docs/migration.md)
5. [Decisions](Docs/decisions.md)
6. [Prepared CI/CD](Docs/ci-cd.md)
7. [Runtime comparison](Docs/runtime-evaluation.md)
8. [Local results](Docs/local-runtime.md)
9. [Provenance, samples and dependencies](Docs/runtime-evidence.md)
10. [Branch protection](Docs/branch-protection.md)
11. [Sources](Docs/sources.md)

## Transition and delivery

All three current APIs remain operational throughout migration. EC2 will be stopped after all three migrate and recovery is verified, retaining the instance without termination or dismantling and with a recoverable backup. Retained resources belong in total cost.

Refreshing bot data about the profile and projects is the final step before production deployment. Scope includes the published artifact, fallback and final-package validation, with a recoverable previous version.

Work branches use feat/fix. main/dev require PRs, CI and workflow merges. PR #1 is integrated into dev, restrictions were restored and the dedicated App remains pending. TypeScript CDK is the preferred infrastructure option; roles/bootstrap and traffic switching remain open.

Documentation-only checkout validation is python3 scripts/check_docs.py. It does not include npm commands from the discarded experiment. Development environment: Ubuntu-26.04 on WSL.
