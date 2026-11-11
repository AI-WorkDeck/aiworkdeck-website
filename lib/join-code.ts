import crypto from 'crypto';

/**
 * 团队 / 律所邀请码（dev-board#496 设计稿 §10.1）。
 *
 * 8 位大写字母数字，**去掉 0/O/1/I**：这个码要被人念出来、抄在纸上、发在微信里，
 * 留着易混字符等于把「加入失败」变成日常。字母表 32 个字符 → 8 位约 40 bit，
 * 配合服务端「猜错就 404」足够挡住蒙码（没有枚举接口，也没有按前缀检索）。
 *
 * 生成用 `crypto.randomInt`（拒绝采样，均匀）而不是 `Math.random()`：
 * 这个码是加入团队的唯一凭据，可预测的随机源等于把邀请码作废。
 *
 * 唯一性由库上的 UNIQUE 索引兜底，调用方用 `generateUniqueJoinCode` 重试拿一个空位。
 */
export const JOIN_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const JOIN_CODE_LENGTH = 8;

export function generateJoinCode(): string {
  let out = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    out += JOIN_CODE_ALPHABET[crypto.randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * 规范化用户输入的码：去空白、转大写。**不做字符替换**（O→0 之类）：
 * 字母表里本来就没有那些字符，替换只会把「抄错了」变成「换个错法」。
 */
export function normalizeJoinCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== JOIN_CODE_LENGTH) return null;
  for (const ch of code) {
    if (!JOIN_CODE_ALPHABET.includes(ch)) return null;
  }
  return code;
}

/** 取一个 `taken(code)` 说没被占用的码。撞 32^8 分之一的概率，10 次还撞不上就是别处坏了。 */
export function generateUniqueJoinCode(taken: (code: string) => boolean): string {
  for (let i = 0; i < 10; i++) {
    const code = generateJoinCode();
    if (!taken(code)) return code;
  }
  throw new Error('join code generation failed');
}
