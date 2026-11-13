import QRCode from 'qrcode';
import { SITE_ID, siteConfig } from '@/lib/site-config';
import { CN_ANDROID_RELEASE } from '@/lib/mobile-release';
import { MOBILE_STORES } from '@/lib/mobile-stores';

type Copy = {
    title: string;
    body: string;
    tencentMyApp: string;
    apkLink: string;
    details: string;
    checksum: string;
    scan: string;
};

/** Store buttons first (device-matching store on top), direct APK last and quiet (cn only). */
export async function MobileAppSection({ t, ua, showQr = false }: { t: Copy; ua: string; showQr?: boolean }) {
    const cn = SITE_ID === 'cn';
    const ios = /iPhone|iPad|iPod/i.test(ua);
    const android = /Android/i.test(ua);
    const appStore = { key: 'ios', label: 'App Store · iPhone / iPad', href: cn ? MOBILE_STORES.appStoreCn : MOBILE_STORES.appStore };
    const androidStore = cn
        ? { key: 'android', label: `${t.tencentMyApp} · Android`, href: MOBILE_STORES.tencentMyApp }
        : { key: 'android', label: 'Google Play · Android', href: MOBILE_STORES.googlePlay };
    const buttons = android && !ios ? [androidStore, appStore] : [appStore, androidStore];

    const qrSvg = showQr ? await QRCode.toString(`${siteConfig.origin}/app`, { type: 'svg', margin: 1, width: 132 }) : null;

    return (
        <section className="mb-5 rounded-xl border border-neutral-gray-light bg-white p-5">
            <h2 className="text-lg font-semibold text-neutral-dark-bg">{t.title}</h2>
            <p className="mt-2 text-sm text-neutral-gray-dark">{t.body}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-4">
                <div className="flex flex-wrap gap-3">
                    {buttons.map((b) => (
                        <a
                            key={b.key}
                            href={b.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="edition-button"
                        >
                            {b.label}
                        </a>
                    ))}
                </div>
                {qrSvg && (
                    <figure className="flex items-center gap-3">
                        <div className="h-[132px] w-[132px] shrink-0 rounded-md border border-neutral-gray-light bg-white" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                        <figcaption className="max-w-[10rem] text-xs text-neutral-gray-medium">{t.scan}</figcaption>
                    </figure>
                )}
            </div>
            {cn && (
                <div className="mt-4 text-xs text-neutral-gray-medium">
                    <a href="/api/download?target=android-cn" className="underline underline-offset-4 hover:text-neutral-dark-bg">{t.apkLink}</a>
                    <span className="ml-2">{t.details.replace('{version}', CN_ANDROID_RELEASE.version).replace('{size}', (CN_ANDROID_RELEASE.bytes / 1_000_000).toFixed(1))}</span>
                    <details className="mt-2">
                        <summary className="cursor-pointer">{t.checksum}</summary>
                        <code dir="ltr" className="mt-2 block break-all">SHA-256: {CN_ANDROID_RELEASE.sha256}</code>
                    </details>
                </div>
            )}
        </section>
    );
}
