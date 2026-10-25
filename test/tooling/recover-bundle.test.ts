import { expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';

const fixture = `
import hashlib, json, sys, tempfile, zipfile
from pathlib import Path
sys.path.insert(0, 'scripts')
from recover_bundle import recover
revision = 'a' * 40
scenario = sys.argv[1]
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    files = {'review.json': json.dumps({'revision': revision}), 'runtime.txt': 'same runtime'}
    files['checksums.json'] = json.dumps({key: hashlib.sha256(value.encode()).hexdigest() for key, value in files.items()})
    archive = root / 'artifact.zip'
    with zipfile.ZipFile(archive, 'w') as bundle:
        for key, value in files.items(): bundle.writestr(key, value)
        if scenario == 'ruta externa': bundle.writestr('../escape.txt', 'no')
        if scenario == 'ruta absoluta': bundle.writestr('/escape.txt', 'no')
        if scenario == 'enlace':
            item = zipfile.ZipInfo('link')
            item.external_attr = 0o120777 << 16
            bundle.writestr(item, '/tmp/no')
        if scenario == 'archivo adicional': bundle.writestr('extra.txt', 'no')
        if scenario == 'runtime alterado': bundle.writestr('runtime.txt', 'changed')
    digest = 'sha256:' + hashlib.sha256(archive.read_bytes()).hexdigest()
    run = {'id': 1, 'run_attempt': 2, 'conclusion': 'success', 'status': 'completed', 'head_sha': revision, 'head_branch': 'dev', 'event': 'push', 'path': '.github/workflows/ci.yml', 'repository': {'full_name': 'matigaleanodev/portfolio-api-cloud'}}
    artifact = {'name': f'test-assembly-{revision}-1-2', 'expired': False, 'digest': digest, 'workflow_run': {'id': 1, 'head_sha': revision}}
    if scenario == 'digest distinto': artifact['digest'] = 'sha256:' + 'b' * 64
    if scenario == 'CI fallida': run['conclusion'] = 'failure'
    if scenario == 'synthetic merge': run['event'] = 'pull_request'
    if scenario == 'otro repo': run['repository']['full_name'] = 'other/repo'
    if scenario == 'otra revisión': run['head_sha'] = 'b' * 40
    if scenario == 'otro run': artifact['workflow_run']['id'] = 99
    if scenario == 'otro intento': run['run_attempt'] = 3
    if scenario == 'vencido': artifact['expired'] = True
    if scenario == 'destino existente': (root / 'recovered').mkdir()
    recover(archive, artifact, run, root / 'recovered', revision, digest)
    assert (root / 'recovered/runtime.txt').read_text() == 'same runtime'
`;

test('Dado un artifact retenido de CI integrada, cuando se recupera, entonces verifica procedencia, digest y bytes sin AWS', () => {
  const result = spawnSync('python3', ['-c', fixture, 'válido'], {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin' },
  });
  expect(result.status, result.stderr).toBe(0);
});

test.each([
  'digest distinto',
  'CI fallida',
  'synthetic merge',
  'otro repo',
  'otra revisión',
  'otro run',
  'otro intento',
  'vencido',
  'ruta externa',
  'ruta absoluta',
  'enlace',
  'archivo adicional',
  'runtime alterado',
  'destino existente',
])(
  'Dado %s, cuando se recupera el artifact, entonces se rechaza antes de usar el assembly',
  (scenario) => {
    const result = spawnSync('python3', ['-c', fixture, scenario], {
      encoding: 'utf8',
      env: { PATH: '/usr/bin:/bin' },
    });
    expect(result.status, result.stderr).toBe(1);
  },
);
