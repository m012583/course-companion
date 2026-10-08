"""Create a source ZIP with an explicit allowlist; no runtime data or credentials."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import json

root = Path(__file__).resolve().parent.parent
folders = ['app', 'components', 'hooks', 'lib', 'types', 'public', 'db', 'migrations', 'docs', 'tests', 'tools', '.openai']
names = ['.env.example', '.gitignore', '.oxfmtrc.json', '.oxlintrc.json', 'components.json', 'next-env.d.ts', 'next.config.ts', 'package.json', 'package-lock.json', 'README.md', 'README-PORTABLE.md', 'start.cmd', 'start.sh', 'tsconfig.json', 'vite.config.ts']
excluded = {'node_modules', '.git', '.wrangler', 'work', 'dist', '.vinext', '.next', '__pycache__', 'outputs', 'ocr'}
files = [root / name for name in names if (root / name).is_file()]
for folder in folders:
    directory = root / folder
    if directory.exists():
        files.extend(p for p in directory.rglob('*') if p.is_file() and not p.is_symlink() and not (set(p.relative_to(root).parts) & excluded) and not p.name.startswith('.env') and p.suffix not in {'.log', '.pyc'})
output_dir = root / 'outputs'
output_dir.mkdir(exist_ok=True)
output = output_dir / '课伴-研学增强版-0.3.0-20261008.zip'
manifest = {}
with ZipFile(output, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted(set(files)):
        relative = path.relative_to(root).as_posix()
        data = path.read_bytes()
        # Fail closed if a commonly formatted provider credential is accidentally present.
        import re
        if path.suffix in {'.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.txt'} and re.search(rb'\bsk-[a-zA-Z0-9_-]{24,}', data):
            raise RuntimeError(f'Possible credential in {relative}; no distributable is ready.')
        archive.writestr('课伴研学增强版/' + relative, data)
        manifest[relative] = hashlib.sha256(data).hexdigest()
    archive.writestr('课伴研学增强版/package-manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2))
with ZipFile(output) as archive:
    assert archive.testzip() is None
    assert not any('.env.local' in name or 'node_modules/' in name or '.wrangler/' in name for name in archive.namelist())
print(json.dumps({'path': str(output), 'files': len(manifest), 'bytes': output.stat().st_size, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}, ensure_ascii=False))
