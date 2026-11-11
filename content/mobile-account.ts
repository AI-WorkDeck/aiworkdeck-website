import { type Locale, toBaseLocale } from '@/i18n-config';
import { SITE_ID, siteConfig } from '@/lib/site-config';

export function mobileAccountCopy(lang: Locale) {
    return toBaseLocale(lang) === 'zh' ? {
        title: 'AI WorkDeck 手机账户',
        intro: `${SITE_ID === 'intl' ? '国际区' : '中国区'} · ${siteConfig.legalEntity.nameZh}。完成注册或重设密码后，请返回应用，并选择相同服务区域登录。`,
        completeTitle: '账户已准备好',
        completeBody: '请返回 AI WorkDeck 应用，在相同服务区域使用账户和密码登录。现在可以关闭此页面。',
    } : {
        title: 'AI WorkDeck Mobile Account',
        intro: `${SITE_ID === 'intl' ? 'International' : 'China'} service · ${siteConfig.legalEntity.nameEn}. After registration or password reset, return to the app and sign in to the same service region.`,
        completeTitle: 'Your account is ready',
        completeBody: 'Return to the AI WorkDeck app and sign in with your account and password in the same service region. You can close this page now.',
    };
}
