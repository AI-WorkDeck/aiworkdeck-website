import 'server-only';

import QRCode from 'qrcode';
import sharp from 'sharp';
import { QUIZ_TYPE_MAP, type QuizType } from './quiz-data';
import { PALETTES, CERT_PALETTES, type CertPalette, type Palette } from './certificate';
import { siteConfig } from './site-config';

/**
 * 「法人格」结果卡出图（dev-board#329）：复用证书管线（SVG → sharp(librsvg) → PNG），
 * 同样走服务器 fontconfig（Noto Serif/Sans CJK SC，本地 dev 落 Songti 兜底）。
 *
 * 样式自选（维护者 2026-08-31 拍板：与证书同权）：12 套配色直接复用证书 PALETTES，
 * 布局取证书六式中最适配卡片内容的三式（纪念章/杂志/巨字）。识别度不靠锁死底色，
 * 靠固定的版式骨架——「法人格」题头 + 类型名 + 双句判词 + 稀缺行 + 回路二维码。
 *
 * 不变式：卡上二维码指回 /quiz（?from=qcard 记回流率）；底部固定
 * 「仅供娱乐 · 非心理学测评」——法律人受众会较真专业性，坦诚荒诞比伪科学安全。
 */

export const QUIZ_CARD_LAYOUTS = ['seal', 'editorial', 'grand'] as const;
export type QuizCardLayout = (typeof QUIZ_CARD_LAYOUTS)[number];
export { CERT_PALETTES as QUIZ_CARD_PALETTES, type CertPalette as QuizCardPalette };

const W = 1080;
const H = 1440;
const SERIF = `'Noto Serif CJK SC','Songti SC','STSong',serif`;
const SANS = `'Noto Sans CJK SC','PingFang SC','Helvetica Neue',sans-serif`;

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface CardModel {
    brandZh: string;
    brandEn: string;
    owner: string;
    name: string;
    nameSize: number;
    dimsRow: string;
    toil: string;
    praise: string;
    rarityLine: string;
    scan1: string;
    scan2: string;
    host: string;
    disclaimer: string;
    qrDataUri: string;
    watermarkChar: string;
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

const qrBlock = (m: CardModel, p: Palette, x: number, y: number) => `
  <rect x="${x}" y="${y}" width="216" height="216" rx="16" fill="#FFFFFF" ${p.light ? `stroke="${p.metal}" stroke-opacity="0.5" stroke-width="2"` : ''}/>
  <image x="${x + 18}" y="${y + 18}" width="180" height="180" href="${m.qrDataUri}"/>
  <text x="${x + 250}" y="${y + 76}" font-family="${SANS}" font-size="30" fill="${p.ink}" fill-opacity="0.92">${esc(m.scan1)}</text>
  <text x="${x + 250}" y="${y + 126}" font-family="${SANS}" font-size="30" fill="${p.ink}" fill-opacity="0.92">${esc(m.scan2)}</text>
  <text x="${x + 250}" y="${y + 182}" font-family="${SANS}" font-size="24" letter-spacing="2" fill="${p.metal}">${esc(m.host)}</text>`;

/** 纪念章式：居中构图（默认；v1 首版即此骨架） */
function layoutSeal(m: CardModel, p: Palette): string {
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  ${defs(p)}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <text x="1046" y="1200" text-anchor="end" font-family="${SERIF}" font-weight="900"
        font-size="560" fill="${p.ink}" fill-opacity="${p.watermarkOpacity}">${esc(m.watermarkChar)}</text>
  <g stroke="${p.ink}" stroke-opacity="0.10" stroke-width="2" fill="none" stroke-linecap="round">
    <path d="M-10 220 H150 L190 260 H330"/>
    <path d="M1090 180 H930 L890 220 H760"/>
  </g>
  <rect x="44" y="44" width="${W - 88}" height="${H - 88}" fill="none" stroke="${p.metal}" stroke-opacity="0.4" stroke-width="2"/>
  <rect x="56" y="56" width="${W - 112}" height="${H - 112}" fill="none" stroke="${p.ink}" stroke-opacity="0.12" stroke-width="1"/>

  <text x="540" y="178" text-anchor="middle" font-family="${SERIF}" font-weight="700" font-size="46" fill="${p.ink}">${esc(m.brandZh)}</text>
  <text x="540" y="226" text-anchor="middle" font-family="${SANS}" font-size="21" letter-spacing="9" fill="${p.sub}">${esc(m.brandEn)}</text>
  <rect x="390" y="256" width="300" height="2" fill="url(#rule)"/>

  <text x="540" y="368" text-anchor="middle" font-family="${SANS}" font-size="28" letter-spacing="6" fill="${p.sub}">${esc(m.owner)}</text>
  <text x="540" y="${368 + m.nameSize + 84}" text-anchor="middle" font-family="${SERIF}" font-weight="900" font-size="${m.nameSize}" fill="${p.accent}">${esc(m.name)}</text>
  <text x="540" y="716" text-anchor="middle" font-family="${SANS}" font-size="30" letter-spacing="4" fill="${p.metal}">${esc(m.dimsRow)}</text>

  <text x="540" y="800" text-anchor="middle" font-family="${SANS}" font-size="31" fill="${p.sub}">${esc(m.toil)}</text>
  <text x="540" y="856" text-anchor="middle" font-family="${SANS}" font-size="31" fill="${p.ink}">${esc(m.praise)}</text>

  <rect x="330" y="924" width="420" height="1" fill="${p.metal}" fill-opacity="0.5"/>
  <text x="540" y="980" text-anchor="middle" font-family="${SANS}" font-size="26" letter-spacing="2" fill="${p.metal}">${esc(m.rarityLine)}</text>

  ${qrBlock(m, p, 330, 1052)}
  <text x="540" y="1354" text-anchor="middle" font-family="${SANS}" font-size="19" letter-spacing="2" fill="${p.ink}" fill-opacity="0.35">AI WorkDeck · ${esc(m.disclaimer)}</text>
</svg>`;
}

/** 编辑杂志式：左对齐非对称网格（对齐证书 editorial 的骨架语言） */
function layoutEditorial(m: CardModel, p: Palette): string {
    const nameSize = Math.min(m.nameSize, 150);
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  ${defs(p)}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <text x="1060" y="600" text-anchor="end" font-family="${SERIF}" font-weight="900"
        font-size="560" fill="${p.ink}" fill-opacity="${p.watermarkOpacity}">${esc(m.watermarkChar)}</text>
  <rect x="72" y="72" width="936" height="1296" fill="none" stroke="${p.ink}" stroke-opacity="0.14" stroke-width="1"/>
  <rect x="72" y="72" width="6" height="1296" fill="${p.metal}"/>

  <text x="130" y="184" font-family="${SANS}" font-size="22" letter-spacing="10" fill="${p.sub}">${esc(m.brandEn)}</text>
  <rect x="130" y="214" width="120" height="3" fill="${p.metal}"/>

  <text x="130" y="330" font-family="${SANS}" font-size="27" letter-spacing="6" fill="${p.sub}">${esc(m.owner)}</text>
  <text x="130" y="${330 + nameSize + 70}" font-family="${SERIF}" font-weight="900" font-size="${nameSize}" fill="${p.accent}">${esc(m.name)}</text>
  <text x="130" y="640" font-family="${SANS}" font-size="30" letter-spacing="4" fill="${p.metal}">${esc(m.dimsRow)}</text>

  <text x="130" y="768" font-family="${SANS}" font-size="31" fill="${p.sub}">${esc(m.toil)}</text>
  <text x="130" y="824" font-family="${SANS}" font-size="31" fill="${p.ink}">${esc(m.praise)}</text>

  <rect x="130" y="900" width="820" height="1" fill="${p.ink}" fill-opacity="0.16"/>
  <text x="130" y="962" font-family="${SANS}" font-size="26" letter-spacing="2" fill="${p.metal}">${esc(m.rarityLine)}</text>

  ${qrBlock(m, p, 130, 1052)}
  <text x="130" y="1340" font-family="${SANS}" font-size="19" letter-spacing="2" fill="${p.ink}" fill-opacity="0.35">AI WorkDeck · ${esc(m.disclaimer)}</text>
</svg>`;
}

/** 巨字压顶：outline 巨字铺底出血 + 实字类型名撑幅（对齐证书 grand） */
function layoutGrand(m: CardModel, p: Palette): string {
    const grandSize = Math.min(210, Math.floor(1040 / Math.max(m.name.length, 1)) + 40);
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  ${defs(p)}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <text x="540" y="150" text-anchor="middle" font-family="${SERIF}" font-weight="900" font-size="${grandSize}"
        fill="none" stroke="${p.ink}" stroke-opacity="0.14" stroke-width="2">${esc(m.name)}</text>
  <text x="540" y="1420" text-anchor="middle" font-family="${SERIF}" font-weight="900" font-size="${grandSize}"
        fill="none" stroke="${p.ink}" stroke-opacity="0.10" stroke-width="2">${esc(m.name)}</text>
  <g transform="rotate(-7 540 300)">
    <rect x="180" y="272" width="720" height="52" fill="${p.accent}" fill-opacity="0.14"/>
    <text x="540" y="308" text-anchor="middle" font-family="${SANS}" font-size="25" letter-spacing="9" fill="${p.metal}">${esc(m.brandEn)}</text>
  </g>

  <text x="540" y="452" text-anchor="middle" font-family="${SANS}" font-size="28" letter-spacing="6" fill="${p.sub}">${esc(m.owner)}</text>
  <text x="540" y="656" text-anchor="middle" font-family="${SERIF}" font-weight="900" font-size="${grandSize}" fill="${p.accent}">${esc(m.name)}</text>
  <g transform="rotate(4 540 724)">
    <rect x="330" y="694" width="420" height="56" fill="${p.metal}"/>
    <text x="540" y="733" text-anchor="middle" font-family="${SANS}" font-weight="700" font-size="28" letter-spacing="3" fill="${p.bg[0]}">${esc(m.dimsRow)}</text>
  </g>

  <text x="540" y="850" text-anchor="middle" font-family="${SANS}" font-size="31" fill="${p.sub}">${esc(m.toil)}</text>
  <text x="540" y="906" text-anchor="middle" font-family="${SANS}" font-size="31" fill="${p.ink}">${esc(m.praise)}</text>
  <text x="540" y="990" text-anchor="middle" font-family="${SANS}" font-size="26" letter-spacing="2" fill="${p.metal}">${esc(m.rarityLine)}</text>

  ${qrBlock(m, p, 330, 1060)}
  <text x="540" y="1352" text-anchor="middle" font-family="${SANS}" font-size="19" letter-spacing="2" fill="${p.ink}" fill-opacity="0.35">AI WorkDeck · ${esc(m.disclaimer)}</text>
</svg>`;
}

const LAYOUT_FNS: Record<QuizCardLayout, (m: CardModel, p: Palette) => string> = {
    seal: layoutSeal,
    editorial: layoutEditorial,
    grand: layoutGrand,
};

export interface QuizCardInput {
    typeId: string;
    dims: [number, number, number];
    nickname?: string;
    lang: 'zh' | 'en';
    layout?: QuizCardLayout;
    palette?: CertPalette;
    /** 全网第几位解锁该类型（参与感编号，客户端按完成统计传入；无则只显稀缺行） */
    seq?: number;
    /** 文案版本：peer=同行梗版（默认，苦劳自嘲），biz=客户名片版（专业定位句，仅执业池有） */
    variant?: 'peer' | 'biz';
}

export async function renderQuizCardPng(input: QuizCardInput): Promise<Buffer | null> {
    const type: QuizType | undefined = QUIZ_TYPE_MAP[input.typeId];
    if (!type) return null;
    const zh = input.lang === 'zh';
    const p = PALETTES[input.palette ?? 'forest'];

    const name = zh ? type.nameZh : type.nameEn;
    const dimLabels = zh ? ['卷度', '抗压', '锋利'] : ['GRIND', 'NERVE', 'EDGE'];
    const qrUrl = `${siteConfig.origin}/${siteConfig.defaultLocale}/quiz?from=qcard`;
    const qrDataUri = await QRCode.toDataURL(qrUrl, {
        margin: 1, width: 320,
        color: { dark: p.qrDark, light: '#FFFFFF' },
    });

    const m: CardModel = {
        brandZh: zh ? '法人格' : 'Legal Persona',
        brandEn: zh ? 'LEGAL PERSONA TEST' : 'WHICH LEGAL MIND ARE YOU',
        owner: input.nickname
            ? (zh ? `${input.nickname} 的法人格` : `${input.nickname}’s legal persona`)
            : (zh ? '你的法人格' : 'Your legal persona'),
        name,
        // 中文类型名 2–6 字；英文靠总长压字号
        nameSize: zh
            ? Math.min(190, Math.floor(940 / Math.max(name.length, 2)))
            : Math.min(120, Math.floor(1900 / Math.max(name.length, 6))),
        dimsRow: input.dims.map((v, i) => `${dimLabels[i]} ${v}`).join(' · '),
        // 名片版把苦劳自嘲句换成专业定位句（无 biz 文案的类型静默回落梗版）
        toil: input.variant === 'biz' && type.bizZh
            ? (zh ? type.bizZh : type.bizEn!)
            : (zh ? type.toilZh : type.toilEn),
        praise: zh ? type.praiseZh : type.praiseEn,
        rarityLine: input.seq
            ? (zh
                ? `全国第 ${input.seq} 位解锁 · 仅 ${type.rarity}% 的法律人是这个类型`
                : `No.${input.seq} nationwide · only ${type.rarity}% share this type`)
            : (zh
                ? `全国仅 ${type.rarity}% 的法律人是这个类型`
                : `Only ${type.rarity}% of legal minds share this type`),
        scan1: zh ? '扫码测测' : 'Scan to find',
        scan2: zh ? '你是哪种法律人' : 'your legal persona',
        host: siteConfig.host,
        disclaimer: zh ? '仅供娱乐 · 非心理学测评' : 'For fun only · not a psychological assessment',
        qrDataUri,
        watermarkChar: name.slice(0, 1),
    };

    const svg = LAYOUT_FNS[input.layout ?? 'seal'](m, p);
    return sharp(Buffer.from(svg), { density: 96 }).png().toBuffer();
}
