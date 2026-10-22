"""Prueba que la detección de CI no omita aplicación ni exija CDK ficticio."""
import json
from pathlib import Path
import tempfile
import unittest
from ci_scope import detect


class ScopeTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)

    def application(self):
        for name in ["package-lock.json", "tsconfig.json", "tsconfig.build.json", "src/handler.ts"]:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("{}")
        self.manifest({"typecheck": "tsc --noEmit", "build": "tsc", "test": "node --test"})

    def manifest(self, scripts):
        (self.root / "package.json").write_text(json.dumps({"scripts": scripts}))

    def test_documentation_only(self):
        """Sin fuentes solo se informa documentación."""
        self.assertEqual(detect(self.root), {"application": "false", "infrastructure": "false"})

    def test_application_without_cdk(self):
        """Aplicación completa no requiere stack ficticia."""
        self.application()
        self.assertEqual(detect(self.root), {"application": "true", "infrastructure": "false"})

    def test_orphan_markers_fail(self):
        """Restos de aplicación o CDK sin manifiesto fallan."""
        for name in ["package-lock.json", "tsconfig.json", "src", "test", "cdk.json"]:
            with self.subTest(name=name):
                target = self.root / name
                target.write_text("{}")
                with self.assertRaises(ValueError):
                    detect(self.root)
                target.unlink()

    def test_incomplete_application_fails(self):
        """No se omiten checks cuando faltan archivos o scripts."""
        self.application()
        (self.root / "package-lock.json").unlink()
        with self.assertRaises(ValueError):
            detect(self.root)
        (self.root / "package-lock.json").write_text("{}")
        self.manifest({"build": "tsc", "test": "node --test"})
        with self.assertRaises(ValueError):
            detect(self.root)

    def test_infrastructure_requires_its_checks(self):
        """CDK activa una validación adicional obligatoria."""
        self.application()
        (self.root / "cdk.json").write_text("{}")
        with self.assertRaises(ValueError):
            detect(self.root)
        self.manifest({"typecheck": "tsc", "build": "tsc", "test": "node --test", "test:infra": "node --test", "cdk": "cdk"})
        self.assertEqual(detect(self.root), {"application": "true", "infrastructure": "true"})


if __name__ == "__main__":
    unittest.main()
