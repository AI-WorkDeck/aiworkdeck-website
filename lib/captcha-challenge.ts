// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import crypto from 'crypto';
import sharp from 'sharp';
import { withTransaction } from './db';
import { assertCodeSendAllowed, CodeSendBlocked } from './code-send-guard';

export type ChallengeContext = { account: string; purpose: 'login' | 'reset' };
const TTL = 3 * 60_000;
const WINDOW = 10 * 60_000;
const hash = (id: string, answer: string) => crypto.createHash('sha256').update(`${id}:${answer}`).digest('hex');

/** Persist issuance quotas as well as consumed challenges, shared across server workers. */
export async function issueChallenge(context: ChallengeContext, ip: string) {
  const now = Date.now();
  const id = crypto.randomBytes(24).toString('base64url');
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const answer = Array.from({ length: 6 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  withTransaction(db => {
    assertCodeSendAllowed(ip);
    db.prepare('DELETE FROM captcha_challenge WHERE createdAt < ?').run(now - WINDOW);
    const count = (where: string, key?: string) => (db.prepare(`SELECT COUNT(*) AS n FROM captcha_challenge WHERE createdAt > ? ${where}`).get(...(key === undefined ? [now - WINDOW] : [now - WINDOW, key])) as { n: number }).n;
    if (count('') >= 1000 || count('AND ip = ?', ip) >= 30 || count('AND account = ?', context.account) >= 10) {
      throw new CodeSendBlocked('Too many verification attempts');
    }
    db.prepare('INSERT INTO captcha_challenge(id,answerHash,account,purpose,ip,createdAt,expiresAt) VALUES(?,?,?,?,?,?,?)')
      .run(id, hash(id, answer), context.account, context.purpose, ip, now, now + TTL);
  });
  // Rasterize server-side: neither the answer nor SVG text reaches the client.
  const letters = [...answer].map((c, i) => `<text x="${20 + i * 29}" y="48" transform="rotate(${crypto.randomInt(-17, 18)} ${20 + i * 29} 42)" font-family="sans-serif" font-weight="bold" font-size="32" fill="#24483d">${c}</text>`).join('');
  const noise = Array.from({ length: 7 }, () => `<path d="M${crypto.randomInt(210)} ${crypto.randomInt(70)} Q${crypto.randomInt(210)} ${crypto.randomInt(70)} ${crypto.randomInt(210)} ${crypto.randomInt(70)}" fill="none" stroke="#829d92" stroke-width="1.2"/>`).join('');
  const png = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="210" height="70"><rect width="210" height="70" fill="#f5f3eb"/>${letters}${noise}</svg>`)).png().toBuffer();
  return { id, image: `data:image/png;base64,${png.toString('base64')}`, expiresAt: now + TTL };
}

/** Every attempt consumes the challenge, including a wrong answer or mismatched binding. */
export function consumeChallenge(token: string, context: ChallengeContext | undefined, ip: string): boolean {
  const match = /^local:([A-Za-z0-9_-]{32}):([A-Za-z0-9]{1,12})$/.exec(token);
  if (!match || !context) return false;
  const [, id, answer] = match;
  return withTransaction(db => {
    const row = db.prepare('SELECT * FROM captcha_challenge WHERE id = ?').get(id) as { answerHash: string; account: string; purpose: string; ip: string; expiresAt: number; consumed: number } | undefined;
    if (!row || row.consumed) return false;
    db.prepare('UPDATE captcha_challenge SET consumed = 1 WHERE id = ?').run(id);
    return row.expiresAt > Date.now() && row.account === context.account && row.purpose === context.purpose && row.ip === ip && row.answerHash === hash(id, answer.toUpperCase());
  });
}
