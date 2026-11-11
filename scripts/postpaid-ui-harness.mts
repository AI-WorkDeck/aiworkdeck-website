// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
assert.ok(!fs.existsSync('package.json')&&!fs.existsSync('data'),'Use a fresh empty directory');
process.env.AWD_POSTPAID_ENABLED='true';
fs.mkdirSync('data');fs.writeFileSync('data/users.json',JSON.stringify([{id:'postpaid-ui',username:'synthetic-postpaid',displayName:'Synthetic postpaid test',passwordHash:'unused',createdAt:new Date().toISOString()}]));
const {generateApiKey}=await import('../lib/api-keys');
const key=generateApiKey('postpaid-ui').key!.plaintextKey;
const {GET,POST}=await import('../app/api/account/postpaid/route');
const {NextRequest}=await import('next/server');
const {cloudState,registerCreditGrant}=await import('../lib/postpaid');
const {withTransaction}=await import('../lib/db');
const {spendCredits,grantCredits}=await import('../lib/credits');
const {captureServiceFunding}=await import('../lib/subscription');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const now=new Date().toISOString();
withTransaction(d=>registerCreditGrant(d,'postpaid-ui','test',100,now,new Date(Date.now()+86400000).toISOString()));
const initial=cloudState('postpaid-ui');
const bundled=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{PostpaidSection}from './app/[lang]/account/PostpaidSection';import dict from './dictionaries/zh.json';createRoot(document.getElementById('root')).render(<PostpaidSection lang="zh" dict={dict} initial={${JSON.stringify(initial)}}/>);`,resolveDir:root,loader:'tsx'},define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',tsconfig:path.join(root,'tsconfig.json')});
const server=http.createServer(async(req,res)=>{
 try {
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundled.outputFiles[0].text);return;}
  if(req.url==='/fixture/debt'){withTransaction(d=>spendCredits(d,{userId:'postpaid-ui',amountCents:120,ledgerKind:'service_spend',funding:captureServiceFunding('postpaid-ui'),delivered:true}));res.end('ok');return;}
  if(req.url==='/fixture/pay'){withTransaction(d=>grantCredits(d,{userId:'postpaid-ui',pool:'topup',amountCents:120,ledgerKind:'recharge'}));res.end('ok');return;}
  if(req.url==='/api/account/postpaid'){
   let body='';for await(const part of req)body+=part;
   const request=new NextRequest('http://127.0.0.1/api/account/postpaid',{method:req.method,headers:{authorization:`Bearer ${key}`,'Content-Type':'application/json'},...(req.method==='POST'?{body}:{})});
   const response=await (req.method==='POST'?POST(request):GET(request));res.statusCode=response.status;res.setHeader('Content-Type','application/json');res.end(await response.text());return;
  }
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated postpaid component</title><style>body{font:16px system-ui;max-width:760px;margin:32px auto;padding:16px;line-height:1.6}button,a{margin:12px;padding:8px}dl{display:grid;grid-template-columns:1fr 1fr}dt{font-weight:bold}dd{margin:0}input{margin-right:8px}</style><div id="root"></div><div id="wallet">Synthetic wallet anchor</div><script src="/bundle.js"></script></html>');
 }catch(e){res.statusCode=500;res.end(String(e));}
});
server.listen(0,'127.0.0.1',()=>{const a=server.address() as {port:number};fs.writeFileSync('/tmp/1702-ui-url.txt',`http://127.0.0.1:${a.port}`);console.log(`isolated UI http://127.0.0.1:${a.port}`);});
