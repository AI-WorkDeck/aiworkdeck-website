"""Pinned community security rules; scan errors and non-reviewed findings fail closed."""
import json
import pathlib
import subprocess
import sys
import tempfile
import shutil
import yaml

RULES_COMMIT = '16b9e6d45f10649f6a531ec4838ed9924372c3bc'
rules_root = pathlib.Path(sys.argv[1]).resolve()
if subprocess.check_output(['git', '-C', str(rules_root), 'rev-parse', 'HEAD'], text=True).strip() != RULES_COMMIT:
    raise SystemExit('Unreviewed rule revision')
rules = []
for language in ['javascript', 'typescript', 'python', 'bash', 'yaml/github-actions']:
    for source in sorted((rules_root / language).rglob('*.yaml')):
        if '.test.' in source.name:
            continue
        for rule in (yaml.safe_load(source.read_text()) or {}).get('rules', []):
            metadata = rule.get('metadata', {})
            if metadata.get('category') != 'security' or (metadata.get('confidence') not in ['HIGH', 'MEDIUM'] and language != 'bash'):
                continue
            # These two upstream YAML/Bash embedded-language rules raise an internal
            # matching error with the pinned engine. Scan extracted run steps below.
            if language == 'yaml/github-actions' and rule['id'] in ['curl-eval', 'gha-curl-pipe-shell']:
                continue
            rule['id'] = '.'.join(source.relative_to(rules_root).parent.parts) + '.' + rule['id']
            rules.append(rule)
if len(rules) < 100:
    raise SystemExit('Incomplete community rule selection')
with tempfile.TemporaryDirectory(prefix='awd-security-') as temp:
    config = pathlib.Path(temp) / 'security.yaml'
    config.write_text(yaml.safe_dump({'rules': rules}, sort_keys=False))
    report = pathlib.Path(temp) / 'report.json'
    snapshot = pathlib.Path(temp) / 'source'
    snapshot.mkdir()
    paths = subprocess.check_output(['git', 'ls-files', '-z', '--cached']).decode().split('\0')
    for name in filter(None, paths):
        source = pathlib.Path(name)
        if not source.is_file() or source.is_symlink():
            continue
        dest = snapshot / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        data = source.read_bytes()
        # Normalize only line endings in the disposable scan copy; mixed CRLF
        # triggers parser errors in the pinned CE engine. Product files stay intact.
        if source.suffix in ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.py', '.yml', '.yaml', '.sh']:
            data = data.replace(b'\r\n', b'\n')
        dest.write_bytes(data)
    result = subprocess.run(['semgrep', 'scan', '--config', str(config), '--metrics=off', '--disable-version-check', '--no-rewrite-rule-ids', '--strict', '--error', '--timeout=60', '--json', '--output', str(report), '.'], cwd=snapshot)
    if not report.exists():
        raise SystemExit('Scanner did not produce a report')
    data = json.loads(report.read_text())
    # Do not persist matched source or credentials in CI reports.
    print(json.dumps({'rules': len(rules), 'scanned_files': len(data.get('paths', {}).get('scanned', [])),
                      'findings': [{'rule': r['check_id'], 'path': r['path'], 'line': r['start']['line']} for r in data.get('results', [])],
                      'errors': [{'type': e.get('type'), 'rule': e.get('rule_id'), 'path': e.get('path'), 'message': e.get('message', '')[:300]} for e in data.get('errors', [])]}, indent=2))
    if result.returncode or data.get('errors') or data.get('results'):
        raise SystemExit(1)

# Equivalent fail-closed checks for the upstream embedded Bash rules that currently
# crash the CE engine: inspect every workflow run step, including nested jobs.
import re
for workflow in pathlib.Path('.github/workflows').glob('*.y*ml'):
    document = yaml.safe_load(workflow.read_text())
    for job in (document.get('jobs') or {}).values():
        for step in job.get('steps', []):
            run = step.get('run', '')
            if not isinstance(run, str):
                raise SystemExit(f'Unsupported run step in {workflow}')
            flat = run.replace('\\\n', ' ')
            if re.search(r'\b(?:curl|wget)\b[^\n]*\|\s*(?:ba)?sh\b', flat) or re.search(r'\beval\b[^\n]*(?:curl|wget)\b', flat):
                raise SystemExit(f'Unsafe remote-shell execution in {workflow}')
