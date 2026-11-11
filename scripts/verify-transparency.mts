/**
 * 账目公开（dev-board#611 / #612）的验证脚本。
 * 必须在一个空目录里执行（data/awd.db 与 users.json 会建在 cwd，与真实数据隔离）：
 *   cd <空目录> && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-transparency.mts
 *
 * 守住的是「公开账目不许出错」这件事的几条底线：
 * - 期次边界按 UTC+8，年底那几单不许串期；非法期次必须抛错而不是静默兜底
 * - 自动取数的口径：已支付未退款才算收入、退款与待支付不算、已注销账号不计
 * - 汇总算术（含按汇率合并人民币）
 * - **草稿一个字都不出去**：公开接口不列草稿，草稿期的凭证 404
 * - 凭证文件真的落盘、删除真的删文件
 * - 静态护栏：Navbar 的固定浅色底、sitemap、两份词典的 transparencyPage 键树一致
 */
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const cwd = process.cwd();
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
console.log('isolated cwd =', cwd);
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');

fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });

// 三个账号：两个在 2026H1 之前/之内注册，一个已注销（不计入任何口径）
fs.writeFileSync(
    path.join(cwd, 'data', 'users.json'),
    JSON.stringify([
        { id: 'u-old', username: 'old', email: 'old@t.local', passwordHash: 'x:y', displayName: 'Old', createdAt: '2025-11-02T03:00:00.000Z' },
        { id: 'u-new', username: 'new', email: 'new@t.local', passwordHash: 'x:y', displayName: 'New', createdAt: '2026-03-10T03:00:00.000Z' },
        { id: 'u-gone', username: 'gone', email: '', passwordHash: '', displayName: '已注销', createdAt: '2026-02-01T03:00:00.000Z', deletedAt: '2026-04-01T03:00:00.000Z' },
    ])
);

// GitHub / 远端一律不真打：整个脚本期间 fetch 由桩接管
type FetchStub = (url: string, init?: RequestInit) => Promise<Response> | Response;
let fetchStub: FetchStub = () => {
    throw new Error('未预期的网络请求');
};
globalThis.fetch = ((url: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(fetchStub(String(url), init))) as typeof fetch;

const { getDb } = await import('@/lib/db');
const T = await import('@/lib/transparency');
const A = await import('@/lib/transparency-auto');
const { gatewayCostDetail } = await import('@/lib/cost-ledger');

let passed = 0;
function ok(name: string) {
    passed++;
    console.log('  PASS', name);
}

const db = getDb();

// ---------------------------------------------------------------------------
console.log('\n[1] parsePeriod：UTC+8 边界与非法输入');
// ---------------------------------------------------------------------------
{
    const h1 = T.parsePeriod('2026H1');
    // 2026-01-01 00:00 +08:00 = 2025-12-31T16:00:00Z
    assert.strictEqual(h1.from, '2025-12-31T16:00:00.000Z');
    assert.strictEqual(h1.to, '2026-06-30T16:00:00.000Z');
    assert.strictEqual(h1.label, '2026 年上半年');
    const h2 = T.parsePeriod('2026H2');
    assert.strictEqual(h2.from, '2026-06-30T16:00:00.000Z');
    assert.strictEqual(h2.to, '2026-12-31T16:00:00.000Z');
    // 上半年的终点恰是下半年的起点，中间不留缝也不重叠
    assert.strictEqual(h1.to, h2.from);
    ok('H1/H2 边界按北京时间零点折算，首尾严丝合缝');

    for (const bad of ['2026', '2026H3', '26H1', '2026h1', '', 'abc', '1999H1', '2200H2']) {
        assert.throws(() => T.parsePeriod(bad), `应拒绝：${JSON.stringify(bad)}`);
    }
    ok('非法期次一律抛错，不静默兜底');

    // currentPeriod 也按北京时间切：UTC 6 月 30 日 17:00 在北京已是 7 月 1 日
    assert.strictEqual(T.currentPeriod(Date.parse('2026-06-30T17:00:00.000Z')), '2026H2');
    assert.strictEqual(T.currentPeriod(Date.parse('2026-06-30T15:00:00.000Z')), '2026H1');
    ok('currentPeriod 的切换点也在北京时间零点');
}

// ---------------------------------------------------------------------------
console.log('\n[2] 造数据：订单 / 遥测 / 快照 / 网关流水');
// ---------------------------------------------------------------------------
{
    const insertOrder = db.prepare(
        `INSERT INTO orders (id, outTradeNo, userId, kind, description, amountCents, status,
                             channel, currency, createdAt, paidAt, refundedAt)
         VALUES (?, ?, ?, 'recharge', '', ?, ?, ?, ?, ?, ?, ?)`
    );
    // 期内已付微信单（计入）
    insertOrder.run('o1', 'T1', 'u-old', 10000, 'paid', 'wxpay', 'CNY', '2026-03-01T00:00:00.000Z', '2026-03-01T00:10:00.000Z', null);
    insertOrder.run('o2', 'T2', 'u-new', 2500, 'paid', 'wxpay', 'CNY', '2026-04-01T00:00:00.000Z', '2026-04-01T00:10:00.000Z', null);
    // 期内已付但已退款（不计）
    insertOrder.run('o3', 'T3', 'u-old', 9900, 'paid', 'wxpay', 'CNY', '2026-05-01T00:00:00.000Z', '2026-05-01T00:10:00.000Z', '2026-05-09T00:00:00.000Z');
    // 期内已付 Stripe 美元单（单独一行、单独币种）
    insertOrder.run('o4', 'T4', 'u-new', 1900, 'paid', 'stripe', 'USD', '2026-02-02T00:00:00.000Z', '2026-02-02T00:10:00.000Z', null);
    // 期外（下半年）已付（不计）
    insertOrder.run('o5', 'T5', 'u-new', 5000, 'paid', 'wxpay', 'CNY', '2026-08-01T00:00:00.000Z', '2026-08-01T00:10:00.000Z', null);
    // 期内未支付（不计）
    insertOrder.run('o6', 'T6', 'u-new', 7000, 'pending', 'wxpay', 'CNY', '2026-03-03T00:00:00.000Z', null, null);

    const tr = db.prepare(
        `INSERT INTO telemetry_rollup (installId, date, appVersion, platform, payload, receivedAt)
         VALUES (?, ?, '1.0.0', 'darwin', '{}', ?)`
    );
    tr.run('i-1', '2026-01-05', '2026-01-05T00:00:00.000Z');
    tr.run('i-1', '2026-06-20', '2026-06-20T00:00:00.000Z'); // 同一安装第二天，去重后仍是 1
    tr.run('i-2', '2026-06-25', '2026-06-25T00:00:00.000Z');
    tr.run('i-3', '2026-07-05', '2026-07-05T00:00:00.000Z'); // 期外，不计入 2026H1 累计

    const snap = db.prepare(
        'INSERT INTO cost_snapshot (service, ts, balanceMinor, usageMinor, source) VALUES (?, ?, ?, ?, ?)'
    );
    snap.run('openrouter', '2025-12-20T00:00:00.000Z', 50000, 12000, 'auto'); // 期初前
    snap.run('openrouter', '2026-06-20T00:00:00.000Z', 30000, 45000, 'auto'); // 期末前
    snap.run('openrouter', '2026-08-01T00:00:00.000Z', 20000, 60000, 'auto'); // 期外，不该被取到

    // 企查查：3 次调用 × 2 单位，采购成本 7 分/单位 → 42 分
    // 迁移已经种了 qichacha 的定价行，这里只把采购成本单价钉成已知值（REPLACE 会重置其余列）
    db.prepare(
        `INSERT INTO service_pricing (service, op, unit, costCentsPerUnit, marginMultiplier,
                                      creditsPerUnit, maxUnitsPerCall, enabled, updatedAt)
         VALUES ('qichacha', '*', 'call', 7, 1.2, 9, 10, 1, ?)
         ON CONFLICT(service, op) DO UPDATE SET costCentsPerUnit = 7, updatedAt = excluded.updatedAt`
    ).run('2026-01-01T00:00:00.000Z');
    const led = db.prepare(
        `INSERT INTO wallet_ledger (userId, ts, kind, amountCents, balanceAfterCents, meta)
         VALUES (?, ?, 'service_spend', ?, 0, ?)`
    );
    for (const ts of ['2026-02-05T00:00:00.000Z', '2026-03-05T00:00:00.000Z', '2026-04-05T00:00:00.000Z']) {
        led.run('u-old', ts, -18, JSON.stringify({ service: 'qichacha', op: '*', unit: 'call', units: 2 }));
    }
    // 期外一笔，不该进 2026H1
    led.run('u-old', '2026-09-05T00:00:00.000Z', -18, JSON.stringify({ service: 'qichacha', op: '*', unit: 'call', units: 2 }));
    ok('夹具就位（6 单 / 4 条遥测 / 3 条快照 / 4 笔网关流水）');
}

// ---------------------------------------------------------------------------
console.log('\n[3] collectAutoFigures：本站口径');
// ---------------------------------------------------------------------------
let localFigures: Awaited<ReturnType<typeof A.collectAutoFigures>>['local'];
{
    const nowMs = Date.parse('2026-06-28T00:00:00.000Z');
    const res = await A.collectAutoFigures('2026H1', { nowMs, skipDownloads: true });
    localFigures = res.local;
    const m = res.local.metrics;

    assert.strictEqual(m.usersTotal.value, 2, '已注销账号不计入累计注册');
    assert.strictEqual(m.usersNew.value, 1, '本期新增只算期内注册的活账号');
    assert.strictEqual(m.usersTotal.source, 'auto');
    assert.ok(m.usersTotal.note && m.usersTotal.note.length > 0, '每个自动数字都要带口径说明');
    ok('注册用户：累计 2 / 新增 1，已注销不计');

    assert.strictEqual(m.installsTotal.value, 2, 'installId 去重、期外那条不计');
    // 活跃窗口 = 期末（此处取 now=6/28）前 30 天：i-2（6/25）在内，i-1 的 6/20 也在内
    assert.strictEqual(m.installsActive.value, 2);
    assert.ok(m.installsTotal.note!.includes('下限'), '遥测口径必须说明它是下限');
    ok('安装数：累计 2（去重）/ 30 天活跃 2');

    // 收入：微信 100 + 25 = 125 元（退款那单不算），Stripe 19 美元
    const wx = res.local.revenue.find((r) => r.channel === 'wxpay')!;
    assert.strictEqual(wx.gross.cents, 12500, '已退款与未支付的单不计入收入');
    assert.strictEqual(wx.gross.currency, 'CNY');
    assert.strictEqual(wx.fee.cents, null, '渠道费没有权威数据源，必须留给手工填');
    assert.ok(wx.fee.note!.includes('0.6%'), '渠道费要给出建议估算口径');
    const st = res.local.revenue.find((r) => r.channel === 'stripe')!;
    assert.strictEqual(st.gross.cents, 1900);
    assert.strictEqual(st.gross.currency, 'USD');
    assert.ok(st.fee.note!.includes('0.30'), 'Stripe 的固定手续费要按笔数给');
    assert.strictEqual(res.local.revenue.length, 2, '只有两条通道有期内收入');
    ok('收入：微信 ¥125.00 / Stripe US$19.00，退款与待支付不计');

    const or = res.local.costs.find((c) => c.key === 'openrouter')!;
    assert.strictEqual(or.amount.cents, 45000 - 12000, 'OpenRouter 取期末与期初快照的累计用量差');
    assert.strictEqual(or.amount.currency, 'USD');
    const qcc = res.local.costs.find((c) => c.key === 'qichacha')!;
    assert.strictEqual(qcc.amount.cents, 3 * 2 * 7, '企查查按期内 units × 采购成本单价推算');
    assert.strictEqual(qcc.amount.currency, 'CNY');
    assert.ok(qcc.amount.note!.includes('网关流水推算'));
    ok('成本：OpenRouter US$330.00（快照差）/ 企查查 ¥0.42（流水推算）');

    // 重构后的 gatewayCostDetail 必须与从前行为一致：不带窗口右端 = 一直到现在
    const detail = gatewayCostDetail(Date.parse('2026-09-10T00:00:00.000Z'), 365);
    const row = detail.find((r) => r.service === 'qichacha')!;
    assert.strictEqual(row.calls, 4, 'gatewayCostDetail 的「近 N 天」口径不受重构影响');
    ok('gatewayCostDetail 行为与重构前一致');

    // 未请求远端时 merged 就是 local
    assert.deepStrictEqual(res.merged, res.local);
    assert.strictEqual(res.remote.ok, false);
    ok('未请求远端时 merged === local');
}

// ---------------------------------------------------------------------------
console.log('\n[4] 跨站合并：成功与失败两条路径');
// ---------------------------------------------------------------------------
{
    process.env.AWD_TRANSPARENCY_SYNC_TOKEN = 'x'.repeat(32);
    const nowMs = Date.parse('2026-06-28T00:00:00.000Z');

    const remotePayload = {
        figures: {
            metrics: {
                usersTotal: { value: 7, source: 'auto', note: '国际站' },
                usersNew: { value: 3, source: 'auto' },
                installsTotal: { value: 5, source: 'auto' },
                installsActive: { value: 1, source: 'auto' },
                downloads: { value: 999, source: 'auto' },
            },
            revenue: [
                { channel: 'stripe', gross: { cents: 5000, currency: 'USD', source: 'auto' }, fee: { cents: null, currency: 'USD', source: 'manual' } },
            ],
            costs: [
                { key: 'openrouter', amount: { cents: 1000, currency: 'USD', source: 'auto' } },
                { key: 'server', amount: { cents: 8800, currency: 'CNY', source: 'auto' } },
            ],
        },
    };

    let sawAuth = '';
    fetchStub = (url, init) => {
        assert.ok(url.includes('/api/transparency/auto?period=2026H1'), `远端地址不对：${url}`);
        sawAuth = String((init?.headers as Record<string, string>)?.Authorization ?? '');
        return new Response(JSON.stringify(remotePayload), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    };

    const res = await A.collectAutoFigures('2026H1', { nowMs, skipDownloads: true, includeRemote: true });
    assert.strictEqual(res.remote.ok, true);
    assert.ok(sawAuth.startsWith('Bearer '), '跨站取数必须带 Bearer 共享密钥');
    assert.strictEqual(res.merged.metrics.usersTotal.value, 2 + 7, '计数两站相加');
    assert.strictEqual(res.merged.metrics.installsTotal.value, 2 + 5);
    // 下载量是同一个 GitHub 仓库的计数，两站相加就是翻倍
    assert.strictEqual(res.merged.metrics.downloads.value, 999, '下载量取其一，绝不相加');
    assert.strictEqual(res.merged.revenue.length, 3, '收入按行拼接，两站的 Stripe 各列一行');
    const orMerged = res.merged.costs.find((c) => c.key === 'openrouter' && c.amount.currency === 'USD')!;
    assert.strictEqual(orMerged.amount.cents, 33000 + 1000, '同 key 同币种的成本相加');
    assert.ok(
        res.merged.costs.some((c) => c.key === 'server' && c.amount.currency === 'CNY'),
        '只在一边出现的科目要保留'
    );
    assert.strictEqual(res.local.metrics.usersTotal.value, 2, 'local 不受合并影响');
    ok('远端可达：计数相加、下载量取其一、同科目同币种合并');

    fetchStub = () => {
        throw new Error('connect ECONNREFUSED');
    };
    const failed = await A.collectAutoFigures('2026H1', { nowMs, skipDownloads: true, includeRemote: true });
    assert.strictEqual(failed.remote.ok, false);
    assert.ok(failed.remote.error!.includes('ECONNREFUSED'), '失败原因要原样带回，界面才能说清');
    assert.deepStrictEqual(failed.merged.metrics.usersTotal.value, 2, '拉不到远端时退回本站数字');
    ok('远端不可达：remote.ok=false 带原因，merged 退回本站');

    delete process.env.AWD_TRANSPARENCY_SYNC_TOKEN;
    const noToken = await A.collectAutoFigures('2026H1', { nowMs, skipDownloads: true, includeRemote: true });
    assert.strictEqual(noToken.remote.ok, false);
    assert.ok(noToken.remote.error!.includes('AWD_TRANSPARENCY_SYNC_TOKEN'));
    ok('未配置共享密钥时不发请求，直接说明原因');
}

// ---------------------------------------------------------------------------
console.log('\n[5] summarizeReport：算术与合并人民币');
// ---------------------------------------------------------------------------
{
    const data = T.blankReportData();
    data.revenue = [
        { channel: 'wxpay', gross: { cents: 12500, currency: 'CNY', source: 'auto' }, fee: { cents: 75, currency: 'CNY', source: 'manual' } },
        { channel: 'stripe', gross: { cents: 1900, currency: 'USD', source: 'auto' }, fee: { cents: 85, currency: 'USD', source: 'manual' } },
    ];
    data.costs = [
        { key: 'qichacha', amount: { cents: 42, currency: 'CNY', source: 'auto' } },
        { key: 'openrouter', amount: { cents: 900, currency: 'USD', source: 'auto' } },
        { key: 'domain', amount: { cents: null, currency: 'CNY', source: 'manual' } },
    ];
    const s = T.summarizeReport(data);
    const cny = s.byCurrency.find((r) => r.currency === 'CNY')!;
    const usd = s.byCurrency.find((r) => r.currency === 'USD')!;
    assert.strictEqual(cny.grossCents, 12500);
    assert.strictEqual(cny.netCents, 12500 - 75 - 42);
    assert.strictEqual(usd.netCents, 1900 - 85 - 900);
    assert.strictEqual(s.hasNulls, true, '空值要如实标记，不能按 0 混进算式');
    assert.strictEqual(s.combinedCny, null, '没给汇率就不出合并口径');
    ok('分币种汇总正确，空值跳过并标记');

    data.usdToCnyRate = 7.2;
    const s2 = T.summarizeReport(data);
    assert.ok(s2.combinedCny);
    assert.strictEqual(s2.combinedCny!.grossCents, 12500 + Math.round(1900 * 7.2));
    assert.strictEqual(
        s2.combinedCny!.netCents,
        s2.combinedCny!.grossCents - s2.combinedCny!.feeCents - s2.combinedCny!.costCents
    );
    ok('给了汇率后合并人民币口径成立');

    // 全空的报表不该崩，也不该凭空造出币种行
    const empty = T.summarizeReport(T.blankReportData());
    assert.strictEqual(empty.byCurrency.length, 0);
    assert.strictEqual(empty.combinedCny, null);
    ok('空报表汇总为空，不崩不造数');
}

// ---------------------------------------------------------------------------
console.log('\n[6] 报表读写与发布门禁');
// ---------------------------------------------------------------------------
{
    const data = T.blankReportData();
    data.metrics.usersTotal = { value: 2, source: 'auto', note: '本站注册账号累计数' };
    data.revenue = [
        { channel: 'wxpay', gross: { cents: 12500, currency: 'CNY', source: 'auto' }, fee: { cents: 75, currency: 'CNY', source: 'manual' } },
    ];
    data.costs = [{ key: 'qichacha', amount: { cents: 42, currency: 'CNY', source: 'auto' } }];
    data.donation = { amount: { cents: 10000, currency: 'CNY', source: 'manual' }, org: '中华慈善总会', note: '首期盈余捐赠' };
    data.remarks = '首期账目，口径以本页说明为准。';

    const saved = T.upsertReport('2026H1', data);
    assert.strictEqual(saved.status, 'draft', '新建期次一律先是草稿');
    assert.strictEqual(saved.publishedAt, null);
    assert.strictEqual(T.listReports({ publishedOnly: true }).length, 0, '草稿不在已发布列表里');
    assert.strictEqual(T.listReports().length, 1);
    ok('upsert 落草稿，publishedOnly 不列草稿');

    // 改内容不动状态：发布后改错字不该悄悄下线
    T.setReportStatus('2026H1', 'published');
    const republished = T.upsertReport('2026H1', { ...data, remarks: '改过一次' });
    assert.strictEqual(republished.status, 'published', '改内容不该把已发布改回草稿');
    assert.strictEqual(T.listReports({ publishedOnly: true }).length, 1);
    ok('发布后改内容仍保持已发布');

    T.setReportStatus('2026H1', 'draft');
    assert.strictEqual(T.getReport('2026H1')!.publishedAt, null, '撤回要清掉发布时间');
    assert.strictEqual(T.listReports({ publishedOnly: true }).length, 0);
    T.setReportStatus('2026H1', 'published');
    T.upsertReport('2026H1', data);
    ok('撤回后重新发布，状态与发布时间都对得上');
}

// ---------------------------------------------------------------------------
console.log('\n[7] 捐赠凭证：落盘与删除');
// ---------------------------------------------------------------------------
let receiptId = '';
{
    // 1×1 透明 PNG
    const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
    );
    const added = T.addReceipt({ period: '2026H1', fileName: '../../evil.png', mime: 'image/png', bytes: png, caption: '回执' });
    assert.ok(added.receipt, '正常 PNG 应当收下');
    receiptId = added.receipt!.id;
    const file = path.join(cwd, 'data', 'transparency-receipts', `${receiptId}.png`);
    assert.ok(fs.existsSync(file), '凭证字节要真的落盘');
    // 文件名由随机 id 拼出，上传方给的 `../../evil.png` 不参与路径
    assert.ok(!fs.existsSync(path.join(cwd, 'evil.png')));
    assert.strictEqual(T.listReceipts('2026H1').length, 1);
    assert.deepStrictEqual(T.readReceiptBytes(added.receipt!), png);
    ok('凭证落盘，路径由随机 id 拼出，上传方文件名不参与');

    assert.strictEqual(T.addReceipt({ period: '2026H1', fileName: 'a.svg', mime: 'image/svg+xml', bytes: png }).error, 'unsupported_format');
    assert.strictEqual(
        T.addReceipt({ period: '2026H1', fileName: 'big.png', mime: 'image/png', bytes: Buffer.alloc(T.RECEIPT_MAX_BYTES + 1) }).error,
        'too_large'
    );
    assert.strictEqual(T.addReceipt({ period: '2026H1', fileName: 'e.png', mime: 'image/png', bytes: Buffer.alloc(0) }).error, 'empty');
    ok('SVG / 超大 / 空文件一律拒收');
}

// ---------------------------------------------------------------------------
console.log('\n[8] renderReportMarkdown');
// ---------------------------------------------------------------------------
{
    const md = T.renderReportMarkdown('2026H1');
    assert.ok(md.includes('2026 年上半年'), 'Markdown 要带期次标签');
    assert.ok(md.includes('¥125.00'), 'Markdown 要带金额数字');
    assert.ok(md.includes('中华慈善总会'));
    assert.ok(md.includes(`https://www.aiworkdeck.com/api/transparency/receipt/${receiptId}`), '凭证要给国内站的绝对链接');
    assert.ok(md.includes('| 渠道 | 收入 | 渠道费 | 净额 | 来源 |'), '收入要出表格');
    assert.throws(() => T.renderReportMarkdown('2030H1'), '不存在的期次要抛错');
    ok('Markdown 含期次标签、金额、凭证绝对链接与表头');
}

// ---------------------------------------------------------------------------
console.log('\n[9] 公开接口：草稿不外泄');
// ---------------------------------------------------------------------------
{
    fetchStub = () => new Response('{}', { status: 500 }); // live 取数不关心，随便失败
    const { GET: publicGET } = await import('@/app/api/transparency/route');
    const { GET: receiptGET } = await import('@/app/api/transparency/receipt/[id]/route');

    {
        const res = await publicGET();
        const body = (await res.json()) as { reports: Array<{ period: string }> };
        assert.strictEqual(body.reports.length, 1, '已发布的那一期应当出现');
        assert.strictEqual(body.reports[0].period, '2026H1');
        ok('已发布期次出现在公开接口里');
    }

    {
        const res = await receiptGET(new Request('http://x/'), { params: Promise.resolve({ id: receiptId }) });
        assert.strictEqual(res.status, 200, '已发布期次的凭证可公开读取');
        assert.strictEqual(res.headers.get('Content-Type'), 'image/png');
        assert.ok(res.headers.get('Cache-Control')!.includes('max-age=3600'));
        ok('已发布期次的凭证 200 且带正确 content-type');
    }

    // 撤回后：报表不出现，凭证 404
    T.setReportStatus('2026H1', 'draft');
    {
        const res = await publicGET();
        const body = (await res.json()) as { reports: unknown[] };
        assert.strictEqual(body.reports.length, 0, '草稿一个字都不许出去');
        const r = await receiptGET(new Request('http://x/'), { params: Promise.resolve({ id: receiptId }) });
        assert.strictEqual(r.status, 404, '草稿期的凭证必须 404');
        const missing = await receiptGET(new Request('http://x/'), { params: Promise.resolve({ id: 'deadbeef' }) });
        assert.strictEqual(missing.status, 404);
        ok('撤回后公开接口不列该期，凭证回 404');
    }
    T.setReportStatus('2026H1', 'published');
}

// ---------------------------------------------------------------------------
console.log('\n[10] 删除期次连带删凭证文件');
// ---------------------------------------------------------------------------
{
    const file = path.join(cwd, 'data', 'transparency-receipts', `${receiptId}.png`);
    assert.ok(fs.existsSync(file));
    assert.strictEqual(T.deleteReceipt(receiptId), true);
    assert.ok(!fs.existsSync(file), '删凭证要把文件一起删，不留孤儿');
    assert.strictEqual(T.getReceipt(receiptId), null);
    assert.strictEqual(T.deleteReceipt(receiptId), false, '重复删除不报错，返回 false');
    ok('删除凭证同时清掉磁盘文件');

    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const again = T.addReceipt({ period: '2026H1', fileName: 'b.png', mime: 'image/png', bytes: png });
    const file2 = path.join(cwd, 'data', 'transparency-receipts', `${again.receipt!.id}.png`);
    assert.ok(fs.existsSync(file2));
    T.deleteReport('2026H1');
    assert.strictEqual(T.getReport('2026H1'), null);
    assert.strictEqual(T.listReceipts('2026H1').length, 0);
    assert.ok(!fs.existsSync(file2), '删期次要把它的凭证文件一并删掉');
    ok('删除期次连带清掉凭证行与文件');
}

// ---------------------------------------------------------------------------
console.log('\n[11] 静态护栏：导航 / sitemap / 词典');
// ---------------------------------------------------------------------------
{
    const navbar = fs.readFileSync(path.join(repoRoot, 'components/layout/Navbar.tsx'), 'utf-8');
    // 导航现在始终使用浅色底，深色页头不再依赖逐路由白名单。
    const header = navbar.match(/<header className="([^"]+)"/);
    assert.ok(header?.[1].includes('bg-white/95'), '深色 PageHero 上的导航必须有自己的浅色背景');
    const links = navbar.match(/const linkStyle = '([^']+)'/);
    assert.ok(links?.[1].includes('text-neutral-gray-dark'), '浅色导航使用深色链接保证可读');
    ok('Navbar 固定浅色底与深色链接覆盖 /transparency');

    const sitemap = fs.readFileSync(path.join(repoRoot, 'app/sitemap.ts'), 'utf-8');
    assert.ok(sitemap.includes("'/transparency'"), '新的公开页要进 sitemap');
    ok('sitemap 包含 /transparency');

    const zh = JSON.parse(fs.readFileSync(path.join(repoRoot, 'dictionaries/zh.json'), 'utf-8'));
    const en = JSON.parse(fs.readFileSync(path.join(repoRoot, 'dictionaries/en.json'), 'utf-8'));
    assert.ok(zh.transparencyPage && en.transparencyPage, '两份词典都要有 transparencyPage');

    const paths = (obj: unknown, prefix = ''): string[] => {
        if (Array.isArray(obj)) return [`${prefix}[]`];
        if (obj && typeof obj === 'object') {
            return Object.entries(obj as Record<string, unknown>)
                .flatMap(([k, v]) => paths(v, prefix ? `${prefix}.${k}` : k))
                .sort();
        }
        return [prefix];
    };
    const zhPaths = paths(zh.transparencyPage).sort();
    const enPaths = paths(en.transparencyPage).sort();
    assert.deepStrictEqual(zhPaths, enPaths, 'zh/en 的 transparencyPage 键树必须逐键一致');
    assert.ok(zhPaths.length > 20, '键树不能是个空壳');
    assert.ok(zh.common?.footer?.transparency && en.common?.footer?.transparency, '页脚链接文案两份词典都要有');
    ok(`两份词典的 transparencyPage 键树一致（${zhPaths.length} 个叶子）`);

    // 中文词典里不许出现 emoji（DESIGN.md §一 硬红线）
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    assert.ok(!emoji.test(JSON.stringify(zh.transparencyPage)), '全站禁止 emoji');
    assert.ok(!emoji.test(JSON.stringify(en.transparencyPage)), '全站禁止 emoji');
    ok('词典文案不含 emoji');
}

console.log(`\n全部通过：${passed} 项`);
