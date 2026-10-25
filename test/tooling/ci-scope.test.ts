import { afterEach, test, expect } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function fixture(application = false) {
  const root = mkdtempSync(join(tmpdir(), "api-scope-"));
  directories.push(root);
  if (application) {
    for (const name of [
      "package-lock.json",
      "tsconfig.json",
      "tsconfig.build.json",
      "src/handler.ts",
    ]) {
      mkdirSync(dirname(join(root, name)), { recursive: true });
      writeFileSync(join(root, name), "{}");
    }
    manifest(root, { typecheck: "tsc", build: "tsc", test: "vitest run" });
  }
  return root;
}
function manifest(root: string, scripts: Record<string, string>) {
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts }));
}
function detect(root: string) {
  return spawnSync(
    "python3",
    [
      "-c",
      `import importlib.util,json,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('scope',sys.argv[1]); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
print(json.dumps(module.detect(Path(sys.argv[2]))))`,
      resolve("scripts/ci_scope.py"),
      root,
    ],
    { encoding: "utf8", env: { PATH: "/usr/bin:/bin" } },
  );
}
test("CI-001 | Dado un repositorio documental, cuando CI detecta su alcance, entonces informa aplicación e infraestructura ausentes", () => {
  const result = detect(fixture());
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({
    application: "false",
    infrastructure: "false",
  });
});
test("CI-002 | Dada una aplicación completa sin CDK, cuando CI detecta su alcance, entonces exige solo las verificaciones de aplicación", () => {
  const result = detect(fixture(true));
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({
    application: "true",
    infrastructure: "false",
  });
});
test("CI-003 | Dados archivos de aplicación sin manifiesto, cuando CI detecta el alcance, entonces rechaza cada base huérfana", () => {
  for (const name of [
    "package-lock.json",
    "tsconfig.json",
    "src",
    "test",
    "cdk.json",
  ]) {
    const root = fixture();
    writeFileSync(join(root, name), "{}");
    expect(detect(root).status).not.toBe(0);
  }
});
test("CI-004 | Dada una aplicación incompleta, cuando faltan el lock o un script obligatorio, entonces CI falla sin omitir controles", () => {
  const root = fixture(true);
  unlinkSync(join(root, "package-lock.json"));
  expect(detect(root).status).not.toBe(0);
  writeFileSync(join(root, "package-lock.json"), "{}");
  manifest(root, { build: "tsc", test: "vitest run" });
  expect(detect(root).status).not.toBe(0);
});
test("CI-005 | Dada infraestructura CDK, cuando faltan sus verificaciones, entonces CI la rechaza hasta declarar test:infra y cdk", () => {
  const root = fixture(true);
  writeFileSync(join(root, "cdk.json"), "{}");
  expect(detect(root).status).not.toBe(0);
  manifest(root, {
    typecheck: "tsc",
    build: "tsc",
    test: "vitest run",
    "test:infra": "vitest run",
    cdk: "cdk",
  });
  const result = detect(root);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({
    application: "true",
    infrastructure: "true",
  });
});
