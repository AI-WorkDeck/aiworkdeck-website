import { NextRequest, NextResponse } from 'next/server';
import { getLatestRelease, RELEASES_PAGE_URL } from '@/lib/latest-release';
import { SITE_ID, siteConfig } from '@/lib/site-config';
import { signDownloadUrl } from '@/lib/download-sign';
import { CN_ANDROID_RELEASE } from '@/lib/mobile-release';

/**
 * 下载出口：签发 CDN 限时签名直链并 302（dev-board#1053 去掉登录门，签名防盗链保留）。
 * 桌面端安装包走 dl.aiworkdeck.com 时附 CDN 限时签名（lib/download-sign.ts）；
 * GitHub 兜底直链与 Office 插件安装器直接放行（后者托管在 addin 域名，本来公开）。
 *
 * 错误信封沿用全站惯例 `{ error: '…' }`（unknown_target）。**文案不许含「登录/未授权/请先」
 * 中文子串**——桌面端 api.js 用这些子串判定掉线清会话（lib/api-result.ts 顶部有记）。
 */
export const dynamic = 'force-dynamic';

const ADDIN_TARGETS: Record<string, string> = {
    'addin-mac': '/office-addin/dl/AI-WorkDeck-Office-Addin.dmg',
    'addin-win': '/office-addin/dl/AI-WorkDeck-Office-Addin.exe',
};

export async function GET(request: NextRequest) {
    const target = request.nextUrl.searchParams.get('target') ?? '';

    if (target === 'mac' || target === 'win') {
        const release = await getLatestRelease();
        const asset = target === 'mac' ? release?.mac : release?.win;
        // 该平台本版没出包或清单拉不到：落 releases 列表页，与 /start 页面的兜底一致
        return NextResponse.redirect(asset ? signDownloadUrl(asset.url) : RELEASES_PAGE_URL, 302);
    }

    if (target === 'android-cn' && SITE_ID === 'cn') {
        return NextResponse.redirect(signDownloadUrl(CN_ANDROID_RELEASE.url), 302);
    }

    const addinPath = ADDIN_TARGETS[target];
    if (addinPath) {
        return NextResponse.redirect(`${siteConfig.addinOrigin}${addinPath}`, 302);
    }

    return NextResponse.json({ error: 'unknown_target' }, { status: 400 });
}
