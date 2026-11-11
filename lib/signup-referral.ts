import fs from 'fs';
import path from 'path';

/** Preserve the existing WeChat referral conversion log without recording contact or credentials. */
export function logVerifiedSignupReferral(raw: unknown, created: boolean, userId: string): void {
  if (typeof raw !== 'string' || raw.length > 64 || !/^u-[a-z0-9][a-z0-9-]{2,29}$/.test(raw)) return;
  try {
    fs.appendFileSync(path.join(process.cwd(), 'data', 'wx-phone.jsonl'), JSON.stringify({
      at: new Date().toISOString(), ref: raw, created, userId, source: 'website',
    }) + '\n');
  } catch { /* Conversion analytics never prevent authentication. */ }
}
