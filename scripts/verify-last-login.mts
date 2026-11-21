import assert from 'node:assert/strict';
import fs from 'node:fs';
assert.ok(!fs.existsSync('package.json'), 'Run in an empty temporary directory');
const { createUser, findUserById, recordUserLogin, markUserDeleted } = await import('../lib/users');
const { createSession, deleteSession, getUserByToken } = await import('../lib/sessions');
const { issueLoginKey, revokeApiKey } = await import('../lib/api-keys');
const { user } = await createUser({username: 'login-test', email: 'login@example.test', password: 'test-password-only', displayName: 'Test'});
assert.ok(user);
assert.equal(findUserById(user.id)?.lastLoginAt, undefined);
const session = createSession(user.id);
const first = findUserById(user.id)?.lastLoginAt;
assert.ok(first);
getUserByToken(session.token);
assert.equal(findUserById(user.id)?.lastLoginAt, first, 'Reading a session is not a login');
deleteSession(session.token);
assert.equal(findUserById(user.id)?.lastLoginAt, first, 'Logout preserves login history');
recordUserLogin(user.id, '2000-01-01T00:00:00.000Z');
assert.equal(findUserById(user.id)?.lastLoginAt, first, 'Older writes cannot move time backwards');
const key = issueLoginKey(user.id, 'test-client');
assert.equal(findUserById(user.id)?.lastLoginAt, key.info.createdAt);
revokeApiKey(user.id, key.info.id);
assert.equal(findUserById(user.id)?.lastLoginAt, key.info.createdAt, 'Key revocation preserves login history');
console.log('PASS: unknown history, browser/client login, reads, logout, revocation, monotonic timestamp');

markUserDeleted(user.id, 'Deleted');
assert.equal(findUserById(user.id)?.lastLoginAt, undefined);
recordUserLogin(user.id, new Date().toISOString());
assert.equal(findUserById(user.id)?.lastLoginAt, undefined, 'Deleted users cannot receive new login history');

// 最后活跃：Key 使用按小时节流落库，后台概览取 Key / 平台调用 / 钱包流水的最晚值
{
  const { getDb } = await import('../lib/db');
  const { findUserByApiKey } = await import('../lib/api-keys');
  const { NextRequest } = await import('next/server');
  const { GET } = await import('../app/api/admin/overview/route');
  const { user: active } = await createUser({username: 'active-test', email: 'active@example.test', password: 'test-password-only', displayName: 'Active'});
  assert.ok(active);
  const users = JSON.parse(fs.readFileSync('data/users.json', 'utf8'));
  users.find((u: { id: string }) => u.id === active.id).phone = '13800000000';
  fs.writeFileSync('data/users.json', JSON.stringify(users));
  const issued = issueLoginKey(active.id, 'test-client');
  const lastUsed = () => (getDb().prepare('SELECT lastUsedAt FROM api_keys WHERE id = ?').get(issued.info.id) as { lastUsedAt: string | null }).lastUsedAt;
  assert.equal(lastUsed(), null);
  assert.equal(findUserByApiKey(issued.plaintextKey)?.id, active.id);
  const firstUse = lastUsed();
  assert.ok(firstUse, 'First key use is recorded');
  findUserByApiKey(issued.plaintextKey);
  assert.equal(lastUsed(), firstUse, 'Uses within the hour do not rewrite');
  getDb().prepare('UPDATE api_keys SET lastUsedAt = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', issued.info.id);
  findUserByApiKey(issued.plaintextKey);
  assert.ok(lastUsed()! > '2000-01-01T00:00:00.000Z', 'Uses after the hour refresh the timestamp');

  process.env.AWD_ADMIN_TOKEN = 'verify-admin-token-1!';
  const overview = async () => {
    const res = await GET(new NextRequest('https://console.example/api/admin/overview', { headers: { cookie: 'awd_admin=verify-admin-token-1!' } }));
    assert.equal(res.status, 200);
    return ((await res.json()).users as { username: string; lastActiveAt: string | null; lastLoginAt: string | null }[]).find(u => u.username === 'active-test')!;
  };
  assert.equal((await overview()).lastActiveAt, lastUsed());
  getDb().prepare("INSERT INTO wallet_ledger (userId, ts, kind, amountCents, balanceAfterCents) VALUES (?, '2999-01-01T00:00:00.000Z', 'adjust', 0, 0)").run(active.id);
  const row = await overview();
  assert.equal(row.lastActiveAt, '2999-01-01T00:00:00.000Z', 'Latest of key use and ledger wins');
  assert.equal(row.lastLoginAt, issued.info.createdAt, 'Last login is unchanged by activity');
  console.log('PASS: key use throttled hourly; admin overview lastActiveAt = latest activity');
}
