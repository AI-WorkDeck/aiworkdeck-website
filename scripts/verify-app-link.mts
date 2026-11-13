/**
 * 智能短链 /app 的 UA → 目标映射验收（纯函数，无需起服务）。
 *   REPO=$PWD npx tsx --tsconfig $REPO/tsconfig.json $REPO/scripts/verify-app-link.mts
 */
import assert from 'assert';
import { MOBILE_STORES, resolveAppLink } from '@/lib/mobile-stores';

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const AND = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';
const AND_WX = AND + ' MicroMessenger/8.0.47';
const IOS_WX = IOS + ' MicroMessenger/8.0.47';
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';

const redirect = (url: string) => ({ kind: 'redirect', url });
assert.deepStrictEqual(resolveAppLink(IOS, 'cn'), redirect(MOBILE_STORES.appStoreCn));
assert.deepStrictEqual(resolveAppLink(IPAD, 'cn'), redirect(MOBILE_STORES.appStoreCn));
assert.deepStrictEqual(resolveAppLink(IOS, 'intl'), redirect(MOBILE_STORES.appStore));
assert.deepStrictEqual(resolveAppLink(IOS_WX, 'intl'), redirect(MOBILE_STORES.appStore));
assert.deepStrictEqual(resolveAppLink(AND, 'cn'), redirect(MOBILE_STORES.tencentMyApp));
assert.deepStrictEqual(resolveAppLink(AND_WX, 'cn'), redirect(MOBILE_STORES.tencentMyApp));
assert.deepStrictEqual(resolveAppLink(AND, 'intl'), redirect(MOBILE_STORES.googlePlay));
assert.deepStrictEqual(resolveAppLink(AND_WX, 'intl'), { kind: 'choose', wechatBlocked: true });
for (const site of ['cn', 'intl'] as const) {
    assert.deepStrictEqual(resolveAppLink(DESKTOP, site), { kind: 'choose', wechatBlocked: false });
    assert.deepStrictEqual(resolveAppLink('', site), { kind: 'choose', wechatBlocked: false });
}
console.log('verify-app-link OK');
