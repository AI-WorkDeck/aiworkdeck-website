import fs from 'fs';
import path from 'path';

/**
 * 网关配置：供应商凭证 + 两个全局阈值。
 *
 * 优先级 **环境变量 > data/gateway-config.json**，与 lib/ai-config.ts 同一形态。
 * 该文件含真实供应商密钥，必须保持 gitignore。整个 `data/` 目录已经整体忽略
 * （曾经是逐个文件列的，本文件一度漏在名单外，见 .gitignore 里的说明）。
 *
 * 为什么凭证不进 service_pricing 表：那张表是**计价**的权威，admin 页要能随便看、
 * 随便调；密钥进去等于把管理页变成密钥展示页。两者的读者和变更频率也不同。
 */

const CONFIG_FILE = path.join(process.cwd(), 'data', 'gateway-config.json');

export interface GatewayVendorConfig {
    /** 博查搜索 */
    bochaApiKey?: string;
    /** 阿里云共用 RAM 凭证（听悟 ASR / OSS 走这组；OCR 有专用组时不用它） */
    aliyunAccessKeyId?: string;
    aliyunAccessKeySecret?: string;
    /** 通义听悟 */
    tingwuAppKey?: string;
    tingwuRegion?: string;
    /** 音频中转 OSS */
    ossBucket?: string;
    ossEndpoint?: string;
    /** 阿里云 OCR。RAM 最小权限下 ocr:* 与 tingwu:*+OSS 是两个互斥的子用户，
     * 所以 OCR 允许一组专用凭证；不配时回落到上面那组共用凭证（老部署不受影响）。 */
    ocrAccessKeyId?: string;
    ocrAccessKeySecret?: string;
    ocrEndpoint?: string;
    ocrRegionId?: string;
    /** 企查查 */
    qichachaKey?: string;
    qichachaSecret?: string;
    /** 企查查「智能体数据平台」MCP Bearer（知识产权等查询，与 REST key 是两把独立凭证） */
    qichachaMcpToken?: string;
    /** Tushare */
    tushareToken?: string;
    /** 北大法宝 */
    pkulawToken?: string;
    /** 账单查询（成本台账拉阿里云账户余额用，RAM 子用户只挂 AliyunBSSReadOnlyAccess） */
    billingAccessKeyId?: string;
    billingAccessKeySecret?: string;
}

export interface GatewayThresholds {
    /**
     * 超过这个估算金额（分）的调用走预扣，否则事后扣。
     *
     * **判据是金额不是服务名**——写死服务名的话，以后单价一调就会出现
     * 「一笔很贵的调用没预扣」。默认取「一次典型 AI 对话」的量级。
     */
    holdThresholdCents: number;
    /** 预扣的存活时长（分钟）。超过仍未结算的 hold 由回收任务处理。 */
    holdTtlMinutes: number;
    /**
     * 新用户注册赠额（分，落 reward 批次）。默认 1990 = 19.9 元。
     *
     * 维护者定的**限时活动**：没有赠额时「解锁即可用」不成立（createUser 不发任何
     * Credits，新账户余额恒 0），新用户第一次点转写就撞上「余额不足」。
     *
     * 赠额恒走 reward 批次（24 个月有效期、不可退现），落 topup 等于把送出去的钱
     * 洗成可退现的真金白银——见 lib/credits.ts 顶部那张表，这是合规红线不是风格问题。
     */
    signupGrantCents: number;
    /**
     * 活动窗口（ISO 时刻，null = 该侧不设边界）。窗口之外注册不发赠额。
     *
     * 为什么活动要有窗口而不是「想停的时候把金额改成 0」：手工改配置停活动，意味着
     * 停的那一刻之前谁都说不清活动什么时候结束；有了 endAt，官网文案、桌面端提示和
     * 实际发放读的是**同一个时刻**，也不会有人在活动早已结束后因为忘了改配置而继续白发。
     */
    signupGrantStartAt: string | null;
    signupGrantEndAt: string | null;
}

const DEFAULT_THRESHOLDS: GatewayThresholds = {
    holdThresholdCents: 500,
    holdTtlMinutes: 240,
    signupGrantCents: 1990,
    signupGrantStartAt: null,
    signupGrantEndAt: null,
};

interface FileShape extends GatewayVendorConfig, Partial<GatewayThresholds> {}

function readFileConfig(): FileShape {
    try {
        if (!fs.existsSync(CONFIG_FILE)) return {};
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as FileShape;
    } catch {
        return {};
    }
}

function nonNegOr(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function positiveOr(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * 读一个时刻配置。**读不成合法时刻一律当成没配（null）**，不做任何猜测：
 * 一个写错的边界要么让活动永远不开，要么让它永远不关，两种都比「按没配处理」更糟。
 */
function isoOrNull(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    const t = Date.parse(value);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function getVendorConfig(): GatewayVendorConfig {
    const f = readFileConfig();
    const aliyunAccessKeyId = process.env.GW_ALIYUN_AK_ID || f.aliyunAccessKeyId || undefined;
    const aliyunAccessKeySecret = process.env.GW_ALIYUN_AK_SECRET || f.aliyunAccessKeySecret || undefined;
    return {
        bochaApiKey: process.env.GW_BOCHA_API_KEY || f.bochaApiKey || undefined,
        aliyunAccessKeyId,
        aliyunAccessKeySecret,
        tingwuAppKey: process.env.GW_TINGWU_APP_KEY || f.tingwuAppKey || undefined,
        tingwuRegion: process.env.GW_TINGWU_REGION || f.tingwuRegion || 'cn-beijing',
        ossBucket: process.env.GW_OSS_BUCKET || f.ossBucket || undefined,
        ossEndpoint: process.env.GW_OSS_ENDPOINT || f.ossEndpoint || undefined,
        // OCR 专用凭证缺省回落共用组：id 与 secret 必须**成对**取自同一来源，
        // 混搭（专用 id + 共用 secret）只会得到一个签名永远不对的客户端
        ocrAccessKeyId: process.env.GW_OCR_AK_ID || f.ocrAccessKeyId || aliyunAccessKeyId,
        ocrAccessKeySecret: (process.env.GW_OCR_AK_ID || f.ocrAccessKeyId)
            ? (process.env.GW_OCR_AK_SECRET || f.ocrAccessKeySecret)
            : aliyunAccessKeySecret,
        ocrEndpoint: process.env.GW_OCR_ENDPOINT || f.ocrEndpoint || undefined,
        ocrRegionId: process.env.GW_OCR_REGION_ID || f.ocrRegionId || undefined,
        qichachaKey: process.env.GW_QICHACHA_KEY || f.qichachaKey || undefined,
        qichachaSecret: process.env.GW_QICHACHA_SECRET || f.qichachaSecret || undefined,
        qichachaMcpToken: process.env.GW_QICHACHA_MCP_TOKEN || f.qichachaMcpToken || undefined,
        tushareToken: process.env.GW_TUSHARE_TOKEN || f.tushareToken || undefined,
        pkulawToken: process.env.GW_PKULAW_TOKEN || f.pkulawToken || undefined,
        // 账单凭证同样要求成对：不回落到共用组——asr 子用户没有 BSS 权限，
        // 回落只会把「没配」变成「配了但恒 403」这种更难排查的形态
        billingAccessKeyId: process.env.GW_BILLING_AK_ID || f.billingAccessKeyId || undefined,
        billingAccessKeySecret: process.env.GW_BILLING_AK_SECRET || f.billingAccessKeySecret || undefined,
    };
}

export function getThresholds(): GatewayThresholds {
    const f = readFileConfig();
    return {
        holdThresholdCents: nonNegOr(
            process.env.GW_HOLD_THRESHOLD_CENTS ?? f.holdThresholdCents,
            DEFAULT_THRESHOLDS.holdThresholdCents
        ),
        holdTtlMinutes: positiveOr(
            process.env.GW_HOLD_TTL_MINUTES ?? f.holdTtlMinutes,
            DEFAULT_THRESHOLDS.holdTtlMinutes
        ),
        signupGrantCents: nonNegOr(
            process.env.GW_SIGNUP_GRANT_CENTS ?? f.signupGrantCents,
            DEFAULT_THRESHOLDS.signupGrantCents
        ),
        signupGrantStartAt: isoOrNull(process.env.GW_SIGNUP_GRANT_START_AT ?? f.signupGrantStartAt),
        signupGrantEndAt: isoOrNull(process.env.GW_SIGNUP_GRANT_END_AT ?? f.signupGrantEndAt),
    };
}

/** 管理后台保存（只写文件层，环境变量不落库） */
export function saveGatewayConfig(patch: Partial<FileShape>) {
    const dataDir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const next = { ...readFileConfig(), ...patch };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
}
