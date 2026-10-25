import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { stageRuntimePackage } from './package.mjs';

const root = new URL('../', import.meta.url);

execFileSync(process.execPath, ['scripts/build.mjs'], {
  cwd: root,
  stdio: 'inherit',
});

rmSync(new URL('.tmp/lambda/', root), { recursive: true, force: true });
stageRuntimePackage(fileURLToPath(new URL('.tmp/lambda/', root)));

const scenarioArg = process.argv.find((value) => value.startsWith('validationScenario='));
const scenario =
  scenarioArg?.slice('validationScenario='.length) ??
  JSON.parse(process.env.CDK_CONTEXT_JSON ?? '{}').validationScenario;
if (scenario !== undefined) {
  rmSync(new URL('.tmp/validation-dist/', root), { recursive: true, force: true });
  execFileSync(
    process.execPath,
    ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.validation.json'],
    { cwd: root, stdio: 'inherit' },
  );
  rmSync(new URL('.tmp/lambda-validation/', root), { recursive: true, force: true });
  stageRuntimePackage(fileURLToPath(new URL('.tmp/lambda-validation/', root)), scenario);
}

execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.infra.json'], {
  cwd: root,
  stdio: 'inherit',
});
