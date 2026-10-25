#!/usr/bin/env python3
"""Detecta aplicación e infraestructura por separado y rechaza bases incompletas."""
import json
from pathlib import Path


def detect(root: Path) -> dict[str, str]:
    application = (root / "package.json").is_file()
    infrastructure = (root / "cdk.json").is_file()
    if not application:
        markers = ["package-lock.json", "tsconfig.json", "src", "test", "cdk.json"]
        if any((root / name).exists() for name in markers):
            raise ValueError("Hay aplicación o infraestructura sin package.json")
    else:
        for name in ["package-lock.json", "tsconfig.json", "tsconfig.build.json", "src/handler.ts"]:
            if not (root / name).is_file():
                raise ValueError(f"Falta {name}")
        scripts = json.loads((root / "package.json").read_text())["scripts"]
        required = ["typecheck", "build", "test"]
        if infrastructure:
            required.extend(["test:infra", "cdk"])
        if any(not scripts.get(name) for name in required):
            raise ValueError(f"Scripts requeridos: {required}")
    return {"application": str(application).lower(), "infrastructure": str(infrastructure).lower()}


if __name__ == "__main__":
    for key, value in detect(Path(__file__).resolve().parents[1]).items():
        print(f"{key}={value}")
