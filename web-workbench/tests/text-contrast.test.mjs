// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tokens=Object.fromEntries([...fs.readFileSync(new URL('../src/tokens.css',import.meta.url),'utf8').matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m=>[m[1],m[2]]));
const css=fs.readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
function color(value){
 const alias=/^var\((--[\w-]+)\)$/.exec(value);
 return alias?color(tokens[alias[1]]):value;
}
function luminance(value){
 const hex=color(value);
 assert.match(hex,/^#[\da-f]{6}$/i);
 const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
 return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
}
for(const background of ['--surface','--surface-subtle','--surface-hover']){
 test(`muted small text meets 4.5:1 on ${background}`,()=>{
  const values=[luminance(tokens['--text-muted']),luminance(tokens[background])].sort((a,b)=>a-b);
  assert.ok((values[1]+0.05)/(values[0]+0.05)>=4.5);
 });
}
for(const selector of ['.tree-project small','#chat-input::placeholder','.composer-bottom>span','.ai-disclosure','.message-meta small']){
 test(`${selector} uses readable text color`,()=>{
  const rule=css.split(selector+'{')[1]?.split('}')[0];
  const value=/(?:^|;)color:([^;]+)/.exec(rule)?.[1];
  assert.ok(value,`Missing color for ${selector}`);
  const values=[luminance(value),luminance(tokens['--surface'])].sort((a,b)=>a-b);
  assert.ok((values[1]+0.05)/(values[0]+0.05)>=4.5);
 });
}
