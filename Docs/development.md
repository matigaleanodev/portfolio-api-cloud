# Development and testing

[Español](development.es.md)

Use Node from [.nvmrc](../.nvmrc), npm and Python 3. Dependency versions belong in the manifests and the root lock.

```bash
npm ci --ignore-scripts
npm run check
```

## Commands

From the root:

| Command                  | Scope                                                                       |
| ------------------------ | --------------------------------------------------------------------------- |
| `npm run format:check`   | Prettier formatting without writing; `npm run format` applies it.           |
| `npm run typecheck`      | Strict types for each workspace, tests and infrastructure.                  |
| `npm run build`          | Compiles contracts and runtime and stages the artifacts in `.tmp/lambda-*`. |
| `npm test`               | Vitest application, editorial, tooling and infrastructure suites.           |
| `npm run test:app`       | HTTP contracts, domain, providers, Middy chain and runtime controls.        |
| `npm run test:editorial` | Editorial functions, publication state, OG and subscriber store.            |
| `npm run test:tooling`   | Validators and workflows with local fixtures.                               |
| `npm run test:infra`     | CDK assertions and validation variant.                                      |
| `npm run test:package`   | Artifacts packaged and verified outside the checkout.                       |
| `npm run boundaries`     | Import, dependency and version limits between packages.                     |
| `npm run synth:local`    | CDK synthesis with fictitious credentials and no lookups.                   |
| `npm run check:docs`     | Required documents, ES/EN pairs and local links.                            |
| `npm run check`          | Boundaries, formatting, types, suites, artifacts, local synthesis and docs. |

Each workspace exposes its scripts through `npm --workspace`: for example `npm run typecheck --workspace=@portfolio-api-cloud/runtime` or `npm run synth --workspace=@portfolio-api-cloud/infrastructure` (synthesis without lookups that does use the inherited AWS environment; `synth:local` discards it).

## Organization

- `packages/contracts`: neutral data shared by runtime, infrastructure and tests. Exports TypeScript through explicit subpaths (`/routes`, `/functions`, `/configuration`...).
- `packages/runtime/src`: `http/` (scope, Middy chain, router, per-function composition), `handlers/` (one entry point per function), `chat/`, `subscriptions/`, `editorial/`, `validation/` and shared configuration, ingress and control modules.
- `packages/runtime/dev`: manual utilities outside the build and tests (OG rendering, editorial invocations, subscriber migration). Compile them with `npx tsc -p packages/runtime/dev`; without `--execute` they only print what they would do.
- `packages/infrastructure`: CDK stack and reviewed templates.
- `scripts/`: build, packaging, validators and delivery tools; `test/`: suites, fixtures and support.

Cases use Spanish IDs and Given/When/Then wording.

## Artifacts

`npm run build` produces six directories: `api`, `chat`, `editorial`, `og`, `validation-api` and `validation-chat`. Each receives only the compiled files reachable from its entry points and the production dependencies allowed in [package.mjs](../scripts/package.mjs); an import outside the list fails the build. `api` and `chat` include the editorial fallback, `og` includes the fonts and resvg's linux-x64 native binary, and the validation variants exist only for synthesis with fictitious providers.

`npm run test:package` builds deterministic ZIPs, extracts them outside the checkout with verified paths and runs each entry point with network access blocked and simulated SDKs. It checks contents, dependencies and that the OG render matches the reference from the compiled runtime.

## Testing

Application, editorial and infrastructure suites block network access, AWS metadata and real providers. Tooling subprocesses receive a minimal environment and synthetic responses. Reference fixtures pin inherited behavior: accepted differences are declared in tests without rewriting fixtures to conceal them.

Tests cover behavior, concurrency, expiration, cancellation and AWS commands. They do not establish provider availability, effective permissions or managed performance.

`npm run synth:local` replaces inherited `AWS_*` and `CDK_*` variables with fictitious credentials, synthesizes without querying the account and reviews the template (six functions and no broad permissions). CI retains `verify` as the required aggregate check.

[Contracts](api.md) · [Protected delivery](operations.md)
