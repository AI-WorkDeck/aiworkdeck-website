/** Official mobile store listings. Single source for every page that advertises the mobile app. */
export const MOBILE_STORES = {
    appStore: 'https://apps.apple.com/app/id6803309103',
    appStoreCn: 'https://apps.apple.com/cn/app/id6803309103',
    googlePlay: 'https://play.google.com/store/apps/details?id=com.aiworkdeck.mobile',
    tencentMyApp: 'https://sj.qq.com/appdetail/com.aiworkdeck.mobile.cn',
} as const;

export type AppLinkDecision =
    | { kind: 'redirect'; url: string }
    | { kind: 'choose'; wechatBlocked: boolean };

/** Decide where the smart /app link sends a visitor, by User-Agent and site. */
export function resolveAppLink(ua: string, site: 'cn' | 'intl'): AppLinkDecision {
    const cn = site === 'cn';
    if (/iPhone|iPad|iPod/i.test(ua)) {
        return { kind: 'redirect', url: cn ? MOBILE_STORES.appStoreCn : MOBILE_STORES.appStore };
    }
    if (/Android/i.test(ua)) {
        if (cn) return { kind: 'redirect', url: MOBILE_STORES.tencentMyApp };
        // WeChat's in-app browser blocks Google Play links
        if (/MicroMessenger/i.test(ua)) return { kind: 'choose', wechatBlocked: true };
        return { kind: 'redirect', url: MOBILE_STORES.googlePlay };
    }
    return { kind: 'choose', wechatBlocked: false };
}
