// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const script=fileURLToPath(new URL('./web-ai-flag.mjs',import.meta.url));
function fixture(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'awd-flag-test-'));try{return fn(root)}finally{fs.rmSync(root,{recursive:true,force:true})}}
function run(root,action,id='123') {return spawnSync(process.execPath,[script,action,id],{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH}});}
function write(root,text){fs.writeFileSync(path.join(root,'.env.local'),text,{mode:0o640});}
function read(root){return fs.readFileSync(path.join(root,'.env.local'),'utf8')}
function jsonKey(root){fs.mkdirSync(path.join(root,'data'));fs.writeFileSync(path.join(root,'data/ai-config.json'),JSON.stringify({apiKey:'synthetic-json-key'}));}
const ok=r=>assert.equal(r.status,0,r.stderr);
const fails=r=>{assert.equal(r.status,1);assert.ok(!r.stderr.includes('synthetic'));};
test('preserve makes no reads/writes to even an invalid/symlink configuration',()=>fixture(root=>{fs.symlinkSync('missing',path.join(root,'.env.local'));ok(run(root,'preserve'));assert.deepEqual(fs.readdirSync(root),['.env.local']);}));
test('enable without existing server key fails before flag/receipt write',()=>fixture(root=>{const input='OTHER=keep\n';write(root,input);fails(run(root,'enable'));assert.equal(read(root),input);assert.ok(!fs.existsSync(path.join(root,'.web-releases/web-ai-flags/123.json')));}));
test('enable uses existing dotenv key without changing or copying it; restore keeps later unrelated edits',()=>fixture(root=>{
 const input='# config\r\nOPENROUTER_API_KEY="synthetic-env-key"\r\nOTHER="two words"\r\nWEB_AI_ENABLED=0 # old\r\n';write(root,input);
 const result=run(root,'enable');ok(result);assert.ok(!(result.stdout+result.stderr).includes('synthetic-env-key'));
 assert.equal(read(root),input.replace('WEB_AI_ENABLED=0 # old','WEB_AI_ENABLED=1'));assert.equal(fs.statSync(path.join(root,'.env.local')).mode&0o777,0o640);
 const receipt=path.join(root,'.web-releases/web-ai-flags/123.json');assert.deepEqual(JSON.parse(fs.readFileSync(receipt)),{version:1,previous:'0',applied:'1'});assert.equal(fs.statSync(receipt).mode&0o777,0o600);
 ok(run(root,'enable'));fs.appendFileSync(path.join(root,'.env.local'),'LATER=value\r\n');ok(run(root,'restore'));assert.equal(read(root),input.replace('WEB_AI_ENABLED=0 # old','WEB_AI_ENABLED=0')+'LATER=value\r\n');
}));
test('JSON-only key permits enabling new env and restore removes only added flag',()=>fixture(root=>{jsonKey(root);ok(run(root,'enable'));assert.equal(read(root),'WEB_AI_ENABLED=1\n');fs.appendFileSync(path.join(root,'.env.local'),'LATER=keep\n');ok(run(root,'restore'));assert.equal(read(root),'LATER=keep\n');}));
test('disable needs no provider key and can restore original flag',()=>fixture(root=>{write(root,'WEB_AI_ENABLED=1\nOTHER=keep\n');ok(run(root,'disable'));assert.equal(read(root),'WEB_AI_ENABLED=0\nOTHER=keep\n');ok(run(root,'restore'));assert.equal(read(root),'WEB_AI_ENABLED=1\nOTHER=keep\n');}));
test('duplicates, invalid flag and multiline lookalikes fail without altering other configuration',()=>{
 for(const input of ['WEB_AI_ENABLED=0\nWEB_AI_ENABLED=1\n','WEB_AI_ENABLED=unexpected\n','OTHER="first\nWEB_AI_ENABLED=0\nlast"\n'])fixture(root=>{write(root,input);fails(run(root,'disable'));assert.equal(read(root),input);});
});
test('higher-priority conflicting flag, unresolved key and malformed JSON fail safely',()=>{
 fixture(root=>{jsonKey(root);write(root,'OTHER=keep\n');fs.writeFileSync(path.join(root,'.env.production.local'),'WEB_AI_ENABLED=0\n');fails(run(root,'enable'));assert.equal(read(root),'OTHER=keep\n');});
 for(const key of ['','${MISSING}'])fixture(root=>{write(root,`OPENROUTER_API_KEY=${key}\n`);fails(run(root,'enable'));assert.equal(read(root),`OPENROUTER_API_KEY=${key}\n`);});
 fixture(root=>{fs.mkdirSync(path.join(root,'data'));fs.writeFileSync(path.join(root,'data/ai-config.json'),'{"apiKey":"synthetic');const r=run(root,'enable');fails(r);assert.ok(!fs.existsSync(path.join(root,'.env.local')));});
});
test('reject symlink write targets/receipts and invalid actions',()=>{
 fixture(root=>{fs.writeFileSync(path.join(root,'actual'),'WEB_AI_ENABLED=1\n');fs.symlinkSync('actual',path.join(root,'.env.local'));fails(run(root,'disable'));assert.equal(fs.readFileSync(path.join(root,'actual'),'utf8'),'WEB_AI_ENABLED=1\n');});
 fixture(root=>{fs.mkdirSync(path.join(root,'actual'));fs.symlinkSync('actual',path.join(root,'.web-releases'));fails(run(root,'disable'));assert.deepEqual(fs.readdirSync(path.join(root,'actual')),[]);});
 fixture(root=>{fails(run(root,'invalid'));fails(run(root,'disable','../escape'));assert.deepEqual(fs.readdirSync(root),[]);});
});
