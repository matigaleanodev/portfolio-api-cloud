#!/usr/bin/env python3
"""Valida pares de idiomas y enlaces Markdown locales sin acceder a la red."""
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]

def check(root: Path) -> list[str]:
    errors: list[str] = []
    required = ["README.md", "README.es.md"]
    for name in ["audit", "architecture", "costs", "migration", "decisions", "ci-cd", "sources", "branch-protection", "runtime-evaluation"]:
        required.extend([f"Docs/{name}.md", f"Docs/{name}.es.md"])
    for name in required:
        if not (root / name).is_file():
            errors.append(f"Falta {name}")
    documents = list(root.glob("README*.md")) + list((root / "Docs").rglob("*.md"))
    for doc in documents:
        counterpart = doc.with_name(doc.name.replace(".es.md", ".md") if doc.name.endswith(".es.md") else doc.stem + ".es.md")
        if not counterpart.is_file():
            errors.append(f"Falta par de idioma: {doc.relative_to(root)}")
        content = doc.read_text(encoding="utf-8")
        if not content.strip() or "\ufffd" in content:
            errors.append(f"Contenido vacío o codificación inválida: {doc.relative_to(root)}")
        for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", content):
            target = target.strip().strip("<>")
            if not target or target.startswith("#") or urlsplit(target).scheme:
                continue
            path = (doc.parent / unquote(target.split("#", 1)[0])).resolve()
            if not path.is_relative_to(root.resolve()) or not path.exists():
                errors.append(f"Enlace local inválido: {doc.relative_to(root)} -> {target}")
    return errors

if __name__ == "__main__":
    errors = check(ROOT)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        raise SystemExit(1)
    print("Documentación: pares de idiomas y enlaces locales válidos.")
