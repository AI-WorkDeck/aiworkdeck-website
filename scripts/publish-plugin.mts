/**
 * 官方插件上架脚本（维护者侧）。三方作者仍走网站的上传页 + 后台审核；
 * 这个脚本只服务「我们自己发布的插件」——它调的是同一套真实代码：
 * submitPlugin() 受理（含自动扫描、files 哈希、体积与路径校验），
 * 再 approvePlugin() 按管理员动作签名上架。没有任何绕过校验的旁路。
 *
 * 必须在网站部署目录下运行（plugins-store 按 process.cwd()/data 读写），
 * 且 env 里要有 AWD_PLUGIN_SIGNING_KEY，否则 approve 会以 signing_not_configured 失败。
 *
 *   cd /www/wwwroot/www.aiworkdeck.com/new
 *   set -a && . ./.env.local && set +a
 *   node publish-plugin.mjs <插件.zip> [--price-cents N] [--dry-run]
 *
 * 本地自测（不碰真实数据）：在一个空目录里跑，data/ 会建在那个空目录下。
 */
import fs from 'fs';
import path from 'path';

// 打包成 CJS 跑（adm-zip 是 CJS，ESM 打包下 require 垫片会炸），所以这里用 require。
declare const require: (m: string) => unknown;

const AUTHOR = { id: 'awd-official', username: 'AI Workdeck' };

const args = process.argv.slice(2);
const zipPath = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const priceArg = args.find((a) => a.startsWith('--price-cents='));
const priceCents = priceArg ? Number(priceArg.split('=')[1]) : 0;

if (!zipPath) {
  console.error('用法：node publish-plugin.mjs <插件.zip> [--price-cents=N] [--dry-run]');
  process.exit(1);
}
if (!fs.existsSync(zipPath)) {
  console.error('找不到 zip：' + zipPath);
  process.exit(1);
}

const { submitPlugin, approvePlugin, getPlugin } = require('@/lib/plugins-store') as typeof import('@/lib/plugins-store');

const buf = fs.readFileSync(path.resolve(zipPath));
console.log(`受理 ${path.basename(zipPath)}（${buf.length} 字节），作者 ${AUTHOR.username}`);

const res = submitPlugin(buf, AUTHOR, { priceCents });
if (!('plugin' in res) || !res.plugin) {
  console.error('受理失败：' + (res as { error?: string }).error + ' ' + ((res as { detail?: string }).detail || ''));
  process.exit(2);
}
const p = res.plugin;
console.log(`受理通过：${p.id}@${p.version}「${p.name}」，${Object.keys(p.files).length} 个文件 / ${p.size} 字节`);
console.log('声明权限：' + (p.permissions.join(', ') || '（无）'));
console.log('工具：' + p.tools.map((t) => t.name).join(', '));

// 扫描报告是审核依据，必须打出来给人看——不打就等于自动通过
const scan = p.scan as unknown as Record<string, unknown> | undefined;
if (scan) console.log('扫描报告：' + JSON.stringify(scan).slice(0, 1200));

if (dryRun) {
  console.log('--dry-run：停在 pending，不签名不上架。');
  process.exit(0);
}

const appr = approvePlugin(p.id, p.version);
if (!appr.ok) {
  console.error('上架失败：' + appr.reason + (appr.reason === 'signing_not_configured' ? '（env 缺 AWD_PLUGIN_SIGNING_KEY）' : ''));
  process.exit(3);
}
const after = getPlugin(p.id, p.version);
console.log(`已上架：status=${after?.status} publishedAt=${after?.publishedAt} 签名长度=${(after?.signature || '').length}`);
console.log(`价格：${p.priceCents ? p.priceCents + ' 分' : '免费'}`);
