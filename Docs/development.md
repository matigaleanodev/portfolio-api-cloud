# Development and testing

[Español](development.es.md)

Use Node from [.nvmrc](../.nvmrc), npm and Python 3. Dependency versions belong in the manifest and lock.

```bash
npm ci --ignore-scripts
npm run check
```

## Commands

| Command                | Scope                                                                             |
| ---------------------- | --------------------------------------------------------------------------------- |
| `npm run format:check` | Prettier formatting without writing.                                              |
| `npm run typecheck`    | Strict application and infrastructure types.                                      |
| `npm test`             | Vitest application, tooling and infrastructure suites.                            |
| `npm run test:app`     | Contracts, domain, providers and runtime controls.                                |
| `npm run test:tooling` | Validators and workflows with local fixtures.                                     |
| `npm run test:infra`   | CDK assertions and validation package.                                            |
| `npm run test:package` | Package smoke tests isolated from the checkout.                                   |
| `npm run check:docs`   | Required documents, ES/EN pairs and local links.                                  |
| `npm run check`        | Formatting, types, suites, packages, synthesis without lookups and documentation. |

`npm run format` applies formatting. `npm run build` generates ESM in `dist/`. The production entry point is `dist/handler.handler`; its package includes production dependencies and editorial fallback. `src/validation/` generates a separate variant with fictitious providers.

## Organization and tests

`src/` contains application and domain code; `infra/`, CDK; `scripts/`, build tools and validators; `test/`, contracts, fixtures and infrastructure/tooling. Cases use Spanish IDs and Given/When/Then wording.

Application and infrastructure suites block network access, AWS metadata and real providers. Tooling subprocesses receive a minimal environment and synthetic responses. Historical fixtures pin reference behavior: accepted differences are declared in tests without rewriting fixtures to conceal them.

Tests cover behavior, concurrency, expiration, cancellation and AWS commands. Smoke tests check packages outside the checkout. This does not establish provider availability, effective permissions or managed performance.

CI retains `verify` as the required aggregate check. Documentation keeps language pairs and links valid, without test counts or execution results in Markdown.

[Contracts](api.md) · [Protected delivery](operations.md)
