#!/usr/bin/env node
/**
 * 试用码签发脚本（PR-W4 前置，随 PR-W3 落地）。
 *
 * 码格式（总 Spec §9）：
 * - payload 6 字节：[0x01(版本), 0x01(type=trial), iat_u32_BE(签发时间戳，秒)]
 * - Ed25519 签名 64 字节（secrets/awd-trial-signing.pem，私钥不入库不打印）
 * - payload + 签名共 70 字节 → RFC 4648 大写 base32（无 padding，112 字符）
 * - 每 4 字符插一个连字符，前缀 AWD-T-
 *
 * 用法：node scripts/gen-trial-code.mjs
 * 输出：一行试用码到 stdout。
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PEM_PATH = path.join(repoRoot, 'secrets', 'awd-trial-signing.pem');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32，大写，无 padding */
function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

function main() {
  if (!fs.existsSync(PEM_PATH)) {
    console.error(`私钥不存在: ${PEM_PATH}`);
    process.exit(1);
  }
  const privateKey = crypto.createPrivateKey(fs.readFileSync(PEM_PATH));

  const payload = Buffer.alloc(6);
  payload[0] = 0x01; // 版本
  payload[1] = 0x01; // type = trial
  payload.writeUInt32BE(Math.floor(Date.now() / 1000), 2); // iat

  const signature = crypto.sign(null, payload, privateKey); // Ed25519, 64 字节
  const raw = Buffer.concat([payload, signature]);

  const encoded = base32Encode(raw);
  const grouped = encoded.match(/.{1,4}/g).join('-');
  process.stdout.write(`AWD-T-${grouped}\n`);
}

main();
