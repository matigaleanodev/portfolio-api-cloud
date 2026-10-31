import { artifactDirectory, artifacts } from './package.mjs';
import { cpSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const checkout = fileURLToPath(root);
const workspace = mkdtempSync(join(tmpdir(), 'portfolio-api-cloud-package-'));
if (!relative(checkout, workspace).startsWith('..'))
  throw new Error('Workspace dentro del checkout');

// ZIP determinista (como el asset de CDK) y extracción con rutas verificadas.
const zipTool = [
  'import pathlib, sys, zipfile',
  'mode, archive, directory = sys.argv[1], pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])',
  'if mode == "create":',
  '    files = sorted(p for p in directory.rglob("*") if p.is_file())',
  '    assert all(not p.is_symlink() for p in directory.rglob("*")), "symlink en artifact"',
  '    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:',
  '        for p in files:',
  '            info = zipfile.ZipInfo(p.relative_to(directory).as_posix(), (1980, 1, 1, 0, 0, 0))',
  '            info.compress_type = zipfile.ZIP_DEFLATED',
  '            info.external_attr = (0o100755 if p.stat().st_mode & 0o111 else 0o100644) << 16',
  '            z.writestr(info, p.read_bytes())',
  'else:',
  '    target = directory.resolve()',
  '    with zipfile.ZipFile(archive) as z:',
  '        for name in z.namelist():',
  '            dest = (target / name).resolve()',
  '            assert dest.is_relative_to(target) and not name.startswith("/"), name',
  '        z.extractall(target)',
].join('\n');
const zip = (...args) =>
  execFileSync('python3', ['-I', '-c', zipTool, ...args], { stdio: 'inherit' });

try {
  execFileSync(process.execPath, [fileURLToPath(new URL('scripts/build.mjs', root))], {
    cwd: root,
    stdio: 'inherit',
  });

  // Render de referencia desde el runtime compilado del checkout (mismo SVG que portfolio-cloud).
  const referenceOg =
    process.arch === 'x64' && process.platform === 'linux'
      ? execFileSync(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            `const { generateOgImage } = await import(${JSON.stringify(
              new URL('packages/runtime/dist/editorial/og.js', root).href,
            )});
            const image = await generateOgImage({
              title: 'Test flujo completo de Resend y OG',
              excerpt: 'Pipeline editorial serverless con AWS Lambda, R2 y Resend alineado visualmente con el portfolio.',
              tags: ['aws', 'serverless', 'blog'],
            });
            const { createHash } = await import('node:crypto');
            process.stdout.write(createHash('sha256').update(image).digest('hex'));`,
          ],
          { cwd: root, encoding: 'utf8' },
        )
      : undefined;

  const sizes = [];
  for (const name of Object.keys(artifacts)) {
    const archive = join(workspace, `${name}.zip`);
    const extracted = join(workspace, 'extract', name);
    mkdirSync(extracted, { recursive: true });
    zip('create', archive, artifactDirectory(name));
    zip('extract', archive, extracted);
    sizes.push({ name, bytes: statSync(archive).size });
    cpSync(new URL('test/block-network.mjs', root), join(extracted, 'block-network.mjs'));
    cpSync(new URL('test/artifact-smoke.mjs', root), join(extracted, 'artifact-smoke.mjs'));
    execFileSync(
      process.execPath,
      ['--import', './block-network.mjs', './artifact-smoke.mjs', name],
      {
        cwd: extracted,
        stdio: 'inherit',
        env: {
          NODE_ENV: 'test',
          AWS_EC2_METADATA_DISABLED: 'true',
          ...(referenceOg ? { REFERENCE_OG_SHA256: referenceOg } : {}),
        },
      },
    );
  }
  for (const { name, bytes } of sizes)
    console.info(`${name}.zip ${(bytes / 1024 / 1024).toFixed(2)} MiB (${bytes} bytes)`);
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
