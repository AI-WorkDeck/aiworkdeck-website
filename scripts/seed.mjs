#!/usr/bin/env node
/**
 * 种子数据合并脚本：把 content/seed/{profiles,skills}.json 合并进 data/ 运行时数据。
 *
 * 安全约定（生产服务器直接跑）：
 * - 只增不改不删：已存在的 username / skill id 一律跳过，绝不覆盖真实用户与投稿；
 * - 策展账号用随机密码（不打印明文，登录入口实际不使用这些账号）；
 * - 幂等：重复执行结果一致。
 *
 * 用法：node scripts/seed.mjs
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const root = process.cwd();
const dataDir = path.join(root, 'data');
const seedDir = path.join(root, 'content', 'seed');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

const profiles = readJson(path.join(seedDir, 'profiles.json'), []);
const seedSkills = readJson(path.join(seedDir, 'skills.json'), []);

const usersFile = path.join(dataDir, 'users.json');
const skillsFile = path.join(dataDir, 'skills.json');
const users = readJson(usersFile, []);
const skills = readJson(skillsFile, []);

let usersAdded = 0;
for (const p of profiles) {
  if (users.some(u => u.username === p.username)) continue;
  users.push({
    id: crypto.randomUUID(),
    username: p.username,
    email: `${p.username}@seed.aiworkdeck.com`,
    passwordHash: hashPassword(crypto.randomBytes(24).toString('hex')),
    displayName: p.displayName,
    bio: p.bio,
    createdAt: new Date().toISOString(),
  });
  usersAdded += 1;
}
writeJson(usersFile, users);

const byUsername = new Map(users.map(u => [u.username, u]));
let skillsAdded = 0;
let skipped = 0;
const base = Date.now();
seedSkills.forEach((s, i) => {
  if (skills.some(x => x.id === s.id)) {
    skipped += 1;
    return;
  }
  const author = byUsername.get(s.authorUsername);
  if (!author) {
    console.error(`[seed] 跳过 ${s.id}：找不到策展账号 ${s.authorUsername}`);
    skipped += 1;
    return;
  }
  // 按数组顺序错开 1 分钟，保证「最新」排序稳定
  const at = new Date(base - (seedSkills.length - i) * 60_000).toISOString();
  skills.push({
    id: s.id,
    name: s.name,
    description: s.description,
    icon: s.icon || '🧩',
    triggers: s.triggers,
    allowedTools: s.allowedTools || [],
    output: s.output || undefined,
    prompt: s.prompt,
    category: s.category || undefined,
    featured: s.featured || undefined,
    origin: s.origin || undefined,
    version: s.version || '1.0.0',
    authorId: author.id,
    downloads: 0,
    createdAt: at,
    updatedAt: at,
  });
  skillsAdded += 1;
});
writeJson(skillsFile, skills);

console.log(`[seed] 用户 +${usersAdded}（现共 ${users.length}），Skill +${skillsAdded} 跳过 ${skipped}（现共 ${skills.length}）`);
