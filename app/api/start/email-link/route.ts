import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/sessions';
import { sendNotifyMail } from '@/lib/mail-notify';
import { siteConfig } from '@/lib/site-config';

/**
 * 移动端「把下载链接发到我的邮箱」（dev-board#304）。
 * 每用户 5 分钟一封（进程内冷却，够用——这是便民按钮不是营销通道）。
 */
export const dynamic = 'force-dynamic';

const lastSent = new Map<string, number>();
const COOLDOWN_MS = 5 * 60_000;

export async function POST() {
    const user = await getSessionUser();
    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (!user.email) {
        return NextResponse.json({ error: 'no_email' }, { status: 400 });
    }
    const last = lastSent.get(user.id) ?? 0;
    if (Date.now() - last < COOLDOWN_MS) {
        return NextResponse.json({ ok: true, throttled: true });
    }
    const url = `${siteConfig.origin}/${siteConfig.defaultLocale}/start`;
    const ok = await sendNotifyMail({
        to: user.email,
        subject: 'AI WorkDeck 桌面端下载链接 / Your AI WorkDeck download link',
        text:
            `在电脑浏览器打开下面的链接，登录后即可下载安装 AI WorkDeck 桌面端：\n${url}\n\n` +
            `Open the link below in your desktop browser and sign in to download AI WorkDeck:\n${url}\n`,
    });
    if (ok) lastSent.set(user.id, Date.now());
    return NextResponse.json({ ok });
}
