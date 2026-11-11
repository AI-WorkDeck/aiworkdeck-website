# SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Runner-side verification for promote-next-artifact.yml. No secrets, no SSH.

Reuses next-ci-artifact.py (extract_tar / verify / digest) so the consumer checks
exactly what the producer promised; it never rebuilds or repacks anything.
"""
import argparse, importlib.util, json, pathlib, re, shutil, stat, subprocess, zipfile

spec = importlib.util.spec_from_file_location('artifact', pathlib.Path(__file__).with_name('next-ci-artifact.py'))
artifact = importlib.util.module_from_spec(spec); spec.loader.exec_module(artifact)
REPO = artifact.REPO
BUILD_WORKFLOW = '.github/workflows/next-build-artifact.yml'
NEXT_ZIP = ['next-artifact.sha256', 'next-artifact.tar.gz', 'provenance.json', 'smoke.json']
WEB_ZIP = ['web-workbench.sha256', 'web-workbench.tar.gz']

def gh(path):
    return subprocess.check_output(['gh', 'api', f'repos/{REPO}/{path}'])

def inputs(site, run_id, sha):
    if site not in ('cn', 'intl'):
        raise ValueError('site must be cn or intl')
    if not re.fullmatch(r'[1-9][0-9]{0,19}', run_id or ''):
        raise ValueError('artifact_run_id must be a positive integer')
    if not re.fullmatch(r'[0-9a-f]{40}', sha or ''):
        raise ValueError('source_sha must be 40 lowercase hex')

def build_run(run_id):
    run = json.loads(gh(f'actions/runs/{run_id}'))
    # Only the reviewed master copy of the build-only workflow may produce promotable bundles.
    if (run.get('path') != BUILD_WORKFLOW or run.get('event') != 'workflow_dispatch' or run.get('head_branch') != 'master'
            or run.get('status') != 'completed' or run.get('conclusion') != 'success'
            or (run.get('repository') or {}).get('full_name') != REPO or (run.get('head_repository') or {}).get('full_name') != REPO):
        raise ValueError('artifact_run_id is not a successful master next-build-artifact.yml run of this repository')
    return run

def official_zip(item, scratch, label):
    if item.get('expired'):
        raise ValueError(label + ' artifact expired')
    archive = scratch / (label + '.zip')
    archive.write_bytes(gh(f"actions/artifacts/{item['id']}/zip"))
    if item.get('digest') != 'sha256:' + artifact.digest(archive):
        raise ValueError(label + ' official artifact digest mismatch')
    return archive

def unzip_exact(archive, names, target):
    with zipfile.ZipFile(archive) as package:
        if sorted(package.namelist()) != names or any(stat.S_ISLNK(x.external_attr >> 16) for x in package.infolist()):
            raise ValueError('Unexpected ZIP contents: ' + archive.name)
        target.mkdir()
        package.extractall(target)

def check(args):
    inputs(args.site, args.run_id, args.source_sha)
    out = pathlib.Path(args.out).resolve(); out.mkdir(exist_ok=False)
    scratch = out / '.scratch'; scratch.mkdir()
    build_run(args.run_id)
    name = f'next-{args.site}-{args.source_sha}'
    items = [a for a in json.loads(gh(f'actions/runs/{args.run_id}/artifacts?per_page=100'))['artifacts'] if a['name'] == name]
    if len(items) != 1:
        raise ValueError('Expected exactly one artifact named ' + name)
    zipped = scratch / 'next'; unzip_exact(official_zip(items[0], scratch, 'next'), NEXT_ZIP, zipped)
    tar = zipped / 'next-artifact.tar.gz'; tar_sha = artifact.digest(tar)
    if (zipped / 'next-artifact.sha256').read_text().strip() != tar_sha:
        raise ValueError('Next tar digest mismatch')
    bundle = scratch / 'bundle'; bundle.mkdir()
    artifact.extract_tar(tar, bundle)
    manifest = artifact.verify(bundle, args.source_sha, args.site)
    # The loose provenance/smoke copies must be byte-identical to the ones inside the tar.
    for loose in ['provenance.json', 'smoke.json']:
        if (zipped / loose).read_bytes() != (bundle / loose).read_bytes():
            raise ValueError('Loose ' + loose + ' differs from archived copy')
    if not re.fullmatch(r'[0-9]+', str(manifest.get('nodeAbi', ''))):
        raise ValueError('Provenance lacks nodeAbi')
    web = manifest.get('web') or {}
    meta = json.loads(gh(f"actions/artifacts/{int(web.get('artifactId', 0))}"))
    if (meta.get('name') != 'web-workbench-' + args.source_sha or (meta.get('workflow_run') or {}).get('id') != web.get('runId')
            or meta.get('digest') != 'sha256:' + str(web.get('zipSha256'))):
        raise ValueError('Web artifact differs from the one recorded in provenance')
    webdir = scratch / 'web'; unzip_exact(official_zip(meta, scratch, 'web'), WEB_ZIP, webdir)
    web_tar = webdir / 'web-workbench.tar.gz'; web_sha = artifact.digest(web_tar)
    if web_sha != web.get('tarSha256') or (webdir / 'web-workbench.sha256').read_text().strip() != web_sha:
        raise ValueError('Web tar digest mismatch')
    # Server re-checks every extracted file against this list (exact set, provenance included).
    lines = [f'{artifact.digest(f)}  {f.relative_to(bundle).as_posix()}' for f in sorted(bundle.rglob('*')) if f.is_file()]
    (out / 'files.sha256').write_text('\n'.join(lines) + '\n')
    shutil.move(str(tar), out / 'next-artifact.tar.gz')
    shutil.move(str(web_tar), out / 'web-workbench.tar.gz')
    (out / 'release.env').write_text(''.join(f'{k}={v}\n' for k, v in [
        ('SITE', args.site), ('SHA', args.source_sha), ('NEXT_TAR_SHA256', tar_sha),
        ('WEB_TAR_SHA256', web_sha), ('NODE_ABI', manifest['nodeAbi'])]))
    shutil.rmtree(scratch)
    print(json.dumps({'site': args.site, 'sourceSha': args.source_sha, 'nextTarSha256': tar_sha, 'webTarSha256': web_sha,
                      'publicConfigSha256': manifest['publicConfigSha256'], 'lockSha256': manifest['lockSha256'],
                      'buildMode': manifest['buildMode'], 'files': len(lines)}, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['check'])
    parser.add_argument('--site', required=True); parser.add_argument('--run-id', required=True)
    parser.add_argument('--source-sha', required=True); parser.add_argument('--out', required=True)
    check(parser.parse_args())
