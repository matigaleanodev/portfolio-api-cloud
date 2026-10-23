"""Ejecuta las validaciones reales del workflow con respuestas GitHub ficticias."""
from copy import deepcopy
import json
import os
from pathlib import Path
import re
import tempfile
import textwrap
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
BLOCKS = [
    textwrap.dedent(block)
    for block in re.findall(r"python3 - <<'PY'\n(.*?)\n          PY", (ROOT / ".github/workflows/merge.yml").read_text(), re.S)
]
SHA = "a" * 40
MERGE_SHA = "b" * 40
USER = {"login": "matigaleanodev", "id": 99203645, "type": "User"}


class MergeWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        repo = {"full_name": "matigaleanodev/portfolio-api-cloud"}
        conditions = {"ref_name": {"include": ["refs/heads/main", "refs/heads/dev"], "exclude": []}}
        self.files = {
            "reviewed-pr.json": {"state": "open", "draft": False,
                "head": {"sha": SHA, "repo": repo, "ref": "feat/typescript-handlers"},
                "base": {"repo": repo, "ref": "dev"}},
            "merge-user.json": deepcopy(USER),
            "update-rules.json": {"enforcement": "active", "conditions": deepcopy(conditions),
                "rules": [{"type": "update"}], "current_user_can_bypass": "pull_requests_only"},
            "quality-rules.json": {"enforcement": "active", "conditions": deepcopy(conditions),
                "current_user_can_bypass": "never", "rules": [
                    {"type": "pull_request", "parameters": {
                        "required_review_thread_resolution": True, "allowed_merge_methods": ["merge"]}},
                    {"type": "required_status_checks", "parameters": {
                        "strict_required_status_checks_policy": True,
                        "required_status_checks": [{"context": "verify", "integration_id": 15368}]}},
                    {"type": "deletion"}, {"type": "non_fast_forward"}]},
            "merge-result.json": {"merged": True, "sha": MERGE_SHA},
            "merged-pr.json": {"merged": True, "merge_commit_sha": MERGE_SHA, "head": {"sha": SHA},
                "merged_by": deepcopy(USER), "html_url": "https://example.invalid/pull/1"},
        }

    def run_block(self, index):
        self.assertEqual(len(BLOCKS), 4)
        for name, data in self.files.items():
            (Path(self.directory.name) / name).write_text(json.dumps(data))
        with patch.dict(os.environ, {"RUNNER_TEMP": self.directory.name, "REVIEWED_HEAD_SHA": SHA,
                                     "GH_REPO": "matigaleanodev/portfolio-api-cloud", "GITHUB_REF_NAME": "dev"}):
            with patch("builtins.print"):
                exec(compile(BLOCKS[index], "merge.yml", "exec"), {})

    def test_reviewed_pr_accepts_only_expected_head_and_base(self):
        """El PR revisado pasa; otro SHA, base o prefijo falla."""
        self.run_block(0)
        for field, value in [("sha", "c" * 40), ("ref", "codex/invalid")]:
            with self.subTest(field=field):
                previous = deepcopy(self.files["reviewed-pr.json"])
                self.files["reviewed-pr.json"]["head"][field] = value
                with self.assertRaises(AssertionError):
                    self.run_block(0)
                self.files["reviewed-pr.json"] = previous
        self.files["reviewed-pr.json"]["base"]["ref"] = "main"
        with self.assertRaises(AssertionError):
            self.run_block(0)

    def test_user_identity_rejects_bots_and_other_accounts(self):
        """Login, ID y tipo deben pertenecer a la cuenta humana prevista."""
        self.run_block(1)
        for field, value in [("login", "other"), ("id", 123), ("type", "Bot")]:
            with self.subTest(field=field):
                self.files["merge-user.json"] = dict(USER, **{field: value})
                with self.assertRaises(AssertionError):
                    self.run_block(1)

    def test_protected_access_accepts_only_pull_request_permission(self):
        """Sin acceso o con bypass amplio se corta antes del merge."""
        self.run_block(2)
        for value in ["never", "always", None]:
            with self.subTest(value=value):
                self.files["update-rules.json"]["current_user_can_bypass"] = value
                with self.assertRaises(AssertionError):
                    self.run_block(2)

    def test_quality_rules_must_apply_without_bypass(self):
        """PR, CI estricta, protección de refs y conversaciones siguen obligatorios."""
        self.run_block(2)
        previous = deepcopy(self.files["quality-rules.json"])
        for key, value in [("current_user_can_bypass", "always"), ("enforcement", "disabled")]:
            with self.subTest(key=key):
                self.files["quality-rules.json"] = dict(previous, **{key: value})
                with self.assertRaises(AssertionError):
                    self.run_block(2)
        self.files["quality-rules.json"] = deepcopy(previous)
        self.files["quality-rules.json"]["rules"] = previous["rules"][:-1]
        with self.assertRaises(AssertionError):
            self.run_block(2)

    def test_verify_check_cannot_change_identity_or_strictness(self):
        """Un verify ajeno a GitHub Actions o una base desactualizada se rechaza."""
        for field, value in [("integration_id", 999), ("context", "other")]:
            with self.subTest(field=field):
                checks = self.files["quality-rules.json"]["rules"][1]["parameters"]
                checks["required_status_checks"] = [{"context": "verify", "integration_id": 15368}]
                checks["required_status_checks"][0][field] = value
                with self.assertRaises(AssertionError):
                    self.run_block(2)
        checks["required_status_checks"] = [{"context": "verify", "integration_id": 15368}]
        checks["strict_required_status_checks_policy"] = False
        with self.assertRaises(AssertionError):
            self.run_block(2)

    def test_merge_confirmation_uses_github_actor_and_actual_commit(self):
        """La respuesta real debe confirmar SHA, resultado e identidad humana."""
        self.run_block(3)
        self.files["merged-pr.json"]["merged_by"]["type"] = "Bot"
        with self.assertRaises(AssertionError):
            self.run_block(3)
        self.files["merged-pr.json"]["merged_by"] = deepcopy(USER)
        self.files["merged-pr.json"]["merge_commit_sha"] = "c" * 40
        with self.assertRaises(AssertionError):
            self.run_block(3)

    def test_modified_head_is_not_confirmed_as_reviewed(self):
        """Un head distinto al revisado no se registra como éxito."""
        self.files["merged-pr.json"]["head"]["sha"] = "c" * 40
        with self.assertRaises(AssertionError):
            self.run_block(3)


if __name__ == "__main__":
    unittest.main()
