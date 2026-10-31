#!/usr/bin/env python3
"""Detecta aplicación e infraestructura por separado y rechaza bases incompletas."""
import json
from pathlib import Path

# Workspaces y handlers del catálogo de funciones; el lockfile es único en la raíz.
APPLICATION_FILES = [
    "package-lock.json",
    "tsconfig.json",
    "packages/contracts/package.json",
    "packages/runtime/package.json",
    "packages/runtime/tsconfig.build.json",
    *(
        f"packages/runtime/src/handlers/{name}.ts"
        for name in ["api", "chat", "process-release", "generate-og", "notify-post", "publish-chat-knowledge"]
    ),
]
APPLICATION_SCRIPTS = ["typecheck", "build", "test", "test:app", "test:editorial", "test:tooling", "test:package", "boundaries"]
INFRASTRUCTURE_FILES = ["packages/infrastructure/package.json", "packages/infrastructure/src/app.ts"]
INFRASTRUCTURE_SCRIPTS = ["test:infra", "synth:local", "cdk"]


def detect(root: Path) -> dict[str, str]:
    application = (root / "package.json").is_file()
    infrastructure = (root / "cdk.json").is_file()
    if not application:
        markers = ["package-lock.json", "tsconfig.json", "packages", "test", "cdk.json"]
        if any((root / name).exists() for name in markers):
            raise ValueError("Hay aplicación o infraestructura sin package.json")
    else:
        required_files = APPLICATION_FILES + (INFRASTRUCTURE_FILES if infrastructure else [])
        for name in required_files:
            if not (root / name).is_file():
                raise ValueError(f"Falta {name}")
        for path in (root / "packages").rglob("package-lock.json"):
            if "node_modules" in path.parts:
                continue
            raise ValueError(f"Lockfile por paquete: {path.relative_to(root)}")
        scripts = json.loads((root / "package.json").read_text())["scripts"]
        required = APPLICATION_SCRIPTS + (INFRASTRUCTURE_SCRIPTS if infrastructure else [])
        if any(not scripts.get(name) for name in required):
            raise ValueError(f"Scripts requeridos: {required}")
    return {"application": str(application).lower(), "infrastructure": str(infrastructure).lower()}


if __name__ == "__main__":
    for key, value in detect(Path(__file__).resolve().parents[1]).items():
        print(f"{key}={value}")
