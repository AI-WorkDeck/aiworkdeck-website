# SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
import importlib.util, json, pathlib, tempfile, unittest, hashlib, tarfile, io, threading, http.server

spec=importlib.util.spec_from_file_location('artifact',pathlib.Path(__file__).with_name('next-ci-artifact.py'))
artifact=importlib.util.module_from_spec(spec);spec.loader.exec_module(artifact)
SHA='a'*40

def public(site='cn'):
    return {'NEXT_PUBLIC_AWD_SITE':site,'NEXT_PUBLIC_BASE_URL':{'cn':'https://www.aiworkdeck.com','intl':'https://www.workdeck.ai'}[site],
            'NEXT_PUBLIC_AWD_INTL_CONTACT_EMAIL':'hi@workdeck.ai','NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_SCENE_ID':'synthetic-scene',
            'NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_PREFIX':'synthetic-prefix','NEXT_PUBLIC_AWD_TURNSTILE_SITE_KEY':'synthetic-public-site',
            'NEXT_PUBLIC_AUTH_PHONE_BINDING_DEADLINE':'2026-09-30'}

class GuardTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=pathlib.Path(self.temp.name)
        for n in ['.next/server','.next/static']:(self.root/n).mkdir(parents=True)
        (self.root/'.next/BUILD_ID').write_text('fixture')
        artifact.write(self.root/'.next/required-server-files.json',{'version':1})
        artifact.write(self.root/'.next/prerender-manifest.json',{'version':4})
        artifact.write(self.root/'.next/server/preview-props.json',{k:'synthetic' for k in ['previewModeId','previewModeSigningKey','previewModeEncryptionKey']})
        artifact.write(self.root/'package.json',{'dependencies':{'next':artifact.NEXT}})
        artifact.write(self.root/'package-lock.json',{'packages':{'node_modules/next':{'version':artifact.NEXT}}})
        artifact.write(self.root/'next.config.ts',{})
        artifact.write(self.root/'public-config.json',public())
        artifact.write(self.root/'smoke.json',{'passed':True})
        self.pack()
    def pack(self):
        artifact.write(self.root/'provenance.json',{'schema':1,'sourceSha':SHA,'site':'cn','node':artifact.NODE,'next':artifact.NEXT,'buildMode':artifact.BUILD_MODE,
            'lockSha256':artifact.digest(self.root/'package-lock.json'),
            'publicConfigSha256':hashlib.sha256(json.dumps(public(),sort_keys=True,separators=(',',':')).encode()).hexdigest(),
            'files':artifact.inventory(self.root)})
    def test_valid_and_corrupt_archive_file(self):
        artifact.verify(self.root,SHA,'cn')
        (self.root/'.next/BUILD_ID').write_text('changed')
        with self.assertRaisesRegex(ValueError,'inventory'):artifact.verify(self.root,SHA,'cn')
    def test_source_site_and_node_mismatch(self):
        with self.assertRaisesRegex(ValueError,'identity'):artifact.verify(self.root,'b'*40,'cn')
        with self.assertRaisesRegex(ValueError,'identity'):artifact.verify(self.root,SHA,'intl')
        m=json.loads((self.root/'provenance.json').read_text());m['node']='v20.0.0';artifact.write(self.root/'provenance.json',m)
        with self.assertRaisesRegex(ValueError,'identity'):artifact.verify(self.root,SHA,'cn')
    def test_missing_preview_props_even_with_updated_inventory(self):
        artifact.write(self.root/'.next/server/preview-props.json',{});self.pack()
        with self.assertRaisesRegex(ValueError,'preview props'):artifact.verify(self.root,SHA,'cn')
    def test_wrong_next_even_with_updated_inventory(self):
        artifact.write(self.root/'package-lock.json',{'packages':{'node_modules/next':{'version':'16.1.3'}}});self.pack()
        with self.assertRaisesRegex(ValueError,'Next/lock'):artifact.verify(self.root,SHA,'cn')
    def test_reject_data_env_node_modules_cache_and_symlink(self):
        for name in ['data/awd.db','.env.local','node_modules/key','.next/node_modules/vendor/LICENSE','.next/cache/credential']:
            file=self.root/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_text('synthetic')
            with self.assertRaises(ValueError):artifact.inventory(self.root)
            file.unlink()
        (self.root/'.next/server/link').symlink_to('/etc/passwd')
        with self.assertRaisesRegex(ValueError,'Symlink'):artifact.inventory(self.root)
    def test_wrong_or_absent_build_mode(self):
        original=json.loads((self.root/'provenance.json').read_text())
        for value in ['turbopack',None]:
            manifest=dict(original)
            if value is None:manifest.pop('buildMode')
            else:manifest['buildMode']=value
            artifact.write(self.root/'provenance.json',manifest)
            with self.assertRaisesRegex(ValueError,'build mode'):artifact.verify(self.root,SHA,'cn')
    def test_native_binary_rejected_outside_node_modules_too(self):
        file=self.root/'.next/server/native.node';file.write_bytes(b'synthetic-not-an-addon')
        with self.assertRaisesRegex(ValueError,'Native binary'):artifact.inventory(self.root)

    def test_public_whitelist_missing_extra_and_site(self):
        value=public();del value['NEXT_PUBLIC_AWD_SITE'];del value['NEXT_PUBLIC_BASE_URL'];self.assertEqual(artifact.config(json.dumps(value),'cn'),value)
        for site in ['cn','intl']:self.assertEqual(artifact.config(json.dumps(public(site)),site),public(site))
        for key in ['NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_SCENE_ID','NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_PREFIX']:
            value=public();del value[key]
            with self.assertRaises(ValueError):artifact.config(json.dumps(value),'cn')
        minimal=public('intl');minimal={k:v for k,v in minimal.items() if k in ['NEXT_PUBLIC_AWD_SITE','NEXT_PUBLIC_BASE_URL','NEXT_PUBLIC_AWD_TURNSTILE_SITE_KEY']}
        self.assertEqual(artifact.config(json.dumps(minimal),'intl'),minimal)
        value=public();value['AWD_ADMIN_TOKEN']='synthetic'
        with self.assertRaises(ValueError):artifact.config(json.dumps(value),'cn')
        with self.assertRaises(ValueError):artifact.config(json.dumps(public()),'intl')
        value=public();value['NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_PREFIX']=''
        with self.assertRaises(ValueError):artifact.config(json.dumps(value),'cn')
    def test_tar_paths_links_and_exact_readback(self):
        archive=self.root/'test.tar'
        for name,kind in [('../escape',tarfile.REGTYPE),('/absolute',tarfile.REGTYPE),('link',tarfile.SYMTYPE),('a\\b',tarfile.REGTYPE),('C:evil',tarfile.REGTYPE)]:
            with tarfile.open(archive,'w') as package:
                item=tarfile.TarInfo(name);item.type=kind;item.linkname='/etc/passwd';package.addfile(item,io.BytesIO(b''))
            with self.assertRaisesRegex(ValueError,'Unsafe tar'):artifact.extract_tar(archive,self.root/'destination')
        with tarfile.open(archive,'w') as package:
            package.addfile(tarfile.TarInfo('a'));package.addfile(tarfile.TarInfo('./a'))
        with self.assertRaisesRegex(ValueError,'Unsafe tar'):artifact.extract_tar(archive,self.root/'destination')
        archive.unlink()
        with tarfile.open(archive,'w') as package:
            for file in self.root.iterdir():
                if file!=archive:package.add(file,arcname=file.name)
        target=self.root/'readback';target.mkdir();artifact.extract_tar(archive,target)
        artifact.verify(target,SHA,'cn')

    def test_redirect_cannot_become_public_smoke(self):
        requests=[]
        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def do_GET(self):
                requests.append((self.path,self.headers.get('Host'),self.headers.get('Cookie')))
                self.send_response(302 if self.path=='/redirect' else 200)
                if self.path=='/redirect':self.send_header('Location','https://www.workdeck.ai/en/start')
                self.end_headers();self.wfile.write(b'fixture')
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            base='http://127.0.0.1:'+str(server.server_port)
            with artifact.local_request(base,'/local','intl') as response:self.assertEqual(response.status,200)
            self.assertEqual(requests[0][1:3],('www.workdeck.ai','awd_site=intl; awd_lang=en'))
            with self.assertRaisesRegex(ValueError,'every redirect'):artifact.local_request(base,'/redirect','intl')
            self.assertEqual([x[0] for x in requests],['/local','/redirect'])
        finally:server.shutdown();server.server_close();thread.join()
        with self.assertRaisesRegex(ValueError,'Local smoke origin'):
            artifact.local_request('https://www.workdeck.ai','/en/start','intl')

    def test_legacy_deploy_hard_block_is_first_before_credentials_or_ssh(self):
        text=pathlib.Path(__file__).parents[1].joinpath('.github/workflows/ci.yml').read_text()
        for job in ['deploy-cn','deploy-intl']:
            section=text.split('  '+job+':\n',1)[1]
            steps=section.split('    steps:\n',1)[1]
            first=steps.split('      - ',2)[1]
            self.assertTrue(first.startswith('name: Block unsafe production build path (#1648)\n'))
            self.assertIn('          exit 1\n',first)
            self.assertNotIn('if:',first)
            self.assertNotIn('continue-on-error:',first)
            self.assertNotIn('ssh ',first)

    def test_failed_smoke_cannot_be_repacked_green(self):
        artifact.write(self.root/'smoke.json',{'passed':False});self.pack()
        with self.assertRaisesRegex(ValueError,'Smoke failed'):artifact.verify(self.root,SHA,'cn')

if __name__=='__main__':unittest.main()
