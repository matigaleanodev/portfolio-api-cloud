import { rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stageAllArtifacts, validationScenarios } from './package.mjs';

const root = new URL('../', import.meta.url);
const tsc = fileURLToPath(new URL('node_modules/typescript/bin/tsc', root));
const compile = (directory, project = 'tsconfig.build.json') =>
  execFileSync(process.execPath, [tsc, '-p', project], { cwd: directory, stdio: 'inherit' });

const scenarioArg = process.argv.find((value) => value.startsWith('validationScenario='));
const scenario = scenarioArg?.slice('validationScenario='.length) ?? 'success';
if (!validationScenarios.includes(scenario)) throw new Error('Invalid validation scenario');

// Contratos compilados para los artifacts; el runtime los resuelve como dependencia.
for (const workspace of ['packages/contracts/', 'packages/runtime/']) {
  const directory = new URL(workspace, root);
  rmSync(new URL('dist/', directory), { recursive: true, force: true });
  compile(directory);
}
// Variante de validación: incluye src/validation; nunca se copia a los artifacts normales.
rmSync(new URL('.tmp/validation-dist/', root), { recursive: true, force: true });
compile(new URL('packages/runtime/', root), 'tsconfig.validation.json');

for (const { name, directory, packages } of stageAllArtifacts(scenario))
  console.info(`artifact ${name}: ${directory} (${packages.length} paquetes)`);
