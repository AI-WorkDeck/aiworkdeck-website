/**
 * 生成 public/og.png（1200×630 社交分享卡片）。
 *
 * **一次性脚本，产物入库**。不用 Next 的 ImageResponse 动态生成：那是每次请求现渲染
 * 一张图，而生产机只有 1.8G 内存、同时跑四个站点（见 next.config.ts 里那次 OOM 事故）。
 * 分享卡片一年也变不了两次，没有理由让它常驻在请求路径上。
 *
 * 文案两站通用，所以图上不写域名——同一份 og.png 由 cn 与 intl 两站共用。
 *
 * 改了文案或配色后重跑：`node scripts/gen-og.mjs`，然后把 public/og.png 一并提交。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'public', 'og.png');
const ICON = path.join(root, 'app', 'icon.png');

const W = 1200;
const H = 630;
// 东方清雅体系（design/tokens/awd-palette.json）：accent-hover 墨竹青深 #254A41 / accent 墨竹青 #2E5A50 / bamboo 竹月青 #89A8A0
const FOREST_DARKER = '#254A41';
const FOREST_MID = '#2E5A50';
const MINT = '#89A8A0';

// 图标底板：icon.png 自带白底，所以给它一块白色圆角板，边界才干净
const TILE = 208;
const TILE_X = 88;
const TILE_Y = (H - TILE) / 2;
const ICON_SIZE = 168;

const SANS = "Helvetica Neue, Helvetica, Arial, sans-serif";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${FOREST_DARKER}"/>
      <stop offset="50%" stop-color="${FOREST_MID}"/>
      <stop offset="100%" stop-color="${FOREST_DARKER}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="${TILE_X}" y="${TILE_Y}" width="${TILE}" height="${TILE}" rx="44" fill="#FFFFFF"/>
  <text x="352" y="286" font-family="${SANS}" font-size="82" font-weight="700" fill="#FFFFFF">AI WorkDeck</text>
  <rect x="354" y="326" width="72" height="4" rx="2" fill="${MINT}"/>
  <text x="352" y="392" font-family="${SANS}" font-size="38" font-weight="500" fill="#FFFFFF" opacity="0.9">Legal AI Workspace &amp; IDE for Lawyers</text>
  <text x="352" y="446" font-family="${SANS}" font-size="26" font-weight="400" fill="${MINT}" opacity="0.85">Open source · Local-first · Windows / macOS</text>
</svg>`;

const icon = await sharp(ICON).resize(ICON_SIZE, ICON_SIZE).png().toBuffer();

await sharp(Buffer.from(svg))
    .composite([
        {
            input: icon,
            left: Math.round(TILE_X + (TILE - ICON_SIZE) / 2),
            top: Math.round(TILE_Y + (TILE - ICON_SIZE) / 2),
        },
    ])
    .png({ compressionLevel: 9 })
    .toFile(OUT);

const { size } = fs.statSync(OUT);
console.log(`写入 ${path.relative(root, OUT)}（${W}×${H}，${(size / 1024).toFixed(1)} KB）`);
