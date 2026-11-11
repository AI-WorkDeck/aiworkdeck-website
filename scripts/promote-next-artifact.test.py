# SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Runner-side promoter checks against a synthetic GitHub API. No network, no secrets."""
import hashlib, importlib.util, io, json, pathlib, shutil, tarfile, tempfile, unittest, zipfile

here = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location('promote', here / 'promote-next-artifact.py')
promote = importlib.util.module_from_spec(spec); spec.loader.exec_module(promote)
artifact = promote.artifact
SHA = 'c' * 40
RUN = '4242'

def sha(data): return hashlib.sha256(data).hexdigest()

def zipped(files):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as package:
        for name, data in files.items(): package.writestr(name, data)
    return buffer.getvalue()

class PromoteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        root = pathlib.Path(self.temp.name); bundle = root / 'bundle'
        for n in ['.next/server', '.next/static']: (bundle / n).mkdir(parents=True)
        (bundle / '.next/BUILD_ID').write_text('fixture')
        artifact.write(bundle / '.next/required-server-files.json', {'version': 1})
        artifact.write(bundle / '.next/prerender-manifest.json', {'version': 4})
        artifact.write(bundle / '.next/server/preview-props.json', {k: 'x' for k in ['previewModeId', 'previewModeSigningKey', 'previewModeEncryptionKey']})
        artifact.write(bundle / 'package.json', {})
        artifact.write(bundle / 'package-lock.json', {'packages': {'node_modules/next': {'version': artifact.NEXT}}})
        artifact.write(bundle / 'next.config.ts', {})
        values = {'NEXT_PUBLIC_AWD_SITE': 'cn', 'NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_SCENE_ID': 's', 'NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_PREFIX': 'p'}
        artifact.write(bundle / 'public-config.json', values)
        artifact.write(bundle / 'smoke.json', {'passed': True})
        web_tar = b'synthetic-web-tar'
        self.web_zip = zipped({'web-workbench.tar.gz': web_tar, 'web-workbench.sha256': sha(web_tar) + '\n'})
        artifact.write(bundle / 'provenance.json', {'schema': 1, 'sourceSha': SHA, 'site': 'cn', 'node': artifact.NODE, 'next': artifact.NEXT,
            'buildMode': artifact.BUILD_MODE, 'nodeAbi': '127', 'lockSha256': artifact.digest(bundle / 'package-lock.json'),
            'publicConfigSha256': sha(json.dumps(values, sort_keys=True, separators=(',', ':')).encode()),
            'web': {'runId': 99, 'artifactId': 7, 'zipSha256': sha(self.web_zip), 'tarSha256': sha(web_tar)},
            'files': artifact.inventory(bundle)})
        tar = root / 'next-artifact.tar.gz'
        with tarfile.open(tar, 'w:gz') as package: package.add(bundle, arcname='.')
        tar_bytes = tar.read_bytes()
        self.next_zip = zipped({'next-artifact.tar.gz': tar_bytes, 'next-artifact.sha256': sha(tar_bytes) + '\n',
                                'provenance.json': (bundle / 'provenance.json').read_bytes(), 'smoke.json': (bundle / 'smoke.json').read_bytes()})
        self.run = {'path': promote.BUILD_WORKFLOW, 'event': 'workflow_dispatch', 'head_branch': 'master', 'status': 'completed',
                    'conclusion': 'success', 'repository': {'full_name': promote.REPO}, 'head_repository': {'full_name': promote.REPO}}
        self.next_item = {'id': 5, 'name': f'next-cn-{SHA}', 'expired': False, 'digest': 'sha256:' + sha(self.next_zip)}
        self.web_item = {'id': 7, 'name': f'web-workbench-{SHA}', 'expired': False, 'digest': 'sha256:' + sha(self.web_zip), 'workflow_run': {'id': 99}}
        self.out = root / 'out'
        original = promote.gh; self.addCleanup(setattr, promote, 'gh', original)
        promote.gh = self.fake_gh

    def fake_gh(self, path):
        routes = {f'actions/runs/{RUN}': json.dumps(self.run).encode(),
                  f'actions/runs/{RUN}/artifacts?per_page=100': json.dumps({'artifacts': [self.next_item]}).encode(),
                  'actions/artifacts/5/zip': self.next_zip, 'actions/artifacts/7': json.dumps(self.web_item).encode(),
                  'actions/artifacts/7/zip': self.web_zip}
        return routes[path]

    def check(self, site='cn', run=RUN, source=SHA):
        shutil.rmtree(self.out, ignore_errors=True)
        promote.check(type('A', (), {'site': site, 'run_id': run, 'source_sha': source, 'out': str(self.out)}))

    def test_valid_bundle_emits_server_recheck_files(self):
        self.check()
        env = (self.out / 'release.env').read_text()
        self.assertIn(f'SHA={SHA}\n', env); self.assertIn('NODE_ABI=127\n', env)
        listed = [line[66:] for line in (self.out / 'files.sha256').read_text().splitlines()]
        self.assertIn('.next/BUILD_ID', listed); self.assertIn('provenance.json', listed)
        self.assertFalse((self.out / '.scratch').exists())

    def test_inputs_are_validated(self):
        for args in [('prod', RUN, SHA), ('cn', '0', SHA), ('cn', '12;rm', SHA), ('cn', RUN, 'C' * 40), ('cn', RUN, SHA[:39])]:
            with self.assertRaises(ValueError): promote.inputs(*args)

    def test_only_successful_master_build_runs(self):
        for key, value in [('path', '.github/workflows/ci.yml'), ('conclusion', 'failure'), ('head_branch', 'feature'), ('event', 'push'),
                           ('head_repository', {'full_name': 'fork/aiworkdeck_website'})]:
            saved = self.run[key]; self.run[key] = value
            with self.assertRaisesRegex(ValueError, 'next-build-artifact'): promote.build_run(RUN)
            self.run[key] = saved

    def test_source_or_site_mismatch_rejected(self):
        with self.assertRaisesRegex(ValueError, 'exactly one'): self.check(source='d' * 40)
        self.next_item['name'] = f'next-intl-{SHA}'
        with self.assertRaisesRegex(ValueError, 'exactly one'): self.check()

    def test_official_digest_mismatch_rejected(self):
        self.next_item['digest'] = 'sha256:' + '0' * 64
        with self.assertRaisesRegex(ValueError, 'official artifact digest'): self.check()

    def test_web_artifact_must_match_provenance(self):
        self.web_item['workflow_run'] = {'id': 100}
        with self.assertRaisesRegex(ValueError, 'Web artifact differs'): self.check()

if __name__ == '__main__': unittest.main()
