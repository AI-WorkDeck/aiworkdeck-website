// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// zh-hant pages must not show Simplified-only characters (POLISH X33). The character list was derived once with
// OpenCC (cn->tw) from the characters our zh texts actually use, minus ones that are also valid Traditional
// (干 台 于 里 后 只 面 才 发 松 范 准 佈 制 系 周 游 冲 谷 钟 丑 朴 卜 占 划). The registered company name stays Simplified.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const SIMPLIFIED = new Set([...'万与专业东丢两严丧个临为举么义乐习书买乱争云产亲仅从仓们价众优伙会传伤体余侧偿储儿兑兰关内册写决况净减几凭击则刚创删别剥办务动励劳区华协单卖却历压参双变号吗听启员咨响团围国图场块垫声壳处备复够头夹夺奖娱学宁宝实审宽对寻导将尔尝尽层届属岁币师带帮并广库应废开异弃张弹强归当录征径忆态总恶惯愿战户执扩扫扰抛护报担拟拢拥拦择挂损换据揽携摆摊数断无旧时昵显晋暂术机杂权条来构标栏树样档桥检槛横樱欢欧毕气汇沟没泄浅测济浏润湾溃滚满滥点炼热爱状独献环现琐电画畅盐监盖着码础硕确离种积称税稳竞笔筛筹签简类紧纠红约级纪纬纯纳纷纸纹线练组细织终绍经绑结绕给络绝统继绩绪续维综缀缓缔编缩缴网罗罚职联脏脑脚脱脸腾节苹荐荣获营蓝虚衔补装见观规视览觉触誉计订认讨让训议讯记讲许论讼设访证评识诈诉诊词译试诚话询该详语误说请诺读谁调谅谈谢谱负贡财责败账货质购贴贵费资赋赔赖赚赠跃踪车转轮软轴轻载较辅辉辑输辖辩边达迁过运还这进远违连迟迹适选遗遥邮采释针钥钮钱银链销锁锅错锚键镜长门闭问闲间闻阅阉队阶际陆陈险随隐难雾霁静页顶项顺须顾顿颁预领频题额风馈马驳驻验骤鸿齐']);
const EXEMPT = ['北京公富信息技术有限公司', '统一社会信用代码'];
const strings = o => Array.isArray(o) ? o.flatMap(strings) : o && typeof o === 'object' ? Object.values(o).flatMap(strings) : typeof o === 'string' ? [o] : [];
const files = { 'dictionaries/zh-hant.json': strings(JSON.parse(fs.readFileSync('dictionaries/zh-hant.json', 'utf8'))) };
for (const f of ['privacy-zh-hant', 'terms-zh-hant', 'privacy-intl-zh-hant', 'terms-intl-zh-hant']) {
  const src = fs.readFileSync(`content/legal/${f}.ts`, 'utf8');
  files[f] = [...src.slice(src.indexOf('export const legalDoc')).matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map(m => m[1]);
}
for (const [file, list] of Object.entries(files)) {
  const bad = list.map(s => EXEMPT.reduce((t, e) => t.split(e).join(''), s)).filter(s => [...s].some(ch => SIMPLIFIED.has(ch)));
  assert.equal(bad.length, 0, `${file}: ${bad.length} strings with Simplified characters, e.g. ${JSON.stringify(bad.slice(0, 3))}`);
}
console.log('PASS zh-hant dictionary and legal pages: no Simplified-only characters (' + SIMPLIFIED.size + ' checked)');
