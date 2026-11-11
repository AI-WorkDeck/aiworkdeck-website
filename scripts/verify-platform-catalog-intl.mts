// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import fs from 'node:fs';
assert.ok(!fs.existsSync('data')&&!fs.existsSync('package.json'),'Use a fresh temporary cwd');
process.env.NEXT_PUBLIC_AWD_SITE='intl';process.env.OPENROUTER_MODEL='new-provider/new-model';
const model=(id:string,price:unknown='0.000001',output=['text'])=>({id,name:id,context_length:32000,pricing:{prompt:price,completion:'0.000002'},architecture:{input_modalities:['text'],output_modalities:output},supported_parameters:['tools']});
globalThis.fetch=async(url)=>{assert.equal(String(url),'https://openrouter.ai/api/v1/models');return Response.json({data:[model('new-provider/new-model'),model('qwen/test-free','0'),model('no-price',null),model('image-only','0',['image'])]});};
const {listAiModels,defaultAiModel,resolveAiModel}=await import('@/lib/ai-models');
assert.deepEqual((await listAiModels()).map(m=>m.id),['new-provider/new-model','qwen/test-free']);
assert.equal((await defaultAiModel()).id,'new-provider/new-model');assert.equal((await resolveAiModel('qwen/test-free')).id,'qwen/test-free');assert.equal((await resolveAiModel('unknown')).id,'new-provider/new-model');
process.env.OPENROUTER_MODEL='removed-model';assert.equal((await defaultAiModel()).id,'new-provider/new-model');
console.log('PASS: international Skill catalog follows supplier text capabilities and actual prices; configured/fallback defaults are catalog-bound');
