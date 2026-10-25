import { afterEach, test, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const blocks = [
  ...readFileSync(".github/workflows/merge.yml", "utf8").matchAll(
    /python3 - <<'PY'\n([\s\S]*?)\n          PY/g,
  ),
].map((match) =>
  match[1]!
    .split("\n")
    .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
    .join("\n"),
);
const sha = "a".repeat(40),
  mergeSha = "b".repeat(40);
const user = { login: "matigaleanodev", id: 99203645, type: "User" };
const repo = { full_name: "matigaleanodev/portfolio-api-cloud" };
const conditions = {
  ref_name: { include: ["refs/heads/main", "refs/heads/dev"], exclude: [] },
};
const baseline: Record<string, unknown> = {
  "reviewed-pr.json": {
    state: "open",
    draft: false,
    head: { sha, repo, ref: "feat/typescript-handlers" },
    base: { repo, ref: "dev" },
  },
  "merge-user.json": user,
  "update-rules.json": {
    enforcement: "active",
    conditions,
    rules: [{ type: "update" }],
    current_user_can_bypass: "pull_requests_only",
  },
  "quality-rules.json": {
    enforcement: "active",
    conditions,
    current_user_can_bypass: "never",
    rules: [
      {
        type: "pull_request",
        parameters: {
          required_review_thread_resolution: true,
          allowed_merge_methods: ["merge"],
        },
      },
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: [
            { context: "verify", integration_id: 15368 },
          ],
        },
      },
      { type: "deletion" },
      { type: "non_fast_forward" },
    ],
  },
  "merge-result.json": { merged: true, sha: mergeSha },
  "merged-pr.json": {
    merged: true,
    merge_commit_sha: mergeSha,
    head: { sha },
    merged_by: user,
    html_url: "https://example.invalid/pull/1",
  },
};
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function run(
  index: number,
  file?: string,
  path: string[] = [],
  value?: unknown,
) {
  expect(blocks).toHaveLength(4);
  const files = structuredClone(baseline);
  if (file) {
    let node = files[file] as Record<string, unknown>;
    for (const key of path.slice(0, -1))
      node = node[key] as Record<string, unknown>;
    node[path.at(-1)!] = value;
  }
  const directory = mkdtempSync(join(tmpdir(), "api-merge-"));
  directories.push(directory);
  for (const [name, content] of Object.entries(files))
    writeFileSync(join(directory, name), JSON.stringify(content));
  return spawnSync("python3", ["-c", blocks[index]!], {
    encoding: "utf8",
    env: {
      PATH: "/usr/bin:/bin",
      RUNNER_TEMP: directory,
      REVIEWED_HEAD_SHA: sha,
      GH_REPO: repo.full_name,
      GITHUB_REF_NAME: "dev",
    },
  }).status;
}
test("INT-001 | Dado un PR revisado, cuando cambia su SHA, prefijo o base, entonces se rechaza la integración", () => {
  expect(run(0)).toBe(0);
  for (const [path, value] of [
    [["head", "sha"], "c".repeat(40)],
    [["head", "ref"], "codex/invalid"],
    [["base", "ref"], "main"],
  ] as const) {
    expect(run(0, "reviewed-pr.json", [...path], value)).not.toBe(0);
  }
});
test("INT-002 | Dada la identidad autorizada, cuando cambia el login, ID o tipo de cuenta, entonces se rechaza el actor", () => {
  expect(run(1)).toBe(0);
  for (const [field, value] of [
    ["login", "other"],
    ["id", 123],
    ["type", "Bot"],
  ] as const)
    expect(run(1, "merge-user.json", [field], value)).not.toBe(0);
});
test("INT-003 | Dadas ramas protegidas, cuando falta el permiso por PR o existe bypass amplio, entonces se impide continuar", () => {
  expect(run(2)).toBe(0);
  for (const value of ["never", "always", null])
    expect(
      run(2, "update-rules.json", ["current_user_can_bypass"], value),
    ).not.toBe(0);
});
test("INT-004 | Dadas reglas de calidad, cuando se desactivan, admiten bypass o pierden protección de refs, entonces falla la validación", () => {
  expect(run(2)).toBe(0);
  expect(
    run(2, "quality-rules.json", ["current_user_can_bypass"], "always"),
  ).not.toBe(0);
  expect(run(2, "quality-rules.json", ["enforcement"], "disabled")).not.toBe(0);
  const quality = baseline["quality-rules.json"] as { rules: unknown[] };
  expect(
    run(2, "quality-rules.json", ["rules"], quality.rules.slice(0, -1)),
  ).not.toBe(0);
});
test("INT-005 | Dado el check verify obligatorio, cuando cambia su integración, nombre o exigencia de base actualizada, entonces se rechaza", () => {
  expect(
    run(
      2,
      "quality-rules.json",
      [
        "rules",
        "1",
        "parameters",
        "required_status_checks",
        "0",
        "integration_id",
      ],
      999,
    ),
  ).not.toBe(0);
  expect(
    run(
      2,
      "quality-rules.json",
      ["rules", "1", "parameters", "required_status_checks", "0", "context"],
      "other",
    ),
  ).not.toBe(0);
  expect(
    run(
      2,
      "quality-rules.json",
      ["rules", "1", "parameters", "strict_required_status_checks_policy"],
      false,
    ),
  ).not.toBe(0);
});
test("INT-006 | Dado un merge informado por GitHub, cuando el actor es bot o difiere el commit, entonces no se confirma como válido", () => {
  expect(run(3)).toBe(0);
  expect(run(3, "merged-pr.json", ["merged_by", "type"], "Bot")).not.toBe(0);
  expect(
    run(3, "merged-pr.json", ["merge_commit_sha"], "c".repeat(40)),
  ).not.toBe(0);
});
test("INT-007 | Dado el SHA revisado, cuando el PR fusionado tiene otro head, entonces no se registra como éxito", () => {
  expect(run(3, "merged-pr.json", ["head", "sha"], "c".repeat(40))).not.toBe(0);
});
