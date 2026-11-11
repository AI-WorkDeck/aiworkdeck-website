# SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Build-only Next artifacts. No production environment, SSH, or deployment."""
import argparse, hashlib, json, os, pathlib, re, shutil, socket, subprocess, tarfile, tempfile, time, urllib.request, urllib.error, urllib.parse, zipfile, stat

NODE = 'v22.23.2'
NEXT = '16.4.3'
BUILD_MODE = 'webpack'
PUBLIC = {
    'NEXT_PUBLIC_AWD_SITE', 'NEXT_PUBLIC_BASE_URL', 'NEXT_PUBLIC_AWD_INTL_CONTACT_EMAIL',
    'NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_SCENE_ID', 'NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_PREFIX',
    'NEXT_PUBLIC_AWD_TURNSTILE_SITE_KEY', 'NEXT_PUBLIC_AUTH_PHONE_BINDING_DEADLINE',
}
REPO = 'AI-WorkDeck/aiworkdeck-website'

def digest(file):
    with open(file, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def write(file, value):
    file.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def config(raw, site):
    values = json.loads(raw)
    if not isinstance(values, dict) or not set(values) <= PUBLIC:
        raise ValueError('Public config contains an unknown key')
    if any(not isinstance(v, str) or len(v) > 200 for v in values.values()):
        raise ValueError('Invalid public config value')
    if values.get('NEXT_PUBLIC_AWD_SITE', 'cn') != site or ('NEXT_PUBLIC_BASE_URL' in values and values['NEXT_PUBLIC_BASE_URL'] != {'cn':'https://www.aiworkdeck.com','intl':'https://www.workdeck.ai'}[site]):
        raise ValueError('Site/origin mismatch')
    for key in ['NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_SCENE_ID','NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_PREFIX','NEXT_PUBLIC_AWD_TURNSTILE_SITE_KEY']:
        if not re.fullmatch(r'[A-Za-z0-9_-]*', values.get(key, '')):
            raise ValueError('Invalid public captcha identifier')
    if site == 'cn' and not all(values.get(k) for k in ['NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_SCENE_ID','NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_PREFIX']):
        raise ValueError('CN public captcha identifiers required')
    if site == 'intl' and not values.get('NEXT_PUBLIC_AWD_TURNSTILE_SITE_KEY'):
        raise ValueError('International public Turnstile site key required')
    if 'NEXT_PUBLIC_AWD_INTL_CONTACT_EMAIL' in values and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', values['NEXT_PUBLIC_AWD_INTL_CONTACT_EMAIL']):
        raise ValueError('Invalid public contact email')
    if 'NEXT_PUBLIC_AUTH_PHONE_BINDING_DEADLINE' in values and not re.fullmatch(r'\d{4}-\d{2}-\d{2}', values['NEXT_PUBLIC_AUTH_PHONE_BINDING_DEADLINE']):
        raise ValueError('Invalid explicit public phone deadline')
    return values

def extract_tar(archive, target):
    with tarfile.open(archive) as package:
        names=set();total=0
        for entry in package.getmembers():
            name=pathlib.PurePosixPath(entry.name);normalized=name.as_posix();total+=entry.size
            if name.is_absolute() or '..' in name.parts or normalized in names or '\\' in entry.name or ':' in entry.name or entry.size<0 or not(entry.isfile() or entry.isdir()) or total>2_000_000_000:
                raise ValueError('Unsafe tar member')
            names.add(normalized)
        package.extractall(target, filter='data')

def inventory(root):
    files = {}
    for file in sorted(root.rglob('*')):
        relative = file.relative_to(root).as_posix()
        if file.is_symlink():
            raise ValueError('Symlink in artifact: ' + relative)
        if file.is_file() and relative != 'provenance.json':
            if not (relative.startswith('.next/') or relative in ['package.json','package-lock.json','next.config.ts','public-config.json','smoke.json']):
                raise ValueError('Unexpected artifact file: ' + relative)
            if relative.startswith('.next/cache/') or any(part in ['data','node_modules'] or part.startswith('.env') for part in file.relative_to(root).parts):
                raise ValueError('Private data/cache in artifact: ' + relative)
            if file.suffix.lower() == '.node':
                raise ValueError('Native binary in Next artifact: ' + relative)
            files[relative] = {'bytes':file.stat().st_size, 'sha256':digest(file)}
    return files

def verify(root, sha, site):
    manifest = json.loads((root/'provenance.json').read_text())
    if manifest['schema'] != 1 or manifest['sourceSha'] != sha or manifest['site'] != site or manifest['node'] != NODE:
        raise ValueError('Artifact identity mismatch')
    if manifest.get('buildMode') != BUILD_MODE:
        raise ValueError('Artifact build mode mismatch')
    values = config((root/'public-config.json').read_text(), site)
    fingerprint = hashlib.sha256(json.dumps(values, sort_keys=True, separators=(',',':')).encode()).hexdigest()
    if manifest['publicConfigSha256'] != fingerprint or manifest['lockSha256'] != digest(root/'package-lock.json'):
        raise ValueError('Artifact inputs changed')
    if manifest['files'] != inventory(root):
        raise ValueError('Artifact file inventory changed')
    for required in ['.next/BUILD_ID','.next/required-server-files.json','.next/prerender-manifest.json','.next/server/preview-props.json','.next/server','.next/static']:
        if not (root/required).exists():
            raise ValueError('Incomplete Next artifact: ' + required)
    preview = json.loads((root/'.next/server/preview-props.json').read_text())
    if not all(isinstance(preview.get(k), str) and preview[k] for k in ['previewModeId','previewModeSigningKey','previewModeEncryptionKey']):
        raise ValueError('Missing Next server preview props')
    if manifest['next'] != NEXT or json.loads((root/'package-lock.json').read_text())['packages']['node_modules/next']['version'] != manifest['next']:
        raise ValueError('Next/lock mismatch')
    if json.loads((root/'smoke.json').read_text())['passed'] is not True:
        raise ValueError('Smoke failed')
    return manifest

def command(args, cwd, env):
    subprocess.run(args, cwd=cwd, env=env, check=True)

def gh(path):
    return subprocess.check_output(['gh','api',f'repos/{REPO}/{path}'])

def safe_web(app, run_id, sha, scratch):
    run = json.loads(gh(f'actions/runs/{run_id}'))
    jobs = json.loads(gh(f'actions/runs/{run_id}/jobs?per_page=100'))['jobs']
    # A failed deployment does not invalidate the successful, same-source Web build job.
    if run['head_sha'] != sha or run['path'] != '.github/workflows/ci.yml' or run['status'] != 'completed':
        raise ValueError('Foreign or unfinished Web source run')
    if not any(j['name']=='Typecheck + Build' and j['conclusion']=='success' for j in jobs):
        raise ValueError('Web build job did not pass')
    artifacts = json.loads(gh(f'actions/runs/{run_id}/artifacts?per_page=100'))['artifacts']
    matches = [a for a in artifacts if a['name']=='web-workbench-'+sha and not a['expired']]
    if len(matches)!=1:
        raise ValueError('Expected one live same-source Web package')
    item=matches[0]; archive=scratch/'web.zip'; archive.write_bytes(gh(f"actions/artifacts/{item['id']}/zip"))
    if item['digest'] != 'sha256:'+digest(archive):
        raise ValueError('Official Web ZIP digest mismatch')
    with zipfile.ZipFile(archive) as package:
        if sorted(package.namelist()) != ['web-workbench.sha256','web-workbench.tar.gz'] or any(stat.S_ISLNK(x.external_attr>>16) for x in package.infolist()):
            raise ValueError('Unexpected Web ZIP contents')
        package.extractall(scratch)
    tar=scratch/'web-workbench.tar.gz'
    if (scratch/'web-workbench.sha256').read_text().strip()!=digest(tar):
        raise ValueError('Web tar digest mismatch')
    target=app/'public/web'; target.mkdir(exist_ok=False)
    extract_tar(tar,target)
    return {'runId':int(run_id),'runConclusion':run['conclusion'],'buildJobConclusion':'success','artifactId':item['id'],'zipSha256':digest(archive),'tarSha256':digest(tar)}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Runtime smoke refuses every redirect')

def local_request(base, route, site, data=None, timeout=30):
    if urllib.parse.urlsplit(base).hostname != '127.0.0.1':raise ValueError('Local smoke origin required')
    headers={'Host':{'cn':'www.aiworkdeck.com','intl':'www.workdeck.ai'}[site], 'Cookie':'awd_site='+site+'; awd_lang=en'}
    if data is not None:headers['Content-Type']='application/json'
    url=base+route
    request=urllib.request.Request(url,data=data,headers=headers)
    # Ignore inherited proxies as well as all local or public redirects.
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:response=opener.open(request,timeout=timeout)
    except urllib.error.HTTPError as error:response=error
    if response.geturl()!=url:raise ValueError('Smoke response left its exact local URL')
    return response

def omit_next_cache(directory, names):
    return {'cache'} if pathlib.Path(directory).name == '.next' and 'cache' in names else set()

def smoke(app, env, scratch):
    root=scratch/'runtime'; root.mkdir()
    for name in ['.next','public']:
        shutil.copytree(app/name, root/name, ignore=omit_next_cache if name=='.next' else None)
    for name in ['package.json','package-lock.json','next.config.ts']:
        shutil.copy2(app/name, root/name)
    (root/'node_modules').symlink_to(app/'node_modules', target_is_directory=True)
    # Fresh runtime cwd: no source data/, no server environment or credentials copied.
    assert not (root/'data').exists()
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
    log=scratch/'start.log'
    with log.open('w') as stream:
        process=subprocess.Popen(['node',str(app/'node_modules/next/dist/bin/next'),'start',str(root),'-H','127.0.0.1','-p',str(port)],cwd=root,env=env,stdout=stream,stderr=subprocess.STDOUT)
        try:
            checks=[]; base=f'http://127.0.0.1:{port}'
            startup_deadline=time.monotonic()+90
            while time.monotonic()<startup_deadline:
                if process.poll() is not None: raise RuntimeError('Next exited before ready: '+log.read_text()[-3000:])
                try:
                    with local_request(base,'/en/start',env.get('NEXT_PUBLIC_AWD_SITE','cn'),timeout=2) as response:
                        if response.status==200:break
                    time.sleep(.5)
                except (OSError, TimeoutError):time.sleep(.5)
            else:raise RuntimeError('Next startup deadline')
            site=env.get('NEXT_PUBLIC_AWD_SITE','cn')
            with local_request(base,'/api/admin/overview',site) as response:
                assert response.status==401 and response.headers.get('X-AWD-Admin-Site')==site
                checks.append({'route':'/api/admin/overview','status':401,'actualSiteHeader':site,'sameLocalOrigin':True})
            for route in ['/en/start','/zh/updates','/en/updates','/web/index.html']:
                with local_request(base,route,site) as response:
                    body=response.read(); assert response.status==200 and body
                    if route.endswith('/updates'):
                        if b'0.75.7' not in body:raise ValueError('Expected0757 updates content missing')
                    checks.append({'route':route,'status':response.status,'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest(),'sameLocalOrigin':True,'siteVerifiedByLocalAdminHeader':site})
            with local_request(base,'/api/license/verify-key',site,b'{\"key\":\"synthetic-invalid-key\"}') as response:
                assert response.status==200 and json.load(response)=={'valid':False}
                checks.append({'route':'POST /api/license/verify-key','status':200,'valid':False,'sameLocalOrigin':True,'siteVerifiedByLocalAdminHeader':site})
            command(['node','-e',"const D=require('better-sqlite3');const d=new D(':memory:');d.exec('create table t(a)');d.close()"],root,env)
            return {'passed':True,'site':env.get('NEXT_PUBLIC_AWD_SITE','cn'),'isolatedPort':port,'initialDataDirectoryAbsent':True,'sqliteNativeAbi':True,'checks':checks,'scope':'HTTP/runtime only; no browser, real captcha, login, payment, provider or production data'}
        finally:
            process.terminate()
            try:process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill();process.wait();raise RuntimeError('Next needed forced cleanup')

def build(args):
    app=pathlib.Path(args.app).resolve(); out=pathlib.Path(args.out).resolve()
    if not re.fullmatch(r'[a-f0-9]{40}',args.source_sha):raise ValueError('Explicit40hex source required')
    if subprocess.check_output(['git','rev-parse','HEAD'],cwd=app,text=True).strip()!=args.source_sha:raise ValueError('Checkout/source mismatch')
    values=config(os.environ['PUBLIC_CONFIG_JSON'],args.site)
    if not re.fullmatch(r'[1-9][0-9]*', args.web_run_id or ''):raise ValueError('Explicit Web run required')
    if subprocess.check_output(['node','--version'],text=True).strip()!=NODE:raise ValueError('Pinned Node required')
    # Next automatically reads .env* even when subprocess environment is clean.
    if list(app.glob('.env*')) or (app/'data/awd.db').exists() or (app/'public/web').exists():
        raise ValueError('Require fresh source checkout without env, database or prior Web build')
    out.mkdir(exist_ok=False)
    with tempfile.TemporaryDirectory(prefix='awd-next-ci-') as temp:
        scratch=pathlib.Path(temp);home=scratch/'home';home.mkdir()
        env={'PATH':os.environ['PATH'],'HOME':str(home),'TMPDIR':temp,'LANG':'C.UTF-8','CI':'1','NEXT_TELEMETRY_DISABLED':'1',**values}
        # SITE remains unset for a confirmed CN default; record its origin, do not invent an input.
        command(['npm','ci'],app,env)
        web=safe_web(app,args.web_run_id,args.source_sha,scratch)
        env.update({'AWD_WEB_RELEASE_SHA':args.source_sha,'NODE_ENV':'production'})
        command(['node','scripts/web-artifact.mjs','verify','public/web',args.source_sha],app,env)
        command(['npm','run','build','--','--webpack'],app,env)
        result=smoke(app,env,scratch)
        bundle=out/'bundle';bundle.mkdir()
        shutil.copytree(app/'.next',bundle/'.next',ignore=omit_next_cache)
        for name in ['package.json','package-lock.json','next.config.ts']:shutil.copy2(app/name,bundle/name)
        write(bundle/'public-config.json',values);write(bundle/'smoke.json',result)
        next_version=json.loads((app/'node_modules/next/package.json').read_text())['version']
        if next_version != NEXT:raise ValueError('Expected pinned Next16.4.3')
        write(bundle/'provenance.json',{'schema':1,'sourceSha':args.source_sha,'site':args.site,'siteBinding':'explicit' if 'NEXT_PUBLIC_AWD_SITE' in values else 'inferredDefault:cn','node':NODE,'next':next_version,'buildMode':BUILD_MODE,'lockSha256':digest(bundle/'package-lock.json'),'publicConfigSha256':hashlib.sha256(json.dumps(values,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'web':web,'workflowSha':os.environ.get('GITHUB_SHA'),'runnerPlatform':os.uname().sysname+' '+os.uname().machine,'nodeAbi':subprocess.check_output(['node','-p','process.versions.modules'],text=True).strip(),'files':inventory(bundle)})
        verify(bundle,args.source_sha,args.site)
        archive=out/'next-artifact.tar.gz'
        with tarfile.open(archive,'w:gz') as package:package.add(bundle,arcname='.')
        # Read back the exact shipped tar, including hidden.next, before declaring success.
        extracted=scratch/'archive-readback';extracted.mkdir()
        extract_tar(archive,extracted)
        verify(extracted,args.source_sha,args.site)
        (out/'next-artifact.sha256').write_text(digest(archive)+'\n')
        shutil.copy2(bundle/'provenance.json',out/'provenance.json')
        shutil.copy2(bundle/'smoke.json',out/'smoke.json')
        shutil.rmtree(bundle)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['build','verify']);parser.add_argument('--app',required=True);parser.add_argument('--source-sha',required=True);parser.add_argument('--site',choices=['cn','intl'],required=True);parser.add_argument('--web-run-id');parser.add_argument('--out');args=parser.parse_args()
    if args.mode=='build':build(args)
    else:verify(pathlib.Path(args.app),args.source_sha,args.site)
