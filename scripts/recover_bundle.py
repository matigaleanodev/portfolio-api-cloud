#!/usr/bin/env python3
"""Recupera un artifact GitHub autenticado por su run y digest; no consulta AWS."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import zipfile

from review_bundle import verify


def recover(archive: Path, artifact: dict, run: dict, output: Path, revision: str, digest: str) -> None:
    if not re.fullmatch(r'[a-f0-9]{40}', revision) or not re.fullmatch(r'sha256:[a-f0-9]{64}', digest):
        raise ValueError('Revisión o digest inválido')
    if run.get('conclusion') != 'success' or run.get('status') != 'completed':
        raise ValueError('La CI debe haber terminado correctamente')
    if run.get('head_sha') != revision or run.get('head_branch') not in ('main', 'dev') or run.get('event') != 'push':
        raise ValueError('Se requiere una revisión integrada con CI por push')
    if run.get('path') != '.github/workflows/ci.yml' or run.get('repository', {}).get('full_name') != 'matigaleanodev/portfolio-api-cloud':
        raise ValueError('Workflow o repositorio incorrecto')
    expected_names = {f'{prefix}-{revision}-{run["id"]}-{run["run_attempt"]}' for prefix in ('api-assembly', 'test-assembly')}
    if artifact.get('name') not in expected_names or artifact.get('expired') is not False:
        raise ValueError('Artifact inesperado o vencido')
    if artifact.get('workflow_run', {}).get('id') != run['id'] or artifact.get('workflow_run', {}).get('head_sha') != revision:
        raise ValueError('Artifact ajeno al run revisado')
    with archive.open('rb') as stream:
        archive_digest = 'sha256:' + hashlib.file_digest(stream, 'sha256').hexdigest()
    if artifact.get('digest') != digest or archive_digest != digest:
        raise ValueError('Digest distinto de GitHub o de la revisión')
    if output.exists():
        raise ValueError('El destino debe ser nuevo')
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        if len(entries) > 30000 or sum(item.file_size for item in entries) > 256 * 1024 * 1024:
            raise ValueError('Artifact fuera del tamaño previsto')
        names = set()
        for item in entries:
            path = PurePosixPath(item.filename)
            if not path.parts or path.is_absolute() or '..' in path.parts or '\\' in item.filename or ':' in item.filename:
                raise ValueError('Ruta insegura en ZIP')
            if path.as_posix() in names or stat.S_ISLNK(item.external_attr >> 16):
                raise ValueError('Duplicado o enlace simbólico en ZIP')
            names.add(path.as_posix())
        output.mkdir(parents=True)
        bundle.extractall(output)
    verify(output, revision)


if __name__ == '__main__':
    archive, artifact, run, output, revision, digest = sys.argv[1:]
    recover(Path(archive), json.loads(Path(artifact).read_text()), json.loads(Path(run).read_text()), Path(output), revision, digest)
    print('Artifact recuperado: run, revisión, digest e inventario verificados; sin acciones AWS.')