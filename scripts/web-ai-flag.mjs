// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Run in the server checkout. Never print/copy dotenv contents or provider keys.
import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';

const [action, runId]=process.argv.slice(2);
const flag='WEB_AI_ENABLED', envFile='.env.local';
const fail=message=>{throw Error(message)};
function read(file) {
  try {const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink())fail('Configuration path must be a regular file');return {text:fs.readFileSync(file,'utf8'),st};}
  catch(e){if(e.code==='ENOENT')return {text:'',st:null};throw e;}
}
function value(text) {
  const v=parseEnv(text)[flag];
  if(v!==undefined&&v!=='0'&&v!=='1')fail('Existing Web AI flag must be 0, 1 or absent');
  return v??null;
}
function replaceFlag(text,target) {
  const before=parseEnv(text), matches=[...text.matchAll(/^[\t ]*(?:export[\t ]+)?WEB_AI_ENABLED[\t ]*=[^\r\n]*(?:\r?\n|$)/gm)];
  if(matches.length>1||(matches.length===1)!==(before[flag]!==undefined))fail('Ambiguous Web AI flag; no configuration changed');
  const line=target===null?'':`${flag}=${target}`;
  let result;
  if(matches.length){const m=matches[0],eol=m[0].endsWith('\r\n')?'\r\n':m[0].endsWith('\n')?'\n':'';result=text.slice(0,m.index)+(line?line+eol:'')+text.slice(m.index+m[0].length);}
  else {const eol=text.includes('\r\n')?'\r\n':'\n';result=text+(text&&!text.endsWith('\n')?eol:'')+(line?line+eol:'');}
  const after=parseEnv(result);delete before[flag];delete after[flag];
  if(JSON.stringify(before)!==JSON.stringify(after))fail('Refusing to alter any other configuration value');
  return result;
}
function atomicWrite(file,text,st) {
  const temp=file+'.tmp-'+randomUUID();
  try {fs.writeFileSync(temp,text,{flag:'wx',mode:st?st.mode&0o777:0o600});if(st)fs.chownSync(temp,st.uid,st.gid);fs.renameSync(temp,file);}
  finally {try{fs.unlinkSync(temp)}catch(e){if(e.code!=='ENOENT')throw e;}}
}
function checkEnableKey() {
  // Next production precedence; values stay in this process and are never exported.
  const env={...process.env};
  for(const file of ['.env.production.local','.env.local','.env.production','.env']){
    for(const [key,v] of Object.entries(parseEnv(read(file).text)))if(env[key]===undefined)env[key]=v;
  }
  let configured=typeof env.OPENROUTER_API_KEY==='string'&&env.OPENROUTER_API_KEY.trim()!==''&&!env.OPENROUTER_API_KEY.includes('$');
  if(!configured){try{const k=JSON.parse(read('data/ai-config.json').text).apiKey;configured=typeof k==='string'&&k.trim()!=='';}catch{/* Never print parse errors or file contents. */}}
  if(!configured)fail('Cannot enable Web AI: existing server provider key is missing or unresolved');
}
try {
  if(!['preserve','enable','disable','restore'].includes(action))fail('Expected preserve, enable, disable or restore');
  if(action==='preserve'){console.log('Web AI flag preserved');process.exit(0);}
  if(!/^[0-9]{1,30}$/.test(runId??''))fail('A numeric deployment run ID is required');
  const current=read(envFile),previous=value(current.text);
  const directory=path.join('.web-releases','web-ai-flags');
  for(const part of ['.web-releases',directory]){try{if(!fs.lstatSync(part).isDirectory()||fs.lstatSync(part).isSymbolicLink())fail('Flag receipt directory must not be a symlink');}catch(e){if(e.code!=='ENOENT')throw e;fs.mkdirSync(part,{mode:0o700});}}
  const receiptFile=path.join(directory,runId+'.json');
  let target=action==='enable'?'1':'0', receipt;
  const saved=read(receiptFile);
  if(saved.st){try{receipt=JSON.parse(saved.text);}catch{fail('Invalid flag receipt');}}
  if(action==='restore') {
    if(!receipt||receipt.version!==1||![null,'0','1'].includes(receipt.previous)||!['0','1'].includes(receipt.applied))fail('A valid flag receipt is required');
    target=receipt.previous;
    if(previous===target){console.log('Web AI flag already restored');process.exit(0);}
    if(previous!==receipt.applied)fail('Web AI flag changed since deployment; refusing restore');
  } else {
    if(action==='enable')checkEnableKey();
    // .env.local cannot override inherited process or higher-priority production-local flags.
    for(const v of [process.env[flag],parseEnv(read('.env.production.local').text)[flag]])if(v!==undefined&&v!==target)fail('Web AI flag is shadowed by a higher-priority configuration');
    if(receipt){if(receipt.version!==1||receipt.applied!==target||previous!==target)fail('Deployment flag receipt already exists; use a new run ID');console.log('Web AI flag already applied');process.exit(0);}
  }
  const next=replaceFlag(current.text,target);
  if(action!=='restore'){
    receipt={version:1,previous,applied:target};
    fs.writeFileSync(receiptFile,JSON.stringify(receipt)+'\n',{flag:'wx',mode:0o600});
  }
  if(next!==current.text)atomicWrite(envFile,next,current.st);
  console.log(action==='restore'?'Web AI flag restored':`Web AI flag ${action==='enable'?'enabled':'disabled'}; single-flag recovery receipt saved`);
} catch(e) {
  // Filesystem/JSON errors may contain configuration bytes: use only our fixed messages.
  const known=['Configuration path','Existing Web AI','Ambiguous Web AI','Refusing to alter','Cannot enable Web AI','Expected preserve','A numeric','Flag receipt','Invalid flag receipt','A valid flag','Web AI flag changed','Deployment flag receipt','Web AI flag is shadowed'];
  console.error(known.some(s=>e.message?.startsWith(s))?e.message:'Web AI flag operation failed; no configuration content is logged');process.exitCode=1;
}
