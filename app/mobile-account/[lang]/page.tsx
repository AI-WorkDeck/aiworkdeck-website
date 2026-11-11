import { getDictionary } from '@/get-dictionary';
import { type Locale } from '@/i18n-config';
import { mobileAccountCopy } from '@/content/mobile-account';
import { codeChannelReady } from '@/lib/login-channel';
import { captchaClientConfig } from '@/lib/captcha';
import { AuthForms } from '@/app/[lang]/account/AuthForms';
import { LegacyEmailForm } from '@/app/[lang]/account/LegacyEmailForm';
import { bqtScanEnabled } from '@/lib/bqt-auth';
import { phoneIsAccount } from '@/lib/phone-policy';
import { getSessionUser } from '@/lib/sessions';
import { maskPhoneForName } from '@/lib/users';
import { mailEnabled } from '@/lib/mail-auth';

export const dynamic = 'force-dynamic';

export default async function MobileAccountPage({ params, searchParams }: {
    params: Promise<{ lang: Locale }>;
    searchParams: Promise<{ legacyEmail?: string }>;
}) {
    const { lang } = await params;
    const copy = mobileAccountCopy(lang);
    const dict = await getDictionary(lang);
    const { legacyEmail } = await searchParams;
    const migrateEmail = phoneIsAccount() && legacyEmail === '1';
    const user = migrateEmail ? await getSessionUser() : null;
    return <div className="mx-auto max-w-md px-4 py-12">
        <h1 className="mb-3 text-2xl font-semibold text-king-forest">{copy.title}</h1>
        {!migrateEmail && <p className="mb-6 text-sm leading-relaxed text-neutral-gray-dark">{copy.intro}</p>}
        {migrateEmail && user?.phone && user.passwordHash
            ? <LegacyEmailForm lang={lang} dict={dict} mobileHandoff phoneLabel={maskPhoneForName(user.phone)} mailReady={mailEnabled()} captcha={captchaClientConfig()} />
            : <AuthForms bqtEnabled={bqtScanEnabled()} lang={lang} dict={dict} mobileHandoff legacyEmail={migrateEmail} codeChannelReady={codeChannelReady()} captcha={captchaClientConfig()} />}
    </div>;
}
