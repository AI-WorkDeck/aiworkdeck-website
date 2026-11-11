import 'server-only';

import QRCode from 'qrcode';
import sharp from 'sharp';
import { BADGE_DEFS, FOUNDER_LIMIT, type BadgeAward } from './badges';
import { findUserById } from './users';
import { getSkill } from './skills-store';
import { siteConfig } from './site-config';

/**
 * 徽章证书出图（dev-board#300/#309）：SVG 模板 → sharp(librsvg) → PNG，零新增依赖。
 * 字体走服务器 fontconfig（两台 ECS 已装 Noto Serif/Sans CJK SC；本地 dev 落 Songti
 * 兜底，验收以服务器出图为准）。
 *
 * 多样式（#309，配色心理学研究结论内化）：
 * - 三种布局：seal 纪念章式（居中授勋，仪式感最强）/ editorial 编辑杂志式（出版物
 *   质感）/ ticket 票根式（限量编号叙事）。**核心信息一律压在画面中带**——朋友圈
 *   缩略图按 1:1 居中裁切，只放顶部或底部会被裁没。
 * - 五套配色，全部「底色+主文字+哑金属点缀」结构（奢侈品牌通行公式；金属只做
 *   细线/印章级点缀，大面积金即俗）：forest 墨竹青（品牌默认）/ nightgold 黛金夜律 /
 *   navy 藏蓝老钱 / paper 宣纸墨韵（唯一浅底）/ plum 黛紫朝服。
 * - 无任何「分享得奖励」钩子（微信利诱分享红线），样式自选只为让人愿意晒。
 */

export const CERT_LAYOUTS = ['seal', 'editorial', 'ticket', 'grand', 'sticker', 'bold'] as const;
export type CertLayout = (typeof CERT_LAYOUTS)[number];
export const CERT_PALETTES = ['forest', 'nightgold', 'navy', 'paper', 'plum', 'sakura', 'sakuranight', 'lavender', 'starlit', 'mintcream', 'teal', 'sunset'] as const;
export type CertPalette = (typeof CERT_PALETTES)[number];

export interface Palette {
    /** 背景渐变三阶 */
    bg: [string, string, string];
    /** 主文字 */
    ink: string;
    /** 次级文字（正文/说明） */
    sub: string;
    /** 金属点缀（线框/编号/印记） */
    metal: string;
    /** 高亮（成就名） */
    accent: string;
    /** 水印透明度（浅底要更低） */
    watermarkOpacity: number;
    /** QR 深色模块色 */
    qrDark: string;
    light?: boolean;
}

// 导出给法人格结果卡复用（dev-board#329 维护者拍板：分享卡与证书同权，可选配色样式）
/* ---- 东方清雅换代（dev-board#731）：12 套压到同一套台阶上，但不同质化 ----
 *
 * 色源是 design/tokens/awd-palette.json。默认 forest 直接用令牌值搭起来：
 * 深墨竹青三段渐变（jadeWhite 族之外的品牌深档）+ 竹月青 metal #89A8A0（base.bamboo）
 * + 浅茶金 accent #D7C5A1（base.teaGold）+ 玉脂白 ink #F1EFE7（base.jadeWhite）。
 * paper 那套的 bg 三段直接就是中性令牌 #FCFBF7 / #F1EFE7 / #E4E0D4，metal 用
 * roles.light.gold-text #7E6439（茶金要当文字用时的那一档），accent 用朱砂 danger-text
 * #9A3A30——宣纸配印泥，且能和同为浅底的 mintcream 拉开（两套 accent 的 CIEDE2000
 * 从 2.3 抬到 43.8；bold 版式里 accent 是整块顶栏，撞了就是两套看不出差别）。
 *
 * 其余 10 套是**用户自选的风格**，不是品牌色的复制品：只做「同台阶、同饱和带」的
 * 和声，各自的调子保留。统一口径：
 *   - 深底 8 套：HSL 明度台阶 L 9 / 14 / 20，饱和度带 S 25-33；
 *   - 浅底 4 套：沿用玉脂白的明度台阶 L 98 / 93 / 86，饱和度带 S 40-45
 *     （浅色薄涂时 HSL 的 S 要更高才能换到与深底相当的感知彩度；paper 因为直接
 *      用中性令牌，S 落在 23-45，是唯一一处刻意的台阶外值）。
 *
 * 可区分性（判据落在 bg[1]，也就是选择器上那颗色点）：
 *   - 同明度类内，两两 HSL 色相差 ≥ 25 度。深底最小 26.4 度（forest/teal），
 *     浅底最小 60.0 度（paper/sakura）。
 *   - 跨明度类（深 vs 浅）靠明度分开，最小 CIEDE2000 = 71.9（forest/mintcream）。
 *   - 全 66 对最小 CIEDE2000 = 5.8（starlit/plum）。换代前这个数是 3.8
 *     （navy/starlit），所以辨识度是升不是降。
 *
 * 对比度闸门（WCAG 2.1，对 bg 三段各算一次取最差；ink 压 bg ≥ 4.5:1 因为证书上有
 * 正文，sub 压 bg ≥ 3:1，accent 是巨号成就名同样按 ≥ 3:1 收）——12 套逐套实测值
 * 写在每套的行内注释里，全部通过。
 *
 * 打印：这条链的产物用户会下载、分享、**打印**。8 套深底证书是整页满铺渐变，
 * 家用喷墨打印会大量吃墨且偏色（深档 L9 在纸上基本糊成一团黑）。要打印优先选
 * paper——唯一的浅底、且 bg 直接是中性令牌，最省墨也最接近宣纸观感。
 *
 * 本次决定：**历史已生成的证书图不重出**。编号和画面都已经被用户分享出去了，
 * 重出等于换掉别人手里的那一张；新老并存，只有新的出图请求走新配色。
 */
export const PALETTES: Record<CertPalette, Palette> = {
    /** 墨竹青（品牌默认）：bamboo metal + teaGold accent + jadeWhite ink，三色皆取自令牌 */
    forest: { // ink 9.40:1 / sub 5.75:1 / accent 6.39:1 / metal 4.21:1
        bg: ['#101E1B', '#18302A', '#23433C'],
        ink: '#F1EFE7', sub: 'rgba(241,239,231,0.72)',
        metal: '#89A8A0', accent: '#D7C5A1',
        watermarkOpacity: 0.04, qrDark: '#18302A',
    },
    nightgold: { // ink 9.85:1 / sub 5.53:1 / accent 8.13:1 / metal 6.69:1
        bg: ['#1D1A11', '#2D281A', '#403A26'],
        ink: '#F0EFEA', sub: 'rgba(240,239,234,0.68)',
        metal: '#D7C5A1', accent: '#E3DABF',
        watermarkOpacity: 0.045, qrDark: '#2D281A',
    },
    navy: { // ink 11.74:1 / sub 6.02:1 / accent 8.94:1 / metal 6.26:1
        bg: ['#10141E', '#181F2F', '#232C43'],
        ink: '#EAECF0', sub: 'rgba(234,236,240,0.66)',
        metal: '#BFAC88', accent: '#DDCEB0',
        watermarkOpacity: 0.045, qrDark: '#181F2F',
    },
    paper: { // ink 10.88:1 / sub 4.48:1 / accent 5.27:1 / metal 4.22:1（唯一浅底，也是最适合打印的一套）
        bg: ['#FCFBF7', '#F1EFE7', '#E4E0D4'],
        ink: '#2B2A26', sub: 'rgba(43,42,38,0.68)',
        metal: '#7E6439', accent: '#9A3A30',
        watermarkOpacity: 0.05, qrDark: '#2B2A26', light: true,
    },
    plum: { // ink 11.49:1 / sub 5.91:1 / accent 7.84:1 / metal 6.44:1
        bg: ['#1B111D', '#2B1A2D', '#3D2640'],
        ink: '#EFEBF0', sub: 'rgba(239,235,240,0.66)',
        metal: '#C2B18E', accent: '#D8BCDC',
        watermarkOpacity: 0.045, qrDark: '#2B1A2D',
    },
    /* ---- 年轻向补充（2026-08-31 维护者点名：二次元/女性向也要有，年轻律师很多）。
       仍守「纯而不艳、灰而不脏」：降饱和、金属只做点缀，压得住证书场景 ---- */
    sakura: { // ink 9.11:1 / sub 4.07:1 / accent 6.72:1 / metal 4.30:1
        bg: ['#FCF8F9', '#F5E6E9', '#EACCD2'],
        ink: '#3E282C', sub: 'rgba(62,40,44,0.68)',
        metal: '#894D59', accent: '#68313C',
        watermarkOpacity: 0.05, qrDark: '#3E282C', light: true,
    },
    sakuranight: { // ink 11.51:1 / sub 5.90:1 / accent 8.11:1 / metal 5.64:1
        bg: ['#1D1115', '#2D1A21', '#40262F'],
        ink: '#F0EAEC', sub: 'rgba(240,234,236,0.66)',
        metal: '#CD98AA', accent: '#E5BDCA',
        watermarkOpacity: 0.05, qrDark: '#2D1A21',
    },
    lavender: { // ink 9.15:1 / sub 4.10:1 / accent 7.17:1 / metal 4.27:1
        bg: ['#F9F8FC', '#EBE6F5', '#D7CCEA'],
        ink: '#30283E', sub: 'rgba(48,40,62,0.68)',
        metal: '#68538D', accent: '#463267',
        watermarkOpacity: 0.05, qrDark: '#30283E', light: true,
    },
    starlit: { // ink 12.32:1 / sub 6.23:1 / accent 7.80:1 / metal 5.30:1
        bg: ['#12101E', '#1D192E', '#292442'],
        ink: '#EBEAF0', sub: 'rgba(235,234,240,0.66)',
        metal: '#9D95C6', accent: '#BEB8E0',
        watermarkOpacity: 0.05, qrDark: '#1D192E',
    },
    mintcream: { // ink 8.95:1 / sub 3.89:1 / accent 6.23:1 / metal 3.93:1
        bg: ['#F8FCFB', '#E6F5F0', '#CCEAE0'],
        ink: '#283E37', sub: 'rgba(40,62,55,0.68)',
        metal: '#447967', accent: '#2C594A',
        watermarkOpacity: 0.05, qrDark: '#283E37', light: true,
    },
    teal: { // ink 10.06:1 / sub 5.38:1 / accent 7.41:1 / metal 5.10:1
        bg: ['#101B1E', '#192A2E', '#243C42'],
        ink: '#EAEFF0', sub: 'rgba(234,239,240,0.66)',
        metal: '#8BB2BB', accent: '#B2D4DC',
        watermarkOpacity: 0.045, qrDark: '#192A2E',
    },
    sunset: { // ink 10.96:1 / sub 5.73:1 / accent 7.40:1 / metal 5.25:1
        bg: ['#1E1410', '#2E1F19', '#422D24'],
        ink: '#F0ECEA', sub: 'rgba(240,236,234,0.66)',
        metal: '#C89C89', accent: '#E1BDAD',
        watermarkOpacity: 0.045, qrDark: '#2E1F19',
    },
};

const W = 1080;
const H = 1440;
const SERIF = `'Noto Serif CJK SC','Songti SC','STSong',serif`;
const SANS = `'Noto Sans CJK SC','PingFang SC','Helvetica Neue',sans-serif`;

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface CertModel {
    displayName: string;
    badgeName: string;
    detail: string;
    seqLabel?: string;
    grantLabel: string;
    dateLabel: string;
    certNo: string;
    scan1: string;
    scan2: string;
    host: string;
    qrDataUri: string;
    watermarkChar: string;
    nameSize: number;
    badgeSize: number;
}

async function buildModel(award: BadgeAward, lang: 'zh' | 'en', p: Palette): Promise<CertModel | null> {
    const user = findUserById(award.userId);
    if (!user) return null;
    const def = BADGE_DEFS[award.badgeId];
    const zh = lang === 'zh';
    const displayName = user.displayName || user.username;
    const badgeName = zh ? def.nameZh : def.nameEn;
    const workName = award.skillId ? getSkill(award.skillId)?.name : undefined;
    const detail = workName ? (zh ? `作品「${workName}」` : `Work: ${workName}`) : (zh ? def.descZh : def.descEn);
    const date = new Date(award.awardedAt);
    const dateLabel = zh
        ? `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`
        : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const qrUrl = `${siteConfig.origin}/${siteConfig.defaultLocale}/u/${encodeURIComponent(user.username)}?from=cert`;
    const qrDataUri = await QRCode.toDataURL(qrUrl, {
        margin: 1, width: 320,
        color: { dark: p.qrDark, light: '#FFFFFF' },
    });
    const isAscii = /^[\x00-\xff]+$/.test(displayName);
    return {
        displayName,
        badgeName,
        detail,
        seqLabel: award.seq ? `No. ${award.seq} / ${FOUNDER_LIMIT}` : undefined,
        grantLabel: zh ? '兹授予' : 'Awarded to',
        dateLabel,
        certNo: zh ? `证书编号 ${award.id.toUpperCase()}` : `Certificate ${award.id.toUpperCase()}`,
        scan1: zh ? '扫码认识这位创作者' : 'Scan to meet this creator',
        scan2: zh ? '并发布你自己的 Skill' : 'and publish your own Skill',
        host: siteConfig.host,
        qrDataUri,
        watermarkChar: badgeName.slice(0, 1),
        nameSize: Math.min(72, Math.floor(860 / Math.max(displayName.length, 1)) * (isAscii ? 2 : 1)),
        badgeSize: lang === 'zh'
            ? Math.min(110, Math.floor(880 / Math.max(badgeName.length, 1)))
            : Math.min(96, Math.floor(1800 / Math.max(badgeName.length, 1))),
    };
}

const defs = (p: Palette) => `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${p.bg[0]}"/>
      <stop offset="0.5" stop-color="${p.bg[1]}"/>
      <stop offset="1" stop-color="${p.bg[2]}"/>
    </linearGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${p.metal}" stop-opacity="0"/>
      <stop offset="0.35" stop-color="${p.metal}"/>
      <stop offset="0.65" stop-color="${p.metal}"/>
      <stop offset="1" stop-color="${p.metal}" stop-opacity="0"/>
    </linearGradient>
  </defs>`;

const watermark = (m: CertModel, p: Palette, x = 1040, y = 1180) =>
    `<text x="${x}" y="${y}" text-anchor="end" font-family="${SERIF}" font-weight="900"
        font-size="560" fill="${p.ink}" fill-opacity="${p.watermarkOpacity}">${esc(m.watermarkChar)}</text>`;

const qrBlock = (m: CertModel, p: Palette, x: number, y: number) => `
  <rect x="${x}" y="${y}" width="216" height="216" rx="16" fill="#FFFFFF" ${p.light ? `stroke="${p.metal}" stroke-opacity="0.5" stroke-width="2"` : ''}/>
  <image x="${x + 18}" y="${y + 18}" width="180" height="180" href="${m.qrDataUri}"/>
  <text x="${x + 250}" y="${y + 80}" font-family="${SANS}" font-size="30" fill="${p.ink}" fill-opacity="0.92">${esc(m.scan1)}</text>
  <text x="${x + 250}" y="${y + 130}" font-family="${SANS}" font-size="30" fill="${p.ink}" fill-opacity="0.92">${esc(m.scan2)}</text>
  <text x="${x + 250}" y="${y + 186}" font-family="${SANS}" font-size="24" letter-spacing="2" fill="${p.metal}">${esc(m.host)}</text>`;

/** 纪念章式：居中授勋构图（品牌默认；forest 即首版演进） */
function layoutSeal(m: CertModel, p: Palette): string {
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  ${defs(p)}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${watermark(m, p)}
  <g stroke="${p.ink}" stroke-opacity="0.10" stroke-width="2" fill="none" stroke-linecap="round">
    <path d="M-10 240 H150 L190 280 H330"/>
    <path d="M1090 200 H930 L890 240 H760"/>
    <path d="M-10 1240 H190 L230 1200 H370"/>
  </g>
  <rect x="44" y="44" width="${W - 88}" height="${H - 88}" fill="none" stroke="${p.metal}" stroke-opacity="0.4" stroke-width="2"/>
  <rect x="56" y="56" width="${W - 112}" height="${H - 112}" fill="none" stroke="${p.ink}" stroke-opacity="0.12" stroke-width="1"/>

  <text x="540" y="188" text-anchor="middle" font-family="${SERIF}" font-weight="700" font-size="54" fill="${p.ink}">AI WorkDeck</text>
  <text x="540" y="238" text-anchor="middle" font-family="${SANS}" font-size="22" letter-spacing="10" fill="${p.sub}">SKILL COMMUNITY</text>
  <rect x="390" y="268" width="300" height="2" fill="url(#rule)"/>

  <text x="540" y="400" text-anchor="middle" font-family="${SANS}" font-size="26" letter-spacing="8" fill="${p.sub}">${esc(m.grantLabel)}</text>
  <text x="540" y="${400 + m.nameSize + 40}" text-anchor="middle" font-family="${SERIF}" font-weight="700" font-size="${m.nameSize}" fill="${p.ink}">${esc(m.displayName)}</text>

  <text x="540" y="640" text-anchor="middle" font-family="${SERIF}" font-weight="900" font-size="${m.badgeSize}" fill="${p.accent}">${esc(m.badgeName)}</text>
  ${m.seqLabel ? `<text x="540" y="700" text-anchor="middle" font-family="${SANS}" font-size="30" letter-spacing="6" fill="${p.metal}">${esc(m.seqLabel)}</text>` : ''}
  <text x="540" y="760" text-anchor="middle" font-family="${SANS}" font-size="28" fill="${p.sub}">${esc(m.detail)}</text>

  <text x="540" y="850" text-anchor="middle" font-family="${SANS}" font-size="24" fill="${p.ink}" fill-opacity="0.5">${esc(m.dateLabel)}</text>
  <text x="540" y="890" text-anchor="middle" font-family="${SANS}" font-size="18" letter-spacing="3" fill="${p.ink}" fill-opacity="0.32">${esc(m.certNo)}</text>

  ${qrBlock(m, p, 330, 1010)}
  <rect x="390" y="1310" width="300" height="2" fill="url(#rule)"/>
</svg>`;
}

/** 编辑杂志式：左对齐非对称网格，出版物质感 */
function layoutEditorial(m: CertModel, p: Palette): string {
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  ${defs(p)}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${watermark(m, p, 1060, 560)}
  <rect x="72" y="72" width="936" height="1296" fill="none" stroke="${p.ink}" stroke-opacity="0.14" stroke-width="1"/>
  <rect x="72" y="72" width="6" height="1296" fill="${p.metal}"/>

  <text x="130" y="190" font-family="${SANS}" font-size="22" letter-spacing="10" fill="${p.sub}">AI WORKDECK · SKILL COMMUNITY</text>
  <rect x="130" y="220" width="120" height="3" fill="${p.metal}"/>

  <text x="130" y="330" font-family="${SANS}" font-size="26" letter-spacing="8" fill="${p.sub}">${esc(m.grantLabel)}</text>
  <text x="130" y="${330 + m.nameSize + 44}" font-family="${SERIF}" font-weight="700" font-size="${Math.min(m.nameSize, 88)}" fill="${p.ink}">${esc(m.displayName)}</text>

  <text x="130" y="640" font-family="${SERIF}" font-weight="900" font-size="${Math.min(m.badgeSize, 96)}" fill="${p.accent}">${esc(m.badgeName)}</text>
  ${m.seqLabel ? `<text x="130" y="706" font-family="${SANS}" font-size="30" letter-spacing="6" fill="${p.metal}">${esc(m.seqLabel)}</text>` : ''}
  <text x="130" y="770" font-family="${SANS}" font-size="28" fill="${p.sub}">${esc(m.detail)}</text>

  <rect x="130" y="836" width="820" height="1" fill="${p.ink}" fill-opacity="0.16"/>
  <text x="130" y="892" font-family="${SANS}" font-size="24" fill="${p.ink}" fill-opacity="0.5">${esc(m.dateLabel)}</text>
  <text x="950" y="892" text-anchor="end" font-family="${SANS}" font-size="18" letter-spacing="3" fill="${p.ink}" fill-opacity="0.32">${esc(m.certNo)}</text>

  ${qrBlock(m, p, 130, 1030)}
</svg>`;
}

/** 票根式：主副两联 + 撕裂虚线，副联盛放编号与二维码（限量叙事） */
function layoutTicket(m: CertModel, p: Palette): string {
    const tearY = 980;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  ${defs(p)}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${watermark(m, p, 1040, 780)}
  <rect x="60" y="60" width="960" height="${tearY - 90}" rx="20" fill="none" stroke="${p.metal}" stroke-opacity="0.4" stroke-width="2"/>
  <rect x="60" y="${tearY + 30}" width="960" height="${H - tearY - 90}" rx="20" fill="none" stroke="${p.metal}" stroke-opacity="0.4" stroke-width="2"/>
  <line x1="60" y1="${tearY}" x2="1020" y2="${tearY}" stroke="${p.ink}" stroke-opacity="0.35" stroke-width="2" stroke-dasharray="4 14" stroke-linecap="round"/>
  <circle cx="60" cy="${tearY}" r="18" fill="${p.bg[1]}" stroke="${p.metal}" stroke-opacity="0.4" stroke-width="2"/>
  <circle cx="1020" cy="${tearY}" r="18" fill="${p.bg[1]}" stroke="${p.metal}" stroke-opacity="0.4" stroke-width="2"/>

  <text x="540" y="200" text-anchor="middle" font-family="${SERIF}" font-weight="700" font-size="50" fill="${p.ink}">AI WorkDeck</text>
  <text x="540" y="248" text-anchor="middle" font-family="${SANS}" font-size="20" letter-spacing="9" fill="${p.sub}">SKILL COMMUNITY</text>

  <text x="540" y="380" text-anchor="middle" font-family="${SANS}" font-size="26" letter-spacing="8" fill="${p.sub}">${esc(m.grantLabel)}</text>
  <text x="540" y="${380 + m.nameSize + 36}" text-anchor="middle" font-family="${SERIF}" font-weight="700" font-size="${m.nameSize}" fill="${p.ink}">${esc(m.displayName)}</text>

  <text x="540" y="620" text-anchor="middle" font-family="${SERIF}" font-weight="900" font-size="${Math.min(m.badgeSize, 100)}" fill="${p.accent}">${esc(m.badgeName)}</text>
  <text x="540" y="690" text-anchor="middle" font-family="${SANS}" font-size="28" fill="${p.sub}">${esc(m.detail)}</text>
  <text x="540" y="800" text-anchor="middle" font-family="${SANS}" font-size="24" fill="${p.ink}" fill-opacity="0.5">${esc(m.dateLabel)}</text>
  ${m.seqLabel ? `
  <rect x="400" y="840" width="280" height="64" rx="8" fill="none" stroke="${p.metal}" stroke-opacity="0.7" stroke-width="2"/>
  <text x="540" y="882" text-anchor="middle" font-family="${SANS}" font-size="30" letter-spacing="5" fill="${p.metal}">${esc(m.seqLabel)}</text>` : ''}

  ${qrBlock(m, p, 150, 1080)}
  <text x="930" y="1130" text-anchor="end" font-family="${SANS}" font-size="18" letter-spacing="3" fill="${p.ink}" fill-opacity="0.35">${esc(m.certNo)}</text>
</svg>`;
}

/* ---- 新潮三布局（2026-08-31 维护者点名年轻向；研究裁决：梗感:精致感 3:7，
   中文主字保持水平、旋转交给英文/数字，核心信息压 1:1 缩略图居中安全区 ---- */

/** 巨字压顶（爆炸式排版）：outline 巨字铺底出血 + 实字成就名撑幅 */
function layoutGrand(m: CertModel, p: Palette): string {
    const grandSize = Math.min(190, Math.floor(1040 / Math.max(m.badgeName.length, 1)) + 40);
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  ${defs(p)}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <!-- outline 巨字层：同一成就词描边重复，出血铺上下 -->
  <text x="540" y="150" text-anchor="middle" font-family="${SERIF}" font-weight="900" font-size="${grandSize}"
        fill="none" stroke="${p.ink}" stroke-opacity="0.14" stroke-width="2">${esc(m.badgeName)}</text>
  <text x="540" y="1408" text-anchor="middle" font-family="${SERIF}" font-weight="900" font-size="${grandSize}"
        fill="none" stroke="${p.ink}" stroke-opacity="0.10" stroke-width="2">${esc(m.badgeName)}</text>
  <!-- 旋转条带交给英文 -->
  <g transform="rotate(-7 540 300)">
    <rect x="180" y="272" width="720" height="52" fill="${p.accent}" fill-opacity="0.14"/>
    <text x="540" y="308" text-anchor="middle" font-family="${SANS}" font-size="26" letter-spacing="10" fill="${p.metal}">AI WORKDECK · SKILL COMMUNITY</text>
  </g>

  <text x="540" y="470" text-anchor="middle" font-family="${SANS}" font-size="28" letter-spacing="10" fill="${p.sub}">${esc(m.grantLabel)}</text>
  <text x="540" y="${470 + m.nameSize + 44}" text-anchor="middle" font-family="${SERIF}" font-weight="700" font-size="${Math.min(m.nameSize + 8, 84)}" fill="${p.ink}">${esc(m.displayName)}</text>

  <!-- 实字巨号成就名：画面绝对中心 -->
  <text x="540" y="760" text-anchor="middle" font-family="${SERIF}" font-weight="900" font-size="${grandSize}" fill="${p.accent}">${esc(m.badgeName)}</text>
  ${m.seqLabel ? `<g transform="rotate(4 540 828)"><rect x="386" y="796" width="308" height="58" fill="${p.metal}"/><text x="540" y="836" text-anchor="middle" font-family="${SANS}" font-weight="700" font-size="30" letter-spacing="4" fill="${p.bg[0]}">${esc(m.seqLabel)}</text></g>` : ''}
  <text x="540" y="928" text-anchor="middle" font-family="${SANS}" font-size="28" fill="${p.sub}">${esc(m.detail)}</text>
  <text x="540" y="984" text-anchor="middle" font-family="${SANS}" font-size="23" fill="${p.ink}" fill-opacity="0.5">${esc(m.dateLabel)}  ·  ${esc(m.certNo)}</text>

  ${qrBlock(m, p, 330, 1080)}
</svg>`;
}

/** 星光贴纸（Y2K x 爆款成就卡）：错位圆角模块 + 四芒星贴纸 */
function layoutSticker(m: CertModel, p: Palette): string {
    const card = p.light ? '#FFFFFF' : 'rgba(255,255,255,0.07)';
    const star = (x: number, y: number, r: number, o = 0.9) =>
        `<path transform="translate(${x} ${y}) scale(${r / 20})" d="M0 -20 L5 -5 L20 0 L5 5 L0 20 L-5 5 L-20 0 L-5 -5 Z" fill="${p.metal}" fill-opacity="${o}"/>`;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  ${defs(p)}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${watermark(m, p, 1050, 1300)}
  ${star(140, 200, 26)} ${star(950, 160, 18, 0.7)} ${star(1000, 1240, 22)} ${star(90, 1150, 14, 0.6)} ${star(880, 260, 10, 0.5)}

  <!-- 头标贴纸 -->
  <g transform="rotate(-3 250 170)">
    <rect x="90" y="128" width="330" height="84" rx="42" fill="${p.accent}" fill-opacity="${p.light ? 0.16 : 0.2}" stroke="${p.metal}" stroke-width="2"/>
    <text x="255" y="182" text-anchor="middle" font-family="${SERIF}" font-weight="700" font-size="34" fill="${p.ink}">AI WorkDeck</text>
  </g>
  <g transform="rotate(2 790 210)">
    <rect x="600" y="170" width="380" height="64" rx="32" fill="none" stroke="${p.ink}" stroke-opacity="0.35" stroke-width="2" stroke-dasharray="8 8"/>
    <text x="790" y="213" text-anchor="middle" font-family="${SANS}" font-size="22" letter-spacing="6" fill="${p.sub}">SKILL COMMUNITY</text>
  </g>

  <!-- 主模块：居中大卡，轻微错位 -->
  <g transform="rotate(-1.6 540 700)">
    <rect x="110" y="340" width="860" height="700" rx="36" fill="${card}" stroke="${p.metal}" stroke-width="2.5"/>
    <text x="540" y="452" text-anchor="middle" font-family="${SANS}" font-size="26" letter-spacing="9" fill="${p.sub}">${esc(m.grantLabel)}</text>
    <text x="540" y="${452 + m.nameSize + 40}" text-anchor="middle" font-family="${SERIF}" font-weight="700" font-size="${m.nameSize}" fill="${p.ink}">${esc(m.displayName)}</text>
    <text x="540" y="720" text-anchor="middle" font-family="${SERIF}" font-weight="900" font-size="${Math.min(m.badgeSize, 96)}" fill="${p.accent}">${esc(m.badgeName)}</text>
    ${m.seqLabel ? `<rect x="400" y="756" width="280" height="54" rx="27" fill="${p.metal}" fill-opacity="0.14" stroke="${p.metal}" stroke-width="1.5"/><text x="540" y="793" text-anchor="middle" font-family="${SANS}" font-size="27" letter-spacing="4" fill="${p.metal}">${esc(m.seqLabel)}</text>` : ''}
    <text x="540" y="880" text-anchor="middle" font-family="${SANS}" font-size="27" fill="${p.sub}">${esc(m.detail)}</text>
    <text x="540" y="960" text-anchor="middle" font-family="${SANS}" font-size="22" fill="${p.ink}" fill-opacity="0.5">${esc(m.dateLabel)}</text>
  </g>
  ${star(155, 385, 16)} ${star(925, 1010, 20)}

  <!-- QR 贴纸 -->
  <g transform="rotate(1.8 540 1210)">
    ${qrBlock(m, p, 330, 1100)}
  </g>
</svg>`;
}

/** 撞色硬切（新丑风）：粗边框 + 硬阴影 + 色块碰撞，标题顶格 */
function layoutBold(m: CertModel, p: Palette): string {
    const shadow = (x: number, y: number, w: number, h: number) =>
        `<rect x="${x + 10}" y="${y + 10}" width="${w}" height="${h}" fill="${p.ink}" fill-opacity="${p.light ? 0.9 : 0.55}"/>`;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  ${defs(p)}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="40" y="40" width="1000" height="1360" fill="none" stroke="${p.ink}" stroke-width="7"/>

  <!-- 顶块：accent 色底 + 成就名顶格 -->
  ${shadow(80, 96, 920, 300)}
  <rect x="80" y="96" width="920" height="300" fill="${p.accent}" stroke="${p.ink}" stroke-width="5"/>
  <text x="120" y="196" font-family="${SANS}" font-weight="700" font-size="26" letter-spacing="8" fill="${p.bg[0]}">AI WORKDECK / SKILL COMMUNITY</text>
  <text x="120" y="330" font-family="${SERIF}" font-weight="900" font-size="${Math.min(m.badgeSize + 10, 116)}" fill="${p.bg[0]}">${esc(m.badgeName)}</text>

  <!-- 中块：姓名 -->
  ${shadow(80, 460, 700, 260)}
  <rect x="80" y="460" width="700" height="260" fill="${p.bg[1]}" stroke="${p.ink}" stroke-width="5"/>
  <text x="120" y="548" font-family="${SANS}" font-size="26" letter-spacing="8" fill="${p.sub}">${esc(m.grantLabel)}</text>
  <text x="120" y="${548 + Math.min(m.nameSize, 76) + 30}" font-family="${SERIF}" font-weight="700" font-size="${Math.min(m.nameSize, 76)}" fill="${p.ink}">${esc(m.displayName)}</text>

  <!-- 编号角标块 -->
  ${m.seqLabel ? `${shadow(812, 460, 188, 260)}<rect x="812" y="460" width="188" height="260" fill="${p.metal}" stroke="${p.ink}" stroke-width="5"/><text x="906" y="560" text-anchor="middle" font-family="${SANS}" font-weight="700" font-size="30" fill="${p.bg[0]}">No.</text><text x="906" y="640" text-anchor="middle" font-family="${SERIF}" font-weight="900" font-size="72" fill="${p.bg[0]}">${m.seqLabel.match(/No\. (\d+)/)?.[1] ?? ''}</text><text x="906" y="688" text-anchor="middle" font-family="${SANS}" font-size="24" fill="${p.bg[0]}" fill-opacity="0.8">/ ${FOUNDER_LIMIT}</text>` : ''}

  <!-- 说明条 -->
  <text x="86" y="800" font-family="${SANS}" font-size="28" fill="${p.sub}">${esc(m.detail)}</text>
  <text x="86" y="852" font-family="${SANS}" font-size="23" fill="${p.ink}" fill-opacity="0.55">${esc(m.dateLabel)}  ·  ${esc(m.certNo)}</text>
  <rect x="80" y="892" width="920" height="6" fill="${p.ink}"/>

  <!-- QR 块 -->
  ${shadow(80, 980, 920, 300)}
  <rect x="80" y="980" width="920" height="300" fill="${p.bg[1]}" stroke="${p.ink}" stroke-width="5"/>
  ${qrBlock(m, p, 130, 1022)}
</svg>`;
}

const LAYOUT_FNS: Record<CertLayout, (m: CertModel, p: Palette) => string> = {
    seal: layoutSeal,
    editorial: layoutEditorial,
    ticket: layoutTicket,
    grand: layoutGrand,
    sticker: layoutSticker,
    bold: layoutBold,
};

export async function renderCertificatePng(
    award: BadgeAward,
    lang: 'zh' | 'en',
    layout: CertLayout = 'seal',
    palette: CertPalette = 'forest'
): Promise<Buffer | null> {
    const p = PALETTES[palette];
    const model = await buildModel(award, lang, p);
    if (!model) return null;
    const svg = LAYOUT_FNS[layout](model, p);
    return sharp(Buffer.from(svg), { density: 96 }).png().toBuffer();
}
