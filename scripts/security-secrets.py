"""Scan the current candidate, not just commits; exception values are exact source-line hashes."""
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile
import shutil

root = pathlib.Path.cwd().resolve()
allowed = json.loads((root / 'scripts/security-secret-fixtures.json').read_text())
keys = {(item['path'], item['rule'], item['lineSha256']) for item in allowed}
with tempfile.TemporaryDirectory(prefix='awd-gitleaks-') as temp:
    report = pathlib.Path(temp) / 'report.json'
    snapshot = (pathlib.Path(temp) / 'source').resolve()
    snapshot.mkdir()
    paths = subprocess.check_output(['git', 'ls-files', '-z', '--cached']).decode().split('\0')
    for name in filter(None, paths):
        source = root / name
        if not source.is_file() or source.is_symlink():
            continue
        target = snapshot / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    result = subprocess.run(['gitleaks', 'dir', str(snapshot), '--redact=100', '--report-format=json', f'--report-path={report}', '--exit-code=1'], capture_output=True, text=True)
    if result.returncode not in [0, 1] or not report.exists():
        raise SystemExit('Gitleaks did not complete successfully')
    findings = json.loads(report.read_text())
    unexpected = []
    for item in findings:
        source = pathlib.Path(item['File'])
        if not source.is_absolute():
            source = snapshot / source
        source = source.resolve()
        name = str(source.relative_to(snapshot))
        lines = source.read_text().splitlines()
        # Never allow a multi-line secret or a changed value at an old line number.
        digest = hashlib.sha256(lines[item['StartLine'] - 1].encode()).hexdigest()
        if item['StartLine'] != item['EndLine'] or (name, item['RuleID'], digest) not in keys:
            unexpected.append({'path': name, 'line': item['StartLine'], 'rule': item['RuleID']})
    print(json.dumps({'scanned': 'current tracked/staged source (excludes untracked local data)', 'reviewed_synthetic_fixtures': len(findings) - len(unexpected), 'unapproved_findings': unexpected}, indent=2))
    if unexpected:
        raise SystemExit(1)
