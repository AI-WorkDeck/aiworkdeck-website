import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { generateJoinCode } from './join-code';

/**
 * 统一 SQLite 存储层（PR-W0）。
 *
 * 钱相关的数据（订单/账本/购买/权益/密钥）全部走这里，
 * 不再使用 JSON 全量覆盖写（无锁无原子写，账本必坏）。
 * JSON 保留给 skills/plugins 等读多写少内容。
 *
 * - 库文件：data/awd.db，WAL 模式
 * - 迁移：schema_version 表 + 顺序迁移函数，幂等
 * - 事务：withTransaction helper，所有钱的变更必须在事务里
 */

const DB_FILE = path.join(process.cwd(), 'data', 'awd.db');
const ORDERS_JSON = path.join(process.cwd(), 'data', 'orders.json');

let db: Database.Database | null = null;

interface LegacyJsonOrder {
  id: string;
  outTradeNo: string;
  description: string;
  amount: number;
  status: string;
  createdAt: string;
  paidAt?: string;
  transactionId?: string;
  payerOpenid?: string;
}

/**
 * 迁移列表：只许追加，不许修改已发布的迁移。
 *
 * 导出是给 `scripts/verify-credits.mts` 用的：它先跑前 N 条造一个**历史版本的库**，
 * 再交给 `getDb()` 把剩下的迁移跑完，以此验证整条迁移链在存量库上仍然走得通。
 * 之所以不让它手抄一份 DDL：抄的那份会随新迁移腐坏（迁移 9 加 orders 列、迁移 10
 * 建 telemetry 索引，抄的夹具里压根没这些表），护栏会哑掉而没人发现。
 *
 * 应用代码一律走 `getDb()`，不要自己调这里的 `up()`。
 */
export const MIGRATIONS: Array<{ version: number; up: (d: Database.Database) => void }> = [
  {
    version: 1,
    up: (d) => {
      d.exec(`
        CREATE TABLE orders (
          id             TEXT PRIMARY KEY,
          outTradeNo     TEXT NOT NULL UNIQUE,
          userId         TEXT,
          kind           TEXT NOT NULL CHECK (kind IN ('recharge','purchase','support')),
          skuId          TEXT,
          description    TEXT NOT NULL DEFAULT '',
          amountCents    INTEGER NOT NULL CHECK (amountCents > 0),
          status         TEXT NOT NULL CHECK (status IN ('pending','paid','closed','expired')),
          idempotencyKey TEXT,
          createdAt      TEXT NOT NULL,
          paidAt         TEXT,
          transactionId  TEXT,
          payerOpenid    TEXT
        );
        CREATE UNIQUE INDEX idx_orders_idem
          ON orders (userId, idempotencyKey) WHERE idempotencyKey IS NOT NULL;
        CREATE INDEX idx_orders_user ON orders (userId);

        CREATE TABLE wallet_ledger (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          userId           TEXT NOT NULL,
          ts               TEXT NOT NULL,
          kind             TEXT NOT NULL CHECK (kind IN ('recharge','ai_alloc','purchase','earning','adjust')),
          amountCents      INTEGER NOT NULL,
          balanceAfterCents INTEGER NOT NULL,
          refOrderId       TEXT,
          meta             TEXT
        );
        CREATE INDEX idx_ledger_user_ts ON wallet_ledger (userId, ts);

        CREATE TABLE purchases (
          id                 INTEGER PRIMARY KEY AUTOINCREMENT,
          userId             TEXT NOT NULL,
          itemType           TEXT NOT NULL CHECK (itemType IN ('skill','plugin','feature')),
          itemId             TEXT NOT NULL,
          orderId            TEXT NOT NULL,
          priceCents         INTEGER NOT NULL,
          creatorUserId      TEXT,
          creatorShareCents  INTEGER,
          platformShareCents INTEGER,
          createdAt          TEXT NOT NULL
        );
        CREATE INDEX idx_purchases_user ON purchases (userId);

        CREATE TABLE entitlements (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          userId    TEXT NOT NULL,
          feature   TEXT NOT NULL,
          orderId   TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          UNIQUE (userId, feature)
        );

        CREATE TABLE api_keys (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          userId    TEXT NOT NULL,
          keyHash   TEXT NOT NULL UNIQUE,
          prefix    TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          revokedAt TEXT
        );
        CREATE INDEX idx_api_keys_user ON api_keys (userId);

        CREATE TABLE openrouter_keys (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          userId     TEXT NOT NULL,
          orKeyHash  TEXT NOT NULL,
          limitUsd   REAL NOT NULL,
          createdAt  TEXT NOT NULL,
          disabledAt TEXT
        );
        CREATE INDEX idx_or_keys_user ON openrouter_keys (userId);

        CREATE TABLE creator_earnings (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          creatorUserId TEXT NOT NULL,
          purchaseId    INTEGER NOT NULL,
          amountCents   INTEGER NOT NULL,
          settledAt     TEXT,
          settleNote    TEXT
        );
        CREATE INDEX idx_earnings_creator ON creator_earnings (creatorUserId);
      `);

      // 一次性导入现有 data/orders.json（打赏订单，kind=support，无 userId 置 NULL）。
      if (fs.existsSync(ORDERS_JSON)) {
        let legacy: LegacyJsonOrder[] = [];
        try {
          legacy = JSON.parse(fs.readFileSync(ORDERS_JSON, 'utf-8'));
        } catch {
          legacy = [];
        }
        const insert = d.prepare(`
          INSERT OR IGNORE INTO orders
            (id, outTradeNo, userId, kind, skuId, description, amountCents, status,
             idempotencyKey, createdAt, paidAt, transactionId, payerOpenid)
          VALUES
            (@id, @outTradeNo, NULL, 'support', NULL, @description, @amountCents, @status,
             NULL, @createdAt, @paidAt, @transactionId, @payerOpenid)
        `);
        for (const o of legacy) {
          if (!o || !o.outTradeNo || !(o.amount > 0)) continue;
          insert.run({
            id: o.id || o.outTradeNo,
            outTradeNo: o.outTradeNo,
            description: o.description || '',
            amountCents: Math.floor(o.amount),
            status: ['pending', 'paid', 'closed', 'expired'].includes(o.status) ? o.status : 'pending',
            createdAt: o.createdAt || new Date().toISOString(),
            paidAt: o.paidAt ?? null,
            transactionId: o.transactionId ?? null,
            payerOpenid: o.payerOpenid ?? null,
          });
        }
      }
    },
  },
  {
    // PR-W2：AI 额度分配。
    // - openrouter_keys.encKey：provisioned key 明文的 AES-256-GCM 密文（lib/openrouter-keys.ts）
    // - ai_allocations：两阶段分配的状态机（pending -> done | failed），
    //   expectedLimitUsd 记录本次分配后的目标 limit，供遗留 pending 对账时实查判定。
    version: 2,
    up: (d) => {
      d.exec(`
        ALTER TABLE openrouter_keys ADD COLUMN encKey TEXT;

        CREATE TABLE ai_allocations (
          id               TEXT PRIMARY KEY,
          userId           TEXT NOT NULL,
          amountCents      INTEGER NOT NULL CHECK (amountCents > 0),
          usdDelta         REAL NOT NULL,
          status           TEXT NOT NULL CHECK (status IN ('pending','done','failed')),
          orKeyHash        TEXT,
          expectedLimitUsd REAL,
          createdAt        TEXT NOT NULL,
          settledAt        TEXT
        );
        CREATE INDEX idx_ai_alloc_user ON ai_allocations (userId);
        CREATE INDEX idx_ai_alloc_status ON ai_allocations (status);
      `);
    },
  },
  {
    // PR-W3：admin 操作审计（收益结算等钱相关的后台操作必须留痕）。
    version: 3,
    up: (d) => {
      d.exec(`
        CREATE TABLE admin_audit (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          ts     TEXT NOT NULL,
          action TEXT NOT NULL,
          detail TEXT
        );
      `);
    },
  },
  {
    // PR-W2 修复：给「同一用户至多一笔 pending 分配」加 DB 兜底。
    // 此前该不变式只靠 lib/ai-alloc.ts 里「守卫 SELECT → INSERT」的单进程同步性，
    // DB 层无任何约束；多进程/多实例部署下两个请求可同时通过守卫，
    // 对同一个 key 并发 patch limit 造成额度互相覆盖。
    //
    // 版本号跳过 3：3 已被并行开发的 PR-W3（admin_audit 表）占用。
    // 迁移只许追加、不许改号，故本 PR 取 4，合并顺序上 W3 先落地。
    version: 4,
    up: (d) => {
      // 建唯一索引前必须先消掉重复 pending，否则 CREATE UNIQUE INDEX 失败会让
      // 整个迁移事务回滚，应用直接起不来。
      //
      // 正常情况下不会有重复：allocateAiQuota 从守卫 SELECT 到 INSERT 之间没有任何
      // await，Node 单线程下这段是原子的，同进程内插不进第二笔。但历史库可能被
      // 多进程部署或手工脚本写脏，所以这里做一次幂等清理。
      //
      // 清理必须连带退款：只把重复行置 failed 而不退钱，等于直接吃掉用户的扣款，
      // 比原 bug 更糟。此处用裸 SQL 复刻 appendLedger 的记账（含 balanceAfterCents
      // running balance），不 import lib/wallet.ts —— wallet 反过来 import 本文件，
      // 直接引会成循环依赖。
      const dupes = d
        .prepare(
          `SELECT id, userId, amountCents FROM ai_allocations
            WHERE status = 'pending'
              AND rowid NOT IN (
                SELECT MIN(rowid) FROM ai_allocations WHERE status = 'pending' GROUP BY userId
              )
            ORDER BY rowid`
        )
        .all() as Array<{ id: string; userId: string; amountCents: number }>;

      if (dupes.length > 0) {
        const now = new Date().toISOString();
        const lastBalance = d.prepare(
          'SELECT balanceAfterCents FROM wallet_ledger WHERE userId = ? ORDER BY id DESC LIMIT 1'
        );
        const insertLedger = d.prepare(
          `INSERT INTO wallet_ledger (userId, ts, kind, amountCents, balanceAfterCents, refOrderId, meta)
           VALUES (?, ?, 'adjust', ?, ?, NULL, ?)`
        );
        const failAlloc = d.prepare(
          "UPDATE ai_allocations SET status = 'failed', settledAt = ? WHERE id = ?"
        );
        for (const row of dupes) {
          const prev =
            (lastBalance.get(row.userId) as { balanceAfterCents: number } | undefined)
              ?.balanceAfterCents ?? 0;
          insertLedger.run(
            row.userId,
            now,
            row.amountCents,
            prev + row.amountCents,
            JSON.stringify({
              autoRefund: true,
              allocId: row.id,
              reason: 'migration v4: 清理重复 pending 以建唯一索引',
            })
          );
          failAlloc.run(now, row.id);
        }
      }

      d.exec(`
        CREATE UNIQUE INDEX idx_ai_alloc_one_pending
          ON ai_allocations (userId) WHERE status = 'pending';
      `);
    },
  },
  {
    // PR-W4：兑换码（gift code）。
    // 一码一次，核销靠 UPDATE ... WHERE redeemedByUserId IS NULL 的 changes>0 判定，
    // 而不是「先读后写」——后者在多进程下会被两个请求同时通过。
    // payloadJson 按 kind 解释：recharge → {"amountCents":n}；entitlement → {"feature":"..."}。
    version: 5,
    up: (d) => {
      d.exec(`
        CREATE TABLE gift_codes (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          code             TEXT NOT NULL UNIQUE,
          kind             TEXT NOT NULL CHECK (kind IN ('recharge','entitlement')),
          payloadJson      TEXT NOT NULL,
          note             TEXT,
          createdBy        TEXT NOT NULL,
          createdAt        TEXT NOT NULL,
          redeemedByUserId TEXT,
          redeemedAt       TEXT,
          revokedAt        TEXT
        );
        CREATE INDEX idx_gift_codes_created ON gift_codes (createdAt);
        CREATE INDEX idx_gift_codes_redeemer ON gift_codes (redeemedByUserId);
      `);
    },
  },
  {
    // 匿名遥测（telemetry）：
    // - telemetry_rollup：桌面端每日汇总，(installId, date) 幂等 upsert，payload 存整包 JSON 文本
    // - telemetry_event：细粒度事件流（白名单事件），只追加
    // installId 是桌面端本地生成的随机 UUID，不关联任何账户。
    version: 6,
    up: (d) => {
      d.exec(`
        CREATE TABLE telemetry_rollup (
          installId  TEXT NOT NULL,
          date       TEXT NOT NULL,
          appVersion TEXT,
          platform   TEXT,
          payload    TEXT NOT NULL,
          receivedAt TEXT NOT NULL,
          PRIMARY KEY (installId, date)
        );
        CREATE INDEX idx_tr_date ON telemetry_rollup (date);

        CREATE TABLE telemetry_event (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          installId  TEXT NOT NULL,
          ts         TEXT NOT NULL,
          eventName  TEXT NOT NULL,
          convKey    TEXT,
          appVersion TEXT,
          attrs      TEXT,
          receivedAt TEXT NOT NULL
        );
        CREATE INDEX idx_te_install ON telemetry_event (installId, ts);
      `);
    },
  },
  {
    // Credits 重构 P1（doc/credits-redesign.md）：余额改为按批次记账。
    //
    // - credit_lots：余额的唯一权威。未过期批次的 remainingCents 之和即余额，
    //   到期无需任何写操作余额就会少掉，清理任务只负责补流水。
    // - topup（充值）恒不过期：由表级 CHECK 强制。用户真金白银充进来的钱设有效期
    //   触碰《单用途商业预付卡管理办法》第十八条，这条不能只靠调用方自觉。
    // - wallet_ledger 增加 gift / expire 两个 kind。SQLite 改不了 CHECK 约束，
    //   只能重建表——这是张有真实订单的钱表，重建前后必须对行数，不符就让整个
    //   迁移事务回滚（migrate() 里每条迁移都包在 d.transaction 里）。
    version: 7,
    up: (d) => {
      d.exec(`
        CREATE TABLE credit_lots (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          userId         TEXT NOT NULL,
          pool           TEXT NOT NULL CHECK (pool IN ('topup','reward')),
          originalCents  INTEGER NOT NULL CHECK (originalCents > 0),
          remainingCents INTEGER NOT NULL CHECK (remainingCents >= 0),
          grantedAt      TEXT NOT NULL,
          expiresAt      TEXT,
          sourceKind     TEXT NOT NULL,
          refOrderId     TEXT,
          meta           TEXT,
          -- 充值批次不许带有效期（预付卡红线），奖励批次必须带
          CHECK ((pool = 'topup' AND expiresAt IS NULL) OR (pool = 'reward' AND expiresAt IS NOT NULL)),
          -- 剩余不得超过原额，防退款重复入账把批次撑破
          CHECK (remainingCents <= originalCents)
        );
        CREATE INDEX idx_lots_user_spend ON credit_lots (userId, remainingCents, expiresAt);

        -- 记住这笔分配当初扣了哪几个批次，失败退款才能原批次原额退回。
        -- 不记的话，一次失败的分配就能把不可提现的 reward 洗成可退的 topup。
        ALTER TABLE ai_allocations ADD COLUMN spendLedgerId INTEGER;
      `);

      // --- wallet_ledger 重建：扩 kind 枚举 ---
      const before = (
        d.prepare('SELECT COUNT(*) AS n FROM wallet_ledger').get() as { n: number }
      ).n;

      d.exec(`
        CREATE TABLE wallet_ledger_v7 (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          userId            TEXT NOT NULL,
          ts                TEXT NOT NULL,
          kind              TEXT NOT NULL CHECK (kind IN ('recharge','ai_alloc','purchase','earning','adjust','gift','expire')),
          amountCents       INTEGER NOT NULL,
          balanceAfterCents INTEGER NOT NULL,
          refOrderId        TEXT,
          meta              TEXT
        );
        INSERT INTO wallet_ledger_v7 (id, userId, ts, kind, amountCents, balanceAfterCents, refOrderId, meta)
          SELECT id, userId, ts, kind, amountCents, balanceAfterCents, refOrderId, meta FROM wallet_ledger;
      `);

      const after = (
        d.prepare('SELECT COUNT(*) AS n FROM wallet_ledger_v7').get() as { n: number }
      ).n;
      if (after !== before) {
        throw new Error(`wallet_ledger 重建行数不符：原 ${before} 行，新 ${after} 行`);
      }

      d.exec(`
        DROP TABLE wallet_ledger;
        ALTER TABLE wallet_ledger_v7 RENAME TO wallet_ledger;
        CREATE INDEX idx_ledger_user_ts ON wallet_ledger (userId, ts);
      `);

      // --- 回填：把每个用户的当前余额落成一笔不过期的 topup 批次 ---
      //
      // 存量余额一律按 topup 处理（不过期、可退）：它们来自充值与兑换码充值，
      // 用户在旧规则下取得，不能追溯加上有效期。往后兑换码才入 reward 批次。
      // SQLite 的 max() 聚合会让同一行的裸列取到该行的值，这是文档承诺的行为，
      // 用它精确取「每个用户最后一行的 balanceAfterCents」。
      const nowIso = new Date().toISOString();
      d.prepare(
        `INSERT INTO credit_lots
           (userId, pool, originalCents, remainingCents, grantedAt, expiresAt, sourceKind, meta)
         SELECT userId, 'topup', balanceAfterCents, balanceAfterCents, ?, NULL, 'migration',
                json_object('note', 'P1 迁移：按迁移时点的钱包余额落一笔不过期批次')
           FROM (
             SELECT userId, balanceAfterCents, max(id) AS lastId
               FROM wallet_ledger
              GROUP BY userId
           )
          WHERE balanceAfterCents > 0`
      ).run(nowIso);

      // 回填后逐户核对：批次之和必须等于原账本余额，不等说明回填口径有问题
      const mismatch = d
        .prepare(
          `SELECT l.userId
             FROM (SELECT userId, balanceAfterCents AS bal, max(id) FROM wallet_ledger GROUP BY userId) l
             LEFT JOIN (SELECT userId, SUM(remainingCents) AS lots FROM credit_lots GROUP BY userId) c
               ON c.userId = l.userId
            WHERE COALESCE(c.lots, 0) <> max(l.bal, 0)`
        )
        .all() as { userId: string }[];
      if (mismatch.length > 0) {
        throw new Error(
          `Credits 回填与账本余额不符，涉及 ${mismatch.length} 个用户：${mismatch
            .slice(0, 5)
            .map(m => m.userId)
            .join(', ')}`
        );
      }
    },
  },
  {
    // Credits 重构 P3：AI 额度改为「limit 派生自余额、用量事后回抄」。
    //
    // settledUsageUsd = 已经折成 Credits 扣过的远端用量水位。
    // **必须允许为 NULL**：迁移前建的 key 早已产生用量，而那些用量在旧模型下是
    // 「先分配后消费」——钱在分配那一刻就扣过了。默认 0 会把这些历史用量再扣一遍。
    // NULL 表示「水位未建立」，首次同步时只把水位对齐到远端当前用量、一分不扣。
    version: 8,
    up: (d) => {
      d.exec(`ALTER TABLE openrouter_keys ADD COLUMN settledUsageUsd REAL;`);
    },
  },
  {
    // 双站支付通道抽象：订单记下自己是用哪个通道、什么币种结的账。
    //
    // 默认值 'wxpay' / 'CNY' 对存量行是**准确的语义**而不是占位：v9 之前只有
    // 微信 Native 一条支付路径，库里每一笔订单都是人民币微信单。
    //
    // currency 必须落库、且结算时必须比对：USD $10.00 与 ¥10.00 的 minor units
    // 都是 1000，只比金额不比币种，一笔 10 美元的支付就能结掉一张 10 元的订单。
    // 两站虽是两份独立的库、币种是部署级常量，但这条不变式不能寄托在部署拓扑上。
    //
    // providerRef 是通道侧的单据引用（Stripe Checkout Session id），与
    // transactionId（真正的收款流水，Stripe 是 payment_intent）分开存：
    // 前者建单即知、用于回查，后者要到支付成功才有。
    version: 9,
    up: (d) => {
      d.exec(`
        ALTER TABLE orders ADD COLUMN channel TEXT NOT NULL DEFAULT 'wxpay';
        ALTER TABLE orders ADD COLUMN currency TEXT NOT NULL DEFAULT 'CNY';
        ALTER TABLE orders ADD COLUMN providerRef TEXT;
        CREATE INDEX idx_orders_provider ON orders (providerRef);
      `);
    },
  },
  {
    // 遥测保留期清理（隐私政策承诺「匿名遥测 24 个月，届期滚动删除」）的支撑索引。
    //
    // 清理按 receivedAt 删（date 是客户端自报的，见 lib/telemetry-store.ts），
    // 而两张表都没有 receivedAt 索引：rollup 只有 (installId, date) 主键和 idx_tr_date，
    // event 只有 idx_te_install (installId, ts)。裸删就是每天全表扫。
    //
    // 现网 rollup 才 652 行，全表扫是微秒级——但保留期任务的性质就是「跑很多年」，
    // 而且进入稳态后每天删掉的只有约 1/730 的行：小比例范围删除正是索引收益最大、
    // 全表扫代价最冤的形态。写入侧代价可忽略：rollup 每装机每天至多几次 upsert，
    // event 是纯追加，两者本来就在维护别的索引了。
    // 反过来，等表长大了再补索引，建索引本身要在一张大表上持写锁，不如现在建。
    version: 10,
    up: (d) => {
      d.exec(`
        CREATE INDEX idx_tr_received ON telemetry_rollup (receivedAt);
        CREATE INDEX idx_te_received ON telemetry_event (receivedAt);
      `);
    },
  },
  {
    // 平台服务网关（设计见桌面仓 docs/superpowers/specs/2026-08-17-unified-credits-service-gateway-design.md）。
    // 三张表各管一件事，刻意不合并：
    //
    // service_pricing —— 计价的**唯一权威**。客户端既不传价格也不传单价，
    //   连计量数量都只当估算用（真实计量以上游返回为准，见 gateway/spend.ts）。
    //   enabled 默认 0：新接一家服务先把行建好、开关关着，合同/账号就绪再打开，
    //   这样「未开放」是一个有定义的状态而不是一条查不到定价的异常。
    //   maxUnitsPerCall 是硬上限，挡住「申报 1 分钟传两小时」这类绕过余额闸的做法。
    //
    // gateway_request —— 幂等去重。会扣费的 POST 必须带 Idempotency-Key，
    //   客户端超时重发命中已完成的键时直接回放原响应，不重调上游、不重扣费。
    //   形态照 orders.idempotencyKey 那套，不发明新的。
    //
    // gateway_hold —— 预扣的服务端状态。**必须落库**：初稿把释放与结算全挂在
    //   桌面主动轮询上，用户合盖笔记本那笔钱就永久冻结、客服除手工 adjust 无解。
    //   status + holdExpiresAt 上的索引供超时回收扫描用（挂在 /api/admin/ai/reconcile）。
    version: 11,
    up: (d) => {
      // --- wallet_ledger 重建：扩 kind 枚举，加 service_spend ---
      // SQLite 改不了 CHECK 约束，只能重建整张表。做法与迁移 7 逐字相同
      // （含行数对拍：少一行都不许放过，账本丢行是不可恢复的）。
      const before = (
        d.prepare('SELECT COUNT(*) AS n FROM wallet_ledger').get() as { n: number }
      ).n;

      d.exec(`
        CREATE TABLE wallet_ledger_v11 (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          userId            TEXT NOT NULL,
          ts                TEXT NOT NULL,
          kind              TEXT NOT NULL CHECK (kind IN ('recharge','ai_alloc','purchase','earning','adjust','gift','expire','service_spend')),
          amountCents       INTEGER NOT NULL,
          balanceAfterCents INTEGER NOT NULL,
          refOrderId        TEXT,
          meta              TEXT
        );
        INSERT INTO wallet_ledger_v11 (id, userId, ts, kind, amountCents, balanceAfterCents, refOrderId, meta)
          SELECT id, userId, ts, kind, amountCents, balanceAfterCents, refOrderId, meta FROM wallet_ledger;
      `);

      const after = (
        d.prepare('SELECT COUNT(*) AS n FROM wallet_ledger_v11').get() as { n: number }
      ).n;
      if (after !== before) {
        throw new Error(`wallet_ledger 重建行数不符：原 ${before} 行，新 ${after} 行`);
      }

      d.exec(`
        DROP TABLE wallet_ledger;
        ALTER TABLE wallet_ledger_v11 RENAME TO wallet_ledger;
        CREATE INDEX idx_ledger_user_ts ON wallet_ledger (userId, ts);
      `);

      d.exec(`
        CREATE TABLE service_pricing (
          service          TEXT    NOT NULL,
          op               TEXT    NOT NULL DEFAULT '*',
          unit             TEXT    NOT NULL CHECK (unit IN ('minute','page','call','kchar')),
          costCentsPerUnit REAL    NOT NULL CHECK (costCentsPerUnit >= 0),
          marginMultiplier REAL    NOT NULL DEFAULT 1.2 CHECK (marginMultiplier > 0),
          creditsPerUnit   INTEGER NOT NULL CHECK (creditsPerUnit >= 0),
          maxUnitsPerCall  INTEGER NOT NULL CHECK (maxUnitsPerCall > 0),
          enabled          INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
          updatedAt        TEXT    NOT NULL,
          PRIMARY KEY (service, op)
        );

        CREATE TABLE gateway_request (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          userId         TEXT    NOT NULL,
          idempotencyKey TEXT    NOT NULL,
          service        TEXT    NOT NULL,
          op             TEXT    NOT NULL,
          status         TEXT    NOT NULL CHECK (status IN ('in_flight','done','failed')),
          responseJson   TEXT,
          spendLedgerId  INTEGER,
          createdAt      TEXT    NOT NULL,
          completedAt    TEXT,
          UNIQUE (userId, idempotencyKey)
        );
        CREATE INDEX idx_gr_created ON gateway_request (createdAt);

        CREATE TABLE gateway_hold (
          taskId         TEXT    PRIMARY KEY,
          userId         TEXT    NOT NULL,
          service        TEXT    NOT NULL,
          op             TEXT    NOT NULL,
          holdLedgerId   INTEGER NOT NULL,
          estimatedUnits REAL    NOT NULL CHECK (estimatedUnits > 0),
          upstreamRef    TEXT,
          status         TEXT    NOT NULL CHECK (status IN ('held','settled','released')),
          createdAt      TEXT    NOT NULL,
          holdExpiresAt  TEXT    NOT NULL,
          lastPolledAt   TEXT,
          settledAt      TEXT
        );
        CREATE INDEX idx_gh_status_exp ON gateway_hold (status, holdExpiresAt);
        CREATE INDEX idx_gh_user ON gateway_hold (userId, status);
      `);
    },
  },
  {
    // gateway_hold.meta —— 长任务自己的服务端状态（JSON）。
    //
    // 语音这条链路上有一样东西非存不可：**中转 OSS 的 objectKey**。
    // 它在 /asr/ticket 那一刻就生成了，而删除它的时机在几十分钟之后的 /asr/task 里，
    // 中间隔着一次进程重启都不奇怪。客户端回传是不行的——删对象是我们的清理义务，
    // 交给客户端等于「客户端不回来我们就永远不删」，而 OSS 里躺的是客户的会议录音。
    //
    // upstreamRef 已经被听悟的 TaskId 占着，语义是「上游怎么称呼这个任务」，
    // 塞第二样东西进去两边都会写错。加一列 JSON 而不是加一列 objectKey：
    // 这张表是网关的通用长任务状态表，下一家异步服务要存的东西不会同名。
    version: 12,
    up: (d) => {
      d.exec('ALTER TABLE gateway_hold ADD COLUMN meta TEXT');
    },
  },
  {
    // P4 的五家服务：先把定价行建好（迁移 11 的注释里写的就是这个做法）。
    //
    // 不建行的后果不是「没定价」而是**错误分类整个走样**：查不到定价行回的是
    // not_configured（语义是「我们漏建行了」，桌面端当运维故障报），
    // 而这五家在合同/账号就绪之前的正确状态是 service_disabled（「未开放」，
    // 桌面端显示「未开放」并给「改用自己的 Key」的入口）。两者在用户眼里
    // 长得一样，下一步却完全不同。
    //
    // enabled 的初值按「上线前置条件」（设计 §9）分两档
    //（2026-08-26 更新：企查查/法宝两家已由迁移 21 改为默认开启，见该条注释）：
    // - 企查查 / 北大法宝 **必须是 0**：机构订阅制，共用一个 token 服务全部终端用户
    //   属于按量分销，需要单独授权。代码先合、开关默认关，合同谈成后改一个开关即可。
    // - OCR / TTS / Tushare 开着：它们只等供应商凭证配好，缺凭证时 adapter 自己会回
    //   not_configured，不需要再加一道开关。
    //
    // costCentsPerUnit 是**采购成本的初值，不是账单**：真实单价随合同定，
    // admin 调价不发版（upsertPricing 会按成本 × 加价率重算 creditsPerUnit）。
    // 加价率按服务分档（决策 D4）：按次昂贵的企业数据加得少，按量便宜的加得多。
    //
    // INSERT OR IGNORE：线上可能已经手工建过行并调过价，迁移**绝不覆盖**它们。
    version: 13,
    up: (d) => {
      const now = new Date().toISOString();
      const rows: [string, string, string, number, number, number, number][] = [
        // service,     op,          unit,    cost,  margin, maxUnits, enabled
        //
        // search 与 asr 是 P0/P2 就上线的两家，但那两批都没有播种机制——
        // 生产库里没有它们的定价行，于是网关回的是 not_configured（语义是「我们漏建行」）
        // 而不是 service_disabled（「产品尚未开放」）。两者给用户的下一步完全不同，
        // 所以在这里一并补上，别让「上线了但查不到定价」这种半残状态留在生产上。
        ['search', 'web', 'call', 3, 1.5, 1, 1],
        // 语音按分钟。maxUnitsPerCall=240 是四小时，比任何一场会都长；
        // 它挡的是「申报 1 分钟传两小时」那种绕过余额闸的做法，不是限制正常使用。
        ['asr', 'transcribe', 'minute', 8, 1.25, 240, 1],
        ['ocr', 'recognize', 'page', 2, 1.5, 50, 1],
        ['tts', 'speech', 'kchar', 120, 1.25, 10, 1],
        // 音色列表上游不收费。**必须单列一行**：否则通配行会按 kchar 的单价
        // 给「列一次音色」收一笔钱。
        ['tts', 'voices', 'call', 0, 1, 1, 1],
        ['qichacha', 'eci_info', 'call', 100, 1.3, 1, 0],
        ['tushare', 'query', 'call', 2, 1.5, 1, 1],
        ['pkulaw', '*', 'call', 50, 1.3, 1, 0],
      ];
      const stmt = d.prepare(
        `INSERT OR IGNORE INTO service_pricing
           (service, op, unit, costCentsPerUnit, marginMultiplier, creditsPerUnit, maxUnitsPerCall, enabled, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const [service, op, unit, cost, margin, maxUnits, enabled] of rows) {
        stmt.run(service, op, unit, cost, margin, Math.round(cost * margin), maxUnits, enabled, now);
      }
    },
  },
  {
    // 单价换成**查证过的真实采购成本**，并把派生改成向上取整。
    //
    // 迁移 13 那批 costCentsPerUnit 是占位值（它自己的注释就写着「初值，不是账单」），
    // 上线前必须换成真实成本，否则每一次调用的毛利都是编的。以下为 **2026-08-17 查证**的结果：
    //
    // | service/op       | 成本（分/单位） | 依据 |
    // |------------------|----------------|------|
    // | asr/transcribe   | 2 /分钟        | 通义听悟离线转写 0.6 元/小时（含说话人分离与语种识别，
    // |                  |                | 不另收）+ 大模型能力 0.064 元/小时/项、**多项叠加计费**。
    // |                  |                | 我们开了 6 项（见 gateway/asr.ts 的 buildCreateTaskRequest：
    // |                  |                | autoChapters 1 + summarization 3 型 + meetingAssistance 2 型）
    // |                  |                | = 0.384。合计 0.984 元/小时 ≈ 1.64 分/分钟，进位到 2。
    // |                  |                | 来源 help.aliyun.com/zh/tingwu/pricing-and-billing-rules
    // | ocr/recognize    | 8.25 /页       | 阿里云 OCR 是**按月累计调用量的阶梯价**，标准档：
    // |                  |                | ≤1 万次 0.0825、1–10 万 0.0495、10–50 万 0.0415、
    // |                  |                | 50–100 万 0.0248、>100 万 0.009 元/次。
    // |                  |                | 取 ≤1 万档的 0.0825 元 = 8.25 分：那是我们**今天**的档位，
    // |                  |                | 按将来可能跑到的量定价等于现在每一次调用都亏。
    // |                  |                | 上量之后从 admin 页调低，不必发版。
    // |                  |                | 来源 help.aliyun.com/zh/ocr/product-overview/pay-as-you-go
    // | search/web       | 3.6 /次        | 博查 Web Search API 目录价 36 元/千次 = 0.036 元/次。
    // |                  |                | 社区文章流传「3.6 元/千次」（低十倍），无法证实，
    // |                  |                | 按目录价取；若确有资源包价，从 admin 页调低。
    // |                  |                | 来源：博查产品服务文档（华为云市场，2025-05-27）
    // | qichacha/eci_info| 100 /次        | 企查查**按接口逐个定价**，我们调的是 /ECIInfoVerify/GetInfo
    // |                  |                | （企业信息核验），标价 1 元/次。**别按「企查查多少钱」找价**：
    // |                  |                | 同一家的企业工商信息(410) 只要 0.2 元/次，最常见档是 0.5 元/次。
    // |                  |                | 以后接别的接口必须单列一行，不能共用这一行。
    // |                  |                | 来源 openapi.qcc.com/dataApi
    // | pkulaw/*         | 50 /次         | 自有开放平台单价不公开（只留商务电话），**待维护者从控制台确认**。
    // |                  |                | 唯一公开锚点：同一运营主体在百度 API 商城上架的「法宝智能问答」
    // |                  |                | 约 0.21–0.25 元/次，但那是另一个产品，不能直接当我们这几个
    // |                  |                | MCP 端点的价。维持迁移 13 的 50 分。
    // | tushare/query    | 2 /次          | Tushare 是**积分制，不按次计钱**——与其余各家不同：积分是权限门槛
    // |                  |                | （够分才能调，调用本身不消耗积分），付费档 50 元 = 500 积分。
    // |                  |                | 这里的 2 分是「把年费摊到单次调用」的估算，不存在一张能对上的
    // |                  |                | 按次账单。调这一行时别按别家的思路去找单价。
    // | tts/speech       | —              | 不必查证：语音合成整体下线，紧接着的迁移 15 会把这两行删掉。
    // |                  |                | 这里仍然跟着改一次加价率，只为让「迁移 14 之后全表加价率统一 1.2」
    // |                  |                | 这句话在任何一个中间状态都成立（存量库可能停在 14 与 15 之间）。
    //
    // 加价率统一 1.2（维护者定）。表结构仍支持逐行调（企查查这种单价高的以后可以单独降），
    // 调价走 admin 页，不再发版。
    //
    // 派生单价改**向上取整**（见 gateway/pricing.ts 的 deriveCreditsPerUnit）：
    // 成本 2 分 × 1.2 = 2.4，round 回 2 就是零毛利。这里逐行写死取整后的值而不是调
    // deriveCreditsPerUnit——迁移是历史快照，不能随以后改了取整规则而改变已发生的事实。
    //
    // 企查查与法宝的 enabled 从 0 改成 1：维护者决定统一采购、不走按量分销授权那条路。
    // 这是他的商业判断与风险，代码侧只负责让开关翻过来（迁移 13 的注释说的「合同谈成后
    // 改一个开关」就是这一步）。
    //
    // 为什么这次是 UPDATE 而不是 INSERT OR IGNORE：迁移 13 刻意不覆盖手工调过的行，
    // 但在本次改动之前**根本没有调价的正路**（admin 定价页与这条迁移同一个 PR），
    // 生产库里的值只能是迁移 13 那批占位值。这是最后一次由迁移改价；此后单价的唯一
    // 权威变更入口是 admin 页，不会再有迁移来盖掉人调的数。
    //
    // tts/voices 不在列内：它是「列一次音色」的 0 价行，成本恒 0，加价率对它没有意义。
    version: 14,
    up: (d) => {
      const now = new Date().toISOString();
      const rows: [string, string, number, number, number, number][] = [
        // service,    op,          cost, margin, creditsPerUnit = ceil(cost × margin), enabled
        ['search', 'web', 3.6, 1.2, 5, 1],
        ['asr', 'transcribe', 2, 1.2, 3, 1],
        ['ocr', 'recognize', 8.25, 1.2, 10, 1],
        ['tts', 'speech', 120, 1.2, 144, 1],
        ['qichacha', 'eci_info', 100, 1.2, 120, 1],
        ['tushare', 'query', 2, 1.2, 3, 1],
        ['pkulaw', '*', 50, 1.2, 60, 1],
      ];
      const stmt = d.prepare(
        `UPDATE service_pricing
            SET costCentsPerUnit = ?, marginMultiplier = ?, creditsPerUnit = ?, enabled = ?, updatedAt = ?
          WHERE service = ? AND op = ?`
      );
      for (const [service, op, cost, margin, credits, enabled] of rows) {
        stmt.run(cost, margin, credits, enabled, now, service, op);
      }
    },
  },
  {
    // 语音合成（tts）整体下线：删定价行。
    //
    // 桌面端在 #386 里把云端 ElevenLabs 那一档删了，语音合成只剩本机 Kokoro 一条路，
    // 没有档位可选（master 上 ExternalServiceProvider 对 TTS 的引用数已经是 0）。
    // 官网这边的 tts 适配器随本次改动一起删掉。
    //
    // **定价行必须跟着删，不能只是置 enabled=0**：留着的话，后台定价页会摆出一项
    // 「未开放」的服务，读的人会以为它是合同没谈成、等着开通——而它是一个产品里
    // 根本不存在的东西。「未开放」是一个有定义的产品状态（桌面端据此显示「改用
    // 自己的 Key」），不该拿来表示「已删除」。
    //
    // 删行之后，万一还有谁调 /api/gateway/tts/*，回的是 not_configured（服务未注册），
    // 与「未知服务」同一个语义，这是对的。
    version: 15,
    up: (d) => {
      d.prepare("DELETE FROM service_pricing WHERE service = 'tts'").run();
    },
  },
  // 手机号验证码登录（大陆站）。验证码落库而不是进内存：官网在 pm2 下可能多实例，
  // 内存 Map 会让「A 实例发码、B 实例验码」直接失败，且重启即失效。
  {
    version: 16,
    up: (d) => {
      d.exec(`
        CREATE TABLE sms_code (
          scene     TEXT    NOT NULL,
          phone     TEXT    NOT NULL,
          codeHash  TEXT    NOT NULL,
          expiresAt INTEGER NOT NULL,
          attempts  INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (scene, phone)
        );
        -- 发送流水：冷却（同号 60 秒）与当日配额（同号 24 小时 10 条）都从这里算。
        -- 与 sms_code 分开是因为 sms_code 会在核销时删掉，删了就算不出配额了。
        CREATE TABLE sms_send_log (
          scene  TEXT    NOT NULL,
          phone  TEXT    NOT NULL,
          sentAt INTEGER NOT NULL
        );
        CREATE INDEX sms_send_log_lookup ON sms_send_log (scene, phone, sentAt);
      `);
    },
  },
  // 口令登录的失败计次。/api/auth/exchange-key 是匿名端点、验对口令就发 awdk_ Key，
  // 没有计次它就是个无限次数的口令试探口；/api/auth/login 此前同样没有防爆破。
  {
    version: 17,
    up: (d) => {
      d.exec(`
        CREATE TABLE login_attempt (
          scope    TEXT    NOT NULL,  -- 'account' | 'ip'
          key      TEXT    NOT NULL,
          failedAt INTEGER NOT NULL
        );
        CREATE INDEX login_attempt_lookup ON login_attempt (scope, key, failedAt);
      `);
    },
  },
  // 邮箱验证码登录（国际站）。与 v16 的短信两张表逐字对应——那边的理由这边一条不少：
  // 落库而不是内存是因为 pm2 可能多实例；send_log 与 code 分表是因为 code 核销即删，
  // 删了就算不出当日配额。
  {
    version: 18,
    up: (d) => {
      d.exec(`
        CREATE TABLE mail_code (
          scene     TEXT    NOT NULL,
          email     TEXT    NOT NULL,
          codeHash  TEXT    NOT NULL,
          expiresAt INTEGER NOT NULL,
          attempts  INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (scene, email)
        );
        CREATE TABLE mail_send_log (
          scene  TEXT    NOT NULL,
          email  TEXT    NOT NULL,
          sentAt INTEGER NOT NULL
        );
        CREATE INDEX mail_send_log_lookup ON mail_send_log (scene, email, sentAt);
      `);
    },
  },
  // 验证码发送的 IP 维度。原先两张 send_log 只按「号码/地址」计数，防的是猜码；
  // 防不住**换号**——每换一个目标就是一份全新的冷却与日配额，而短信是按条真金白银计费的。
  // 加一列而不是新建表：配额本来就该从同一份发送流水里算，两份流水必然漂。
  // 存量行的 ip 为 NULL，按「未知来源」处理，不参与 IP 维度计数。
  {
    version: 19,
    up: (d) => {
      d.exec(`
        ALTER TABLE sms_send_log  ADD COLUMN ip TEXT;
        ALTER TABLE mail_send_log ADD COLUMN ip TEXT;
        CREATE INDEX sms_send_log_ip  ON sms_send_log  (ip, sentAt);
        CREATE INDEX mail_send_log_ip ON mail_send_log (ip, sentAt);
        -- 全局熔断要按时间扫全表，这两条索引让它不用全表扫
        CREATE INDEX sms_send_log_time  ON sms_send_log  (sentAt);
        CREATE INDEX mail_send_log_time ON mail_send_log (sentAt);
      `);
    },
  },
  // 设备名。桌面端登录换 Key 时随凭据带上「主机名 (Mac/Windows)」，
  // 账户页的「已连接的设备」据此显示设备而不是 Key 前缀——前缀对用户没有任何信息量。
  // 存量行为 NULL，界面显示「未命名设备」。
  {
    version: 20,
    up: (d) => {
      d.exec(`ALTER TABLE api_keys ADD COLUMN label TEXT;`);
    },
  },
  // 企查查/北大法宝默认开启（dev-board#172，2026-08-26 维护者裁决）。
  // 迁移 13 的种子把这两家钉在 enabled=0（机构订阅按量分销需单独授权，合同前置）；
  // 维护者已裁决按 D1 全代采、合同风险自担，且官方版口径是「外部服务默认全部开启、
  // 用时扣 Credits」。生产库早已手工开到 1，这条对它是无操作；它真正管的是
  // 此后每一个全新部署——别再长出「代码默认关、只有老库是开的」这种环境漂移。
  {
    version: 21,
    up: (d) => {
      d.prepare(
        `UPDATE service_pricing SET enabled = 1
          WHERE enabled = 0 AND ((service = 'qichacha' AND op = 'eci_info') OR service = 'pkulaw')`
      ).run();
    },
  },
  // 企查查知识产权类查询的通配定价（dev-board#179）：op = 智能体数据平台的 MCP 工具名
  //（get_trademark_info/get_patent_info/...，白名单在 adapters/qichacha.ts）。
  // 与法宝同款用 '*' 通配一行管一族——精确行（eci_info）优先于通配，findPricing 已定序。
  // 成本初值 50 分/次是订阅折算的估值不是账单，admin 调价不发版（upsertPricing 重算积分价）。
  {
    version: 22,
    up: (d) => {
      const now = new Date().toISOString();
      d.prepare(
        `INSERT OR IGNORE INTO service_pricing
           (service, op, unit, costCentsPerUnit, marginMultiplier, creditsPerUnit, maxUnitsPerCall, enabled, updatedAt)
         VALUES ('qichacha', '*', 'call', 50, 1.2, 60, 1, 1, ?)`
      ).run(now);
    },
  },
  // 成本台账（dev-board#219）：外部服务的「我们还欠着能撑几天」一张表。
  // cost_account 只存会变的账目字段；服务清单、币种、自动取数方式这些**不变的目录**
  // 钉在 lib/cost-ledger.ts 的代码里——加一家服务是发版行为，不该靠手工 INSERT。
  // cost_snapshot 是余额时间线：日耗估算从相邻快照的降幅推，快照断几天只是估得糙，不会算错。
  {
    version: 23,
    up: (d) => {
      d.exec(`
        CREATE TABLE cost_account (
          service                 TEXT PRIMARY KEY,
          balanceMinor            INTEGER,
          balanceAt               TEXT,
          balanceSource           TEXT,
          monthlyCostCents        INTEGER,
          expiresAt               TEXT,
          burnOverrideMinorPerDay INTEGER,
          alertDays               INTEGER NOT NULL DEFAULT 14,
          note                    TEXT,
          updatedAt               TEXT NOT NULL
        );
        CREATE TABLE cost_snapshot (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          service      TEXT NOT NULL,
          ts           TEXT NOT NULL,
          balanceMinor INTEGER NOT NULL,
          usageMinor   INTEGER,
          source       TEXT NOT NULL
        );
        CREATE INDEX cost_snapshot_service_ts ON cost_snapshot (service, ts);
      `);
    },
  },
  // 跨设备文件传输计费（dev-board#251，设计 §2.4）：service_pricing.unit 加 'gb'。
  //
  // SQLite 不支持直接改 CHECK 约束，只能整表重建——沿用迁移 7 重建 wallet_ledger 那套
  // 「建新表 → 按行数核对搬数据 → 落表名」的写法，PRIMARY KEY (service, op) 不变。
  //
  // 成本基准 = OSS 出网流量约 0.5 元/GB = 50 分；加价率沿用全表统一的 1.2；
  // creditsPerUnit = ceil(50 × 1.2) = 60 Credits/GB（= 0.6 元/GB），对应设计文档
  // 「10MB ≈ 1 Credit」的口径。maxUnitsPerCall=3（GB）是这一行定价自己的安全上限，
  // 与应用层单文件 200MB 硬上限（云后端 MobileTransferRequest 那边）是两道独立的闸，
  // 互不替代——前者防的是「一次报价算出离谱的天价」，后者防的是「传一个装不下的文件」。
  //
  // INSERT OR IGNORE：不覆盖线上已调过的价（与迁移 13/22 同一惯例）。
  {
    version: 24,
    up: (d) => {
      const before = (
        d.prepare('SELECT COUNT(*) AS n FROM service_pricing').get() as { n: number }
      ).n;

      d.exec(`
        CREATE TABLE service_pricing_v24 (
          service          TEXT    NOT NULL,
          op               TEXT    NOT NULL DEFAULT '*',
          unit             TEXT    NOT NULL CHECK (unit IN ('minute','page','call','kchar','gb')),
          costCentsPerUnit REAL    NOT NULL CHECK (costCentsPerUnit >= 0),
          marginMultiplier REAL    NOT NULL DEFAULT 1.2 CHECK (marginMultiplier > 0),
          creditsPerUnit   INTEGER NOT NULL CHECK (creditsPerUnit >= 0),
          maxUnitsPerCall  INTEGER NOT NULL CHECK (maxUnitsPerCall > 0),
          enabled          INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
          updatedAt        TEXT    NOT NULL,
          PRIMARY KEY (service, op)
        );
        INSERT INTO service_pricing_v24
          SELECT service, op, unit, costCentsPerUnit, marginMultiplier, creditsPerUnit, maxUnitsPerCall, enabled, updatedAt
            FROM service_pricing;
      `);

      const after = (
        d.prepare('SELECT COUNT(*) AS n FROM service_pricing_v24').get() as { n: number }
      ).n;
      if (after !== before) {
        throw new Error(`service_pricing 重建行数不符：原 ${before} 行，新 ${after} 行`);
      }

      d.exec(`
        DROP TABLE service_pricing;
        ALTER TABLE service_pricing_v24 RENAME TO service_pricing;
      `);

      const now = new Date().toISOString();
      d.prepare(
        `INSERT OR IGNORE INTO service_pricing
           (service, op, unit, costCentsPerUnit, marginMultiplier, creditsPerUnit, maxUnitsPerCall, enabled, updatedAt)
         VALUES ('transfer', 'relay', 'gb', 50, 1.2, 60, 3, 1, ?)`
      ).run(now);
    },
  },

  // 迁移 25：对话式创建 Skill 的会话表（dev-board#293）。
  //
  // 消息整段存 JSON 列而不拆表：一个会话封顶几十轮、只按会话整取整存，
  // 拆 message 表换来的只有 JOIN。messagesJson 形状见 lib/skill-chat-store.ts。
  {
    version: 25,
    up: (d) => {
      d.exec(`
        CREATE TABLE skill_chat_sessions (
          id           TEXT PRIMARY KEY,
          userId       TEXT NOT NULL,
          title        TEXT NOT NULL,
          model        TEXT NOT NULL,
          lang         TEXT NOT NULL DEFAULT 'zh',
          status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','published')),
          messagesJson TEXT NOT NULL,
          createdAt    TEXT NOT NULL,
          updatedAt    TEXT NOT NULL
        );
        CREATE INDEX idx_skill_chat_user ON skill_chat_sessions (userId, updatedAt DESC);
      `);
    },
  },
  // 迁移 26：社区论坛（dev-board#310/#316/#317）。
  //
  // 帖子/评论/聊天为什么进 SQLite 而不是 JSON store：聊天是高频追加，帖子评论
  // 存在并发写（JSON 全量覆盖写会互相吞更新），信息流还要按置顶+最新活动分页排序——
  // 这三点都踩在「JSON 保留给读多写少」约定的反面。
  // 评论的软删/硬删语义与 lib/profile-comments.ts 一致，实现见 lib/forum.ts。
  {
    version: 26,
    up: (d) => {
      d.exec(`
        CREATE TABLE forum_posts (
          id             TEXT PRIMARY KEY,
          type           TEXT NOT NULL CHECK (type IN ('blog','thread')),
          title          TEXT NOT NULL,
          content        TEXT NOT NULL,
          tag            TEXT,
          authorUserId   TEXT NOT NULL,
          createdAt      TEXT NOT NULL,
          lastActivityAt TEXT NOT NULL,
          commentCount   INTEGER NOT NULL DEFAULT 0,
          pinned         INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0,1)),
          featured       INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
          hiddenAt       TEXT,
          deletedAt      TEXT
        );
        CREATE INDEX idx_forum_posts_feed ON forum_posts (pinned DESC, lastActivityAt DESC);
        CREATE INDEX idx_forum_posts_author ON forum_posts (authorUserId, createdAt DESC);

        CREATE TABLE forum_comments (
          id           TEXT PRIMARY KEY,
          postId       TEXT NOT NULL,
          authorUserId TEXT NOT NULL,
          parentId     TEXT,
          content      TEXT NOT NULL,
          createdAt    TEXT NOT NULL,
          deletedAt    TEXT
        );
        CREATE INDEX idx_forum_comments_post ON forum_comments (postId, createdAt);
        CREATE INDEX idx_forum_comments_author ON forum_comments (authorUserId, createdAt DESC);

        CREATE TABLE chat_messages (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          userId    TEXT NOT NULL,
          content   TEXT NOT NULL,
          createdAt TEXT NOT NULL
        );

        CREATE TABLE forum_reports (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          targetType     TEXT NOT NULL CHECK (targetType IN ('post','comment')),
          targetId       TEXT NOT NULL,
          reporterUserId TEXT NOT NULL,
          reason         TEXT NOT NULL DEFAULT '',
          createdAt      TEXT NOT NULL,
          resolvedAt     TEXT
        );
      `);
    },
  },
  // 迁移 27：团队 / 律所（dev-board#496，设计 §4）。
  //
  // **与 telemetry_* 两张表刻意完全分开**：那条通道是匿名的，`legal/PRIVACY.md`、
  // README、迁移 6 的建表注释三处公开承诺「安装标识与账户无关」。团队统计带 accountId、
  // 走 Bearer 鉴权、由用户显式开启，混进同一张表就是把那句承诺作废。
  // 表、端点、白名单一律另起，不复用。
  //
  // `idx_team_member_account` 是「一人一团队」（设计 §4 首期约束）的落点：
  // 主键 (teamId, accountId) 只挡「同一队重复入队」，挡不住一个人同时进两队。
  // 放在库上而不是只在 lib/team.ts 里判，是因为入队有三个入口（建队/接受邀请/将来的转让），
  // 应用层漏一处就会造出跨队双身份，而 summary 的按队聚合没有任何办法发现它。
  //
  // team_usage_daily / team_project_daily 的主键刻意是 (accountId, date[, projectKey])
  // 而不带 teamId：同一个人同一天只能有一份日聚合，换队也不该变成两份。
  {
    version: 27,
    up: (d) => {
      d.exec(`
        CREATE TABLE team (
          id                TEXT PRIMARY KEY,
          name              TEXT NOT NULL,
          ownerAccountId    TEXT NOT NULL,
          shareProjectNames INTEGER NOT NULL DEFAULT 1 CHECK (shareProjectNames IN (0,1)),
          createdAt         TEXT NOT NULL
        );

        CREATE TABLE team_member (
          teamId    TEXT NOT NULL,
          accountId TEXT NOT NULL,
          role      TEXT NOT NULL CHECK (role IN ('OWNER','ADMIN','MEMBER')),
          joinedAt  TEXT NOT NULL,
          invitedBy TEXT,
          PRIMARY KEY (teamId, accountId)
        );
        CREATE UNIQUE INDEX idx_team_member_account ON team_member (accountId);

        CREATE TABLE team_invite (
          id                TEXT PRIMARY KEY,
          teamId            TEXT NOT NULL,
          phone             TEXT NOT NULL,
          role              TEXT NOT NULL CHECK (role IN ('ADMIN','MEMBER')),
          createdBy         TEXT NOT NULL,
          createdAt         TEXT NOT NULL,
          expiresAt         TEXT NOT NULL,
          acceptedAt        TEXT,
          acceptedAccountId TEXT
        );
        CREATE INDEX idx_team_invite_phone ON team_invite (phone, acceptedAt);
        CREATE INDEX idx_team_invite_team ON team_invite (teamId, createdAt DESC);

        CREATE TABLE team_usage_daily (
          teamId     TEXT NOT NULL,
          accountId  TEXT NOT NULL,
          date       TEXT NOT NULL,
          payload    TEXT NOT NULL,
          receivedAt TEXT NOT NULL,
          PRIMARY KEY (accountId, date)
        );
        CREATE INDEX idx_team_usage_team_date ON team_usage_daily (teamId, date);

        CREATE TABLE team_project_daily (
          teamId       TEXT NOT NULL,
          accountId    TEXT NOT NULL,
          date         TEXT NOT NULL,
          projectKey   TEXT NOT NULL,
          projectLabel TEXT,
          minutes      INTEGER NOT NULL DEFAULT 0,
          aiTurns      INTEGER NOT NULL DEFAULT 0,
          editActions  INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (accountId, date, projectKey)
        );
        CREATE INDEX idx_team_project_team_date ON team_project_daily (teamId, date);

        CREATE TABLE team_project_alias (
          teamId     TEXT NOT NULL,
          projectKey TEXT NOT NULL,
          label      TEXT NOT NULL,
          updatedAt  TEXT NOT NULL,
          PRIMARY KEY (teamId, projectKey)
        );
      `);
    },
  },
  // 迁移 28：律所（firm）与邀请码（dev-board#496 设计 §10.1）。
  //
  // 三层是「个人 → 团队 → 律所」。律所**没有独立人员名单**：管理者就是总部团队
  // （`headTeamId`）的 OWNER/ADMIN。另立一张 firm_member 会立刻破坏「一人一团队」
  // 那条已经落在 idx_team_member_account 上的约束，也会让「我是谁」出现两个答案。
  //
  // 两个 joinCode 都建 UNIQUE 索引：加入靠「按码查行」，不唯一就会出现同一个码
  // 加进不同团队，这是权限问题不是体验问题。存量团队在这里一次性回填，
  // 回填必须在建索引之前——留着 NULL 建索引虽然能过（SQLite 多个 NULL 不算重复），
  // 但那些团队的管理者永远看不到自己的邀请码，等于这个功能对老用户不存在。
  {
    version: 28,
    up: (d) => {
      d.exec(`
        CREATE TABLE firm (
          id         TEXT PRIMARY KEY,
          name       TEXT NOT NULL,
          headTeamId TEXT NOT NULL,
          joinCode   TEXT NOT NULL,
          createdAt  TEXT NOT NULL
        );

        ALTER TABLE team ADD COLUMN firmId TEXT;
        ALTER TABLE team ADD COLUMN joinCode TEXT;
      `);

      const teams = d.prepare('SELECT id FROM team').all() as Array<{ id: string }>;
      if (teams.length > 0) {
        const used = new Set<string>();
        const update = d.prepare('UPDATE team SET joinCode = ? WHERE id = ?');
        for (const t of teams) {
          let code = generateJoinCode();
          // 同一次回填里自己跟自己撞就重来；库里此刻还没有别的码，不必查库。
          while (used.has(code)) code = generateJoinCode();
          used.add(code);
          update.run(code, t.id);
        }
      }

      d.exec(`
        CREATE UNIQUE INDEX idx_team_join_code ON team (joinCode);
        CREATE UNIQUE INDEX idx_firm_join_code ON firm (joinCode);
        CREATE INDEX idx_team_firm ON team (firmId);
      `);
    },
  },
  {
    version: 29,
    up: (d) => {
      d.exec(`
        CREATE TABLE shared_memory_document (
          spaceId TEXT NOT NULL,
          path TEXT NOT NULL,
          content TEXT NOT NULL,
          revision INTEGER NOT NULL,
          updatedAt TEXT NOT NULL,
          updatedBy TEXT NOT NULL,
          deleted INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (spaceId, path)
        );
      `);
    },
  },
  // Apple 内购（dev-board#426）：退款时间戳 + 交易号唯一约束。
  //
  // **唯一索引刻意只覆盖 `channel='appstore'`**：transactionId 这一列四条通道
  // 共用（微信 transaction_id / Stripe payment_intent / 米大师单号），给全表加
  // 唯一约束等于拿存量数据赌一把——真撞上一条重复，这条迁移会在生产库上失败，
  // 而那时整个站都起不来。内购这条通道是新开的、零存量，约束只管它就够了：
  // 「同一张苹果收据不许结算两张单」这条不变式要的正是这个范围。
  //
  // 业务侧仍然先 SELECT 再判（`transaction_reused` → 409），这条索引是兜底：
  // 并发两次 confirm 时 SELECT 都说没用过，靠它把第二次拦在事务里。
  {
    version: 30,
    up: (d) => {
      d.exec(`
        ALTER TABLE orders ADD COLUMN refundedAt TEXT;
        -- 苹果实收的 price / currency / storefront 等对账字段（JSON）。
        -- 它们**不参与结算三重校验**（见 lib/payments/appstore-catalog.ts 的币种坑），
        -- 但出账单、对总收入时必须查得到，所以要落库而不是只打日志。
        ALTER TABLE orders ADD COLUMN providerMeta TEXT;
        CREATE UNIQUE INDEX idx_orders_appstore_txn
          ON orders (transactionId)
          WHERE transactionId IS NOT NULL AND channel = 'appstore';
      `);
    },
  },
  // 账目公开（dev-board#611 / #612）：每半年一期的账目与使用情况。
  //
  // 整份报表存一列 JSON 而不是拆成收入/成本/捐赠三张表——半年一期，十年也才二十行，
  // 而口径**本来就会变**（新接一家上游、换一条支付通道）。拆表换来的是每改一次口径
  // 写一次迁移，且历史期次会被新口径改写；存 JSON 则每一期永远是它发布当天的样子。
  // 汇总在读时算（lib/transparency.ts 的 summarizeReport），不落库。
  //
  // 凭证文件与头像同一套路：字节落 data/transparency-receipts/<id>.<ext>，
  // 库里只存元数据，文件名恒由随机 id 拼出，上传方给的文件名不参与路径。
  {
    version: 31,
    up: (d) => {
      d.exec(`
        CREATE TABLE transparency_report (
          period      TEXT PRIMARY KEY,
          status      TEXT NOT NULL CHECK (status IN ('draft','published')),
          data        TEXT NOT NULL,
          publishedAt TEXT,
          updatedAt   TEXT NOT NULL
        );
        CREATE TABLE transparency_receipt (
          id        TEXT PRIMARY KEY,
          period    TEXT NOT NULL,
          fileName  TEXT NOT NULL,
          mime      TEXT NOT NULL,
          size      INTEGER NOT NULL,
          caption   TEXT,
          createdAt TEXT NOT NULL
        );
        CREATE INDEX idx_transparency_receipt_period ON transparency_receipt (period);
      `);
    },
  },
  // 迁移 32：国际站按邮箱邀请（dev-board#778）。
  //
  // 账号本体两站不同：cn 是手机号、intl 是邮箱（`lib/phone-policy.ts` 的
  // `phoneIsAccount()` 与 `lib/mail-policy.ts` 的 `emailIsAccount()`）。而 team_invite
  // 建表时只有 `phone TEXT NOT NULL`，国际站用户的 phone 永远是空的——结果不是
  // 「邀请发不出去」而是**整条团队功能在国际站不存在**：建队、凭码加入、接受邀请
  // 三个入口都卡在同一道手机号闸上。
  //
  // 除了加 `email` 列，还必须把 `phone` 改成可空。SQLite 改不了已有列的约束，
  // 只能重建表——与迁移 7 / 11 / 24 同一套路：建新表 → 拷数据 → 核行数 → 换名。
  // 拿 NOT NULL 的 phone 塞空串糊弄过去是更省事，但那会让「这条邀请挂在谁身上」
  // 变成要看两列才答得出的问题，`listInvitesFor*` 的索引也会退化成全表扫。
  //
  // CHECK 保证**恰有一列有值**：一条邀请只能挂在一个标识上。两列都填的行会让
  // 「按谁匹配」在两站之间打架，而那种不一致在库里躺着不会报错，只会在某天
  // 让一个人接受到不该属于他的邀请。
  {
    version: 32,
    up: (d) => {
      const before = (d.prepare('SELECT COUNT(*) AS n FROM team_invite').get() as { n: number }).n;
      d.exec(`
        CREATE TABLE team_invite_v32 (
          id                TEXT PRIMARY KEY,
          teamId            TEXT NOT NULL,
          phone             TEXT,
          email             TEXT,
          role              TEXT NOT NULL CHECK (role IN ('ADMIN','MEMBER')),
          createdBy         TEXT NOT NULL,
          createdAt         TEXT NOT NULL,
          expiresAt         TEXT NOT NULL,
          acceptedAt        TEXT,
          acceptedAccountId TEXT,
          CHECK ((phone IS NOT NULL) <> (email IS NOT NULL))
        );
        INSERT INTO team_invite_v32
          SELECT id, teamId, phone, NULL, role, createdBy, createdAt, expiresAt,
                 acceptedAt, acceptedAccountId
            FROM team_invite;
      `);

      const after = (
        d.prepare('SELECT COUNT(*) AS n FROM team_invite_v32').get() as { n: number }
      ).n;
      if (after !== before) {
        throw new Error(`team_invite 重建行数不符：原 ${before} 行，新 ${after} 行`);
      }

      d.exec(`
        DROP TABLE team_invite;
        ALTER TABLE team_invite_v32 RENAME TO team_invite;
        CREATE INDEX idx_team_invite_phone ON team_invite (phone, acceptedAt);
        CREATE INDEX idx_team_invite_email ON team_invite (email, acceptedAt);
        CREATE INDEX idx_team_invite_team ON team_invite (teamId, createdAt DESC);
      `);
    },
  },
  // 迁移 33：个人 Pro（微信 Native 一次性购买，月付 / 年付）。
  //
  // - entitlements.expiresAt：NULL = 永久（既有 feature / skill / plugin 权益不受影响）；
  //   Pro 权益 feature='pro'，每次付款顺延到期时间。只加可空列，不重建表。
  // - pro_payment：每笔 Pro 付款一行，outTradeNo 唯一 —— 结算的幂等键。
  //   履约先查后写，且与 markOrderPaid 同一事务（settleOrderPaid）。
  // - billing_event：带账户的计费事件（subscription_paid）。**刻意不进 telemetry_event**：
  //   那张表公开承诺「安装标识与账户无关」（见迁移 6 / 27 的注释）。(eventName, outTradeNo) 唯一。
  // - trial_balance：试用计量 v0.1.1 的服务端权威（TRIAL-API-CONTRACT）。本迁移只建最小表，
  //   付费时把 status 置为 converted；发放 / 计次端点在计量 PR 里补。
  {
    version: 33,
    up: (d) => {
      d.exec(`
        ALTER TABLE entitlements ADD COLUMN expiresAt TEXT;

        CREATE TABLE pro_payment (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          outTradeNo  TEXT NOT NULL UNIQUE,
          userId      TEXT NOT NULL,
          plan        TEXT NOT NULL CHECK (plan IN ('monthly','yearly')),
          amountCents INTEGER NOT NULL CHECK (amountCents > 0),
          periodStart TEXT NOT NULL,
          periodEnd   TEXT NOT NULL,
          createdAt   TEXT NOT NULL
        );
        CREATE INDEX idx_pro_payment_user ON pro_payment (userId, periodEnd);

        CREATE TABLE billing_event (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          eventName  TEXT NOT NULL,
          userId     TEXT NOT NULL,
          outTradeNo TEXT NOT NULL,
          attrs      TEXT,
          ts         TEXT NOT NULL,
          UNIQUE (eventName, outTradeNo)
        );
        CREATE INDEX idx_billing_event_ts ON billing_event (eventName, ts);

        CREATE TABLE trial_balance (
          accountId        TEXT PRIMARY KEY,
          status           TEXT NOT NULL CHECK (status IN ('active','exhausted_calls','expired_days','converted')),
          daysQuota        INTEGER NOT NULL DEFAULT 14,
          callsQuota       INTEGER NOT NULL DEFAULT 80,
          callsUsed        INTEGER NOT NULL DEFAULT 0 CHECK (callsUsed >= 0),
          trialStartedAt   TEXT,
          trialEndsAt      TEXT,
          region           TEXT,
          convertedAt      TEXT,
          convertedOrderNo TEXT,
          updatedAt        TEXT NOT NULL
        );
      `);
    },
  },
  // 迁移 34：试用计量 v0.1.1 回合账本（TRIAL-API-CONTRACT §2，规格 §3.1）。
  //
  // 每次桌面上报一行，(accountId, turnId) 唯一 —— 计次的幂等键。billable=1 的行才让
  // trial_balance.callsUsed += 1，且与 INSERT 同一事务。不计费的上报（已转付费、
  // 未发放、已用尽/到期、无助手正文）也落一行，免得同一 turnId 之后被误计。
  {
    version: 34,
    up: (d) => {
      d.exec(`
        CREATE TABLE ai_turn_ledger (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          accountId  TEXT NOT NULL,
          turnId     TEXT NOT NULL,
          outcome    TEXT NOT NULL,
          billable   INTEGER NOT NULL CHECK (billable IN (0, 1)),
          reason     TEXT,
          endedAt    TEXT,
          createdAt  TEXT NOT NULL,
          UNIQUE (accountId, turnId)
        );
        CREATE INDEX idx_ai_turn_ledger_account ON ai_turn_ledger (accountId, createdAt);
      `);
    },
  },
  // 迁移 35：orders.kind 扩 'subscription'（增长 Pro 规格 v0.1 · 倾向 A）。
  //
  // SQLite 改不了 CHECK，只能重建表——与迁移 7 / 11 / 24 / 32 同一套路。
  // 个人 Pro 订单从此用 kind='subscription' + skuId∈{pro_monthly,pro_yearly}，
  // 与 Credits 充值（recharge）/ 市场购买（purchase）/ 打赏（support）分开。
  {
    version: 35,
    up: (d) => {
      const before = (d.prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number }).n;
      d.exec(`
        CREATE TABLE orders_v35 (
          id             TEXT PRIMARY KEY,
          outTradeNo     TEXT NOT NULL UNIQUE,
          userId         TEXT,
          kind           TEXT NOT NULL CHECK (kind IN ('recharge','purchase','support','subscription')),
          skuId          TEXT,
          description    TEXT NOT NULL DEFAULT '',
          amountCents    INTEGER NOT NULL CHECK (amountCents > 0),
          status         TEXT NOT NULL CHECK (status IN ('pending','paid','closed','expired')),
          idempotencyKey TEXT,
          createdAt      TEXT NOT NULL,
          paidAt         TEXT,
          transactionId  TEXT,
          payerOpenid    TEXT,
          channel        TEXT NOT NULL DEFAULT 'wxpay',
          currency       TEXT NOT NULL DEFAULT 'CNY',
          providerRef    TEXT,
          refundedAt     TEXT,
          providerMeta   TEXT
        );
        INSERT INTO orders_v35
          SELECT id, outTradeNo, userId, kind, skuId, description, amountCents, status,
                 idempotencyKey, createdAt, paidAt, transactionId, payerOpenid,
                 channel, currency, providerRef, refundedAt, providerMeta
            FROM orders;
      `);
      const after = (d.prepare('SELECT COUNT(*) AS n FROM orders_v35').get() as { n: number }).n;
      if (after !== before) {
        throw new Error(`orders 重建行数不符：原 ${before} 行，新 ${after} 行`);
      }
      d.exec(`
        DROP TABLE orders;
        ALTER TABLE orders_v35 RENAME TO orders;
        CREATE UNIQUE INDEX idx_orders_idem
          ON orders (userId, idempotencyKey) WHERE idempotencyKey IS NOT NULL;
        CREATE INDEX idx_orders_user ON orders (userId);
        CREATE UNIQUE INDEX idx_orders_appstore_txn
          ON orders (transactionId)
          WHERE transactionId IS NOT NULL AND channel = 'appstore';
      `);
    },
  },
  {
    version: 36,
    up: (d) => {
      d.exec(`
        CREATE TABLE subscription_period (
          id INTEGER PRIMARY KEY AUTOINCREMENT, userId TEXT NOT NULL,
          outTradeNo TEXT NOT NULL, cycle INTEGER NOT NULL,
          startsAt TEXT NOT NULL, endsAt TEXT NOT NULL,
          monthlyCents INTEGER NOT NULL CHECK(monthlyCents > 0),
          weeklyCents INTEGER NOT NULL CHECK(weeklyCents > 0),
          UNIQUE(outTradeNo, cycle)
        );
        CREATE INDEX idx_subscription_period_user ON subscription_period(userId, startsAt, endsAt);
        CREATE TABLE subscription_usage (
          ledgerId INTEGER PRIMARY KEY REFERENCES wallet_ledger(id),
          periodId INTEGER NOT NULL REFERENCES subscription_period(id),
          weekStart TEXT NOT NULL, amountCents INTEGER NOT NULL
        );
        ALTER TABLE openrouter_keys ADD COLUMN fundingJson TEXT;
        CREATE TABLE subscription_preferences (
          userId TEXT PRIMARY KEY, walletFallbackEnabled INTEGER NOT NULL DEFAULT 0 CHECK(walletFallbackEnabled IN (0,1))
        );
      `);
    },
  },

  {
    version: 37,
    up: (d) => {
      // Browser AI metadata only: never persist document text or generated content.
      d.exec(`
        CREATE TABLE web_ai_request (
          userId TEXT NOT NULL, requestId TEXT NOT NULL, payloadHash TEXT NOT NULL,
          state TEXT NOT NULL CHECK(state IN ('reserved','submitted','usage_pending','settled','released','refunded_pending')),
          model TEXT NOT NULL, reserveCents INTEGER NOT NULL CHECK(reserveCents > 0),
          reserveLedgerId INTEGER NOT NULL REFERENCES wallet_ledger(id),
          fundingJson TEXT NOT NULL, exchangeRate REAL NOT NULL, margin REAL NOT NULL,
          createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
          generationId TEXT, costUsd REAL, chargedCents INTEGER, chargeLedgerId INTEGER,
          errorCode TEXT, PRIMARY KEY(userId, requestId)
        );
        CREATE UNIQUE INDEX idx_web_ai_active ON web_ai_request(userId)
          WHERE state IN ('reserved','submitted','usage_pending');
        CREATE INDEX idx_web_ai_created ON web_ai_request(userId,createdAt);
      `);
    },
  },
  {
    version: 38,
    up: (d) => {
      // Native document agent metadata only; no document, instruction or tool output text.
      d.exec(`
        CREATE TABLE web_ai_agent_run (
          runId TEXT PRIMARY KEY, userId TEXT NOT NULL, fileId TEXT NOT NULL,
          scopeHash TEXT NOT NULL, currency TEXT NOT NULL,
          perGenerationMaxChargeCents INTEGER NOT NULL CHECK(perGenerationMaxChargeCents > 0),
          totalReservedCents INTEGER NOT NULL DEFAULT 0 CHECK(totalReservedCents >= 0),
          nextStep INTEGER NOT NULL DEFAULT 0 CHECK(nextStep BETWEEN 0 AND 4),
          lastRequestId TEXT, stopped INTEGER NOT NULL DEFAULT 0 CHECK(stopped IN (0,1)),
          createdAt TEXT NOT NULL, expiresAt TEXT NOT NULL
        );
        CREATE INDEX idx_web_ai_agent_user ON web_ai_agent_run(userId);
      `);
    },
  },
  {
    version: 39,
    up: (d) => d.exec(`
      CREATE TABLE password_credential (
        userId TEXT PRIMARY KEY, passwordHash TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE password_setup_ticket (
        tokenHash TEXT PRIMARY KEY, userId TEXT NOT NULL,
        account TEXT NOT NULL, expiresAt INTEGER NOT NULL
      );
      CREATE INDEX idx_password_setup_user ON password_setup_ticket(userId);
    `),
  },
  {
    version: 40,
    up: (d) => d.exec(`
      CREATE TABLE captcha_challenge (
        id TEXT PRIMARY KEY, answerHash TEXT NOT NULL, account TEXT NOT NULL,
        purpose TEXT NOT NULL, ip TEXT NOT NULL, createdAt INTEGER NOT NULL,
        expiresAt INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_captcha_challenge_ip ON captcha_challenge(ip, createdAt);
      CREATE INDEX idx_captcha_challenge_account ON captcha_challenge(account, createdAt);
    `),
  },
  {
    version: 41,
    up: (d) => d.exec(`
      CREATE TABLE developer_profile (
        userId TEXT PRIMARY KEY, data TEXT NOT NULL, status TEXT NOT NULL,
        version INTEGER NOT NULL, contactVerification TEXT, reviewNote TEXT NOT NULL DEFAULT '',
        createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE TABLE developer_review (
        id INTEGER PRIMARY KEY AUTOINCREMENT, userId TEXT NOT NULL, version INTEGER NOT NULL,
        action TEXT NOT NULL, note TEXT NOT NULL, actor TEXT NOT NULL, snapshot TEXT NOT NULL, createdAt TEXT NOT NULL
      );
      CREATE TABLE plugin_submission_token (
        id TEXT PRIMARY KEY, userId TEXT NOT NULL, label TEXT NOT NULL, tokenHash TEXT NOT NULL UNIQUE,
        createdAt TEXT NOT NULL, expiresAt TEXT NOT NULL, lastUsedAt TEXT, revokedAt TEXT
      );
      CREATE INDEX idx_plugin_submission_token_user ON plugin_submission_token(userId);
    `),
  },
  {
    version: 42,
    up: d => d.exec(`
      CREATE TABLE platform_ai_request (
        userId TEXT NOT NULL, requestId TEXT NOT NULL, payloadHash TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('reserved','submitted','usage_pending','settled','released','refunded_pending')),
        model TEXT NOT NULL, reserveCents INTEGER NOT NULL, reserveLedgerId INTEGER NOT NULL REFERENCES wallet_ledger(id),
        fundingJson TEXT NOT NULL, priceJson TEXT NOT NULL, thinking INTEGER NOT NULL,
        exchangeRate REAL NOT NULL, margin REAL NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
        costCny REAL, costUsd REAL, chargedCents INTEGER, usageJson TEXT, errorCode TEXT,
        PRIMARY KEY(userId,requestId)
      );
      CREATE INDEX idx_platform_ai_pending ON platform_ai_request(state,createdAt);
      CREATE TABLE bailian_retired_key (keyId INTEGER PRIMARY KEY REFERENCES openrouter_keys(id), lastCheckedAt TEXT);
      CREATE TABLE skill_ai_request (
        requestId TEXT PRIMARY KEY, userId TEXT NOT NULL, state TEXT NOT NULL,
        model TEXT NOT NULL, fundingJson TEXT NOT NULL, priceJson TEXT NOT NULL,
        margin REAL NOT NULL, createdAt TEXT NOT NULL, usageJson TEXT, costCny REAL,
        resultJson TEXT, incidentReference TEXT
      );
      CREATE INDEX idx_skill_ai_pending ON skill_ai_request(state,createdAt);
    `),
  },
  {
    version: 43,
    up: d => d.exec(`
      CREATE TABLE appstore_subscription_account (
        userId TEXT PRIMARY KEY, appAccountToken TEXT NOT NULL UNIQUE
      );
      CREATE TABLE appstore_subscription (
        originalTransactionId TEXT PRIMARY KEY, userId TEXT NOT NULL,
        productId TEXT NOT NULL, autoRenewEnabled INTEGER,
        renewalSignedAt INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE appstore_subscription_transaction (
        transactionId TEXT PRIMARY KEY, originalTransactionId TEXT NOT NULL,
        userId TEXT NOT NULL, startsAt TEXT NOT NULL, endsAt TEXT NOT NULL,
        revokedAt TEXT, signedAt INTEGER NOT NULL
      );
      CREATE INDEX idx_appstore_subscription_user ON appstore_subscription_transaction(userId, endsAt);
    `),
  },
  // 迁移 44：Circle 联盟所邀请码与独立计费绑定、包晴天律师扫码登录与晴天币月度发放（dev-board#1665）。
  {
    version: 44,
    up: (d) => {
      d.exec(`
        CREATE TABLE circle_firms (
          code              TEXT PRIMARY KEY,
          country           TEXT NOT NULL,
          name              TEXT NOT NULL,
          suffix            TEXT NOT NULL,
          marginMultiplier  REAL NOT NULL DEFAULT 1.0,
          freeDeepseekCents INTEGER NOT NULL DEFAULT 2000,
          enabled           INTEGER NOT NULL DEFAULT 1,
          expiresAt         TEXT,
          createdAt         TEXT NOT NULL,
          updatedAt         TEXT NOT NULL
        );

        CREATE TABLE user_circle_binding (
          userId        TEXT PRIMARY KEY,
          code          TEXT NOT NULL REFERENCES circle_firms(code),
          boundAt       TEXT NOT NULL,
          grantLedgerId INTEGER
        );
        CREATE INDEX idx_user_circle_binding_code ON user_circle_binding(code);

        CREATE TABLE bqt_scan_session (
          pollTokenHash TEXT NOT NULL,
          qrid        TEXT PRIMARY KEY,
          timestamp   TEXT NOT NULL,
          source      TEXT NOT NULL,
          status      TEXT NOT NULL,
          userId      TEXT,
          errorCode   TEXT,
          createdAt   INTEGER NOT NULL,
          expiresAt   INTEGER NOT NULL,
          confirmedAt INTEGER,
          consumedAt  INTEGER
        );
        CREATE INDEX idx_bqt_scan_session_expires ON bqt_scan_session(expiresAt);

        CREATE TABLE bqt_user_binding (
          userId    TEXT PRIMARY KEY,
          bqtUserId TEXT NOT NULL UNIQUE,
          mobile    TEXT,
          userName  TEXT,
          userType  TEXT NOT NULL,
          boundAt   TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );

        CREATE TABLE bqt_monthly_grant (
          userId      TEXT NOT NULL,
          monthKey    TEXT NOT NULL,
          coins       INTEGER NOT NULL,
          amountCents INTEGER NOT NULL,
          ledgerId    INTEGER,
          grantedAt   TEXT NOT NULL,
          PRIMARY KEY (userId, monthKey)
        );
      `);

      const now = new Date().toISOString();
      const seedFirms: Array<[string, string, string, string]> = [
        ['KW-ABNR-2026', 'Indonesia', 'Indonesia: ABNR', 'ABNR'],
        ['KW-SNT-2026', 'Indonesia', 'Indonesia: S&T', 'S&T'],
        ['KW-SKR-2026', 'Malaysia', 'Malaysia: Skrine', 'Skrine'],
        ['KW-ZRP-2026', 'Malaysia', 'Malaysia: ZRP', 'ZRP'],
        ['KW-WEC-2026', 'Thailand', 'Thailand: Weerawong', 'Weerawong'],
        ['KW-CMHM-2026', 'Thailand', 'Thailand: Chandler MHM', 'Chandler MHM'],
        ['KW-FRA-2026', 'Vietnam', 'Vietnam: Frasers', 'Frasers'],
        ['KW-VIL-2026', 'Vietnam', 'Vietnam: VILAF', 'VILAF'],
        ['KW-ICO-2026', 'Singapore', 'Singapore: ICONLAW', 'ICONLAW'],
        ['KW-KWMSG-2026', 'Singapore', 'Singapore: 金杜新加坡团队（内部试点）', 'KWM SG'],
      ];
      const ins = d.prepare(`
        INSERT OR IGNORE INTO circle_firms
          (code, country, name, suffix, marginMultiplier, freeDeepseekCents, enabled, expiresAt, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, 1.0, 2000, 1, NULL, ?, ?)
      `);
      for (const [code, country, name, suffix] of seedFirms) {
        ins.run(code, country, name, suffix, now, now);
      }
    },
  },
  {
    version: 45,
    up: (d) => d.exec(`
      CREATE TABLE postpaid_payment_review (userId TEXT NOT NULL, reference TEXT NOT NULL, startedAt TEXT NOT NULL, PRIMARY KEY(userId,reference));
      CREATE TABLE postpaid_policy (userId TEXT PRIMARY KEY, version TEXT NOT NULL, acceptedAt TEXT NOT NULL, epoch INTEGER NOT NULL DEFAULT 1, frozen INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE postpaid_grant (userId TEXT NOT NULL, ref TEXT NOT NULL, amountCents INTEGER NOT NULL CHECK(amountCents>0), startsAt TEXT NOT NULL, endsAt TEXT NOT NULL, PRIMARY KEY(userId,ref));
      CREATE TABLE postpaid_debt (ledgerId INTEGER PRIMARY KEY REFERENCES wallet_ledger(id), userId TEXT NOT NULL, originalCents INTEGER NOT NULL CHECK(originalCents>0), outstandingCents INTEGER NOT NULL CHECK(outstandingCents>=0), reserved INTEGER NOT NULL, reversed INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE postpaid_repayment (id INTEGER PRIMARY KEY, debtLedgerId INTEGER NOT NULL REFERENCES postpaid_debt(ledgerId), lotId INTEGER NOT NULL REFERENCES credit_lots(id), cents INTEGER NOT NULL CHECK(cents>0), createdAt TEXT NOT NULL);
      CREATE TABLE postpaid_repayment_reversal (id INTEGER PRIMARY KEY, repaymentId INTEGER NOT NULL REFERENCES postpaid_repayment(id), cents INTEGER NOT NULL CHECK(cents>0), reason TEXT NOT NULL, createdAt TEXT NOT NULL);
      CREATE TABLE postpaid_case (id TEXT PRIMARY KEY, userId TEXT NOT NULL, openedAt TEXT NOT NULL, remindAt TEXT NOT NULL, cleanupAt TEXT NOT NULL, resolvedAt TEXT, notificationReceipt TEXT, cleanupState TEXT NOT NULL DEFAULT 'none', executorReconciled INTEGER NOT NULL DEFAULT 0, manifestHash TEXT, itemCount INTEGER);
      CREATE UNIQUE INDEX postpaid_one_open_case ON postpaid_case(userId) WHERE resolvedAt IS NULL;
      CREATE TABLE postpaid_cleanup_claim (id TEXT PRIMARY KEY, userId TEXT NOT NULL, caseId TEXT NOT NULL REFERENCES postpaid_case(id), itemId TEXT NOT NULL, epoch INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'claimed', itemHash TEXT NOT NULL, expiresAt TEXT NOT NULL, requestEpoch INTEGER NOT NULL, reconciliationEvidence TEXT, UNIQUE(caseId,itemId));
      CREATE TABLE postpaid_meter (userId TEXT NOT NULL, kind TEXT NOT NULL, throughAt TEXT, remainder TEXT NOT NULL DEFAULT '0', fundingJson TEXT, PRIMARY KEY(userId,kind));
      CREATE TABLE postpaid_usage (userId TEXT NOT NULL, eventId TEXT NOT NULL, payloadHash TEXT NOT NULL, ledgerId INTEGER, amountCents INTEGER NOT NULL, PRIMARY KEY(userId,eventId));
      CREATE TABLE postpaid_egress (userId TEXT NOT NULL,eventId TEXT NOT NULL,payloadHash TEXT NOT NULL,resourceHash TEXT NOT NULL,reservedBytes TEXT NOT NULL,deliveredBytes TEXT,holdLedgerId INTEGER,chargedCents INTEGER,rateCents INTEGER NOT NULL,completed INTEGER,freeExport INTEGER NOT NULL,caseId TEXT,offsetBytes TEXT NOT NULL,totalBytes TEXT NOT NULL,fundingJson TEXT NOT NULL,createdAt TEXT NOT NULL,PRIMARY KEY(userId,eventId));
      CREATE TABLE postpaid_export (userId TEXT NOT NULL,caseId TEXT NOT NULL,resourceHash TEXT NOT NULL,totalBytes TEXT NOT NULL,deliveredBytes TEXT NOT NULL DEFAULT '0',completed INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(userId,caseId,resourceHash));
      CREATE TABLE postpaid_external_budget (userId TEXT PRIMARY KEY, ledgerId INTEGER, remainingCents INTEGER NOT NULL, state TEXT NOT NULL, generation TEXT NOT NULL, expiresAt TEXT NOT NULL, keyHash TEXT, settledUsageUsd REAL NOT NULL DEFAULT 0, usageBaseUsd REAL NOT NULL DEFAULT 0, chargedCents INTEGER NOT NULL DEFAULT 0, fundingJson TEXT NOT NULL, exchangeRate REAL NOT NULL, margin REAL NOT NULL);
    `),
  },
  // 迁移 46：团队成员职务（合伙人 / 律师助理……）。
  // 只是展示标签，不参与任何权限判定——权限仍只看 role（OWNER/ADMIN/MEMBER）。
  // 自由文本而非枚举：各所职级叫法不同，枚举会逼着一半律所用错的词。
  {
    version: 46,
    up: (d) => {
      d.exec(`ALTER TABLE team_member ADD COLUMN title TEXT;`);
    },
  },
  // First notification ACK evidence is separate from the original deletion/cost deadline.
  {
    version: 47,
    up: (d) => d.exec(`
      ALTER TABLE postpaid_case ADD COLUMN firstAckAt TEXT;
      UPDATE postpaid_case SET cleanupState='review'
        WHERE notificationReceipt IS NOT NULL AND resolvedAt IS NULL AND cleanupState='none';
    `),
  },
  // Shadow metering ledger: would-be postpaid usage only. Never joined to wallet, debt or case tables.
  {
    version: 48,
    up: (d) => d.exec(`
      CREATE TABLE postpaid_shadow_event (userId TEXT NOT NULL, eventId TEXT NOT NULL, kind TEXT NOT NULL, payloadHash TEXT NOT NULL, fromAt TEXT, toAt TEXT NOT NULL, bytes TEXT NOT NULL, byteSeconds TEXT NOT NULL DEFAULT '0', includedByteSeconds TEXT NOT NULL DEFAULT '0', wouldChargeCents INTEGER NOT NULL DEFAULT 0, rateCents INTEGER NOT NULL, currency TEXT NOT NULL, anomaly TEXT, receivedAt TEXT NOT NULL, PRIMARY KEY(userId,eventId));
      CREATE TABLE postpaid_shadow_meter (userId TEXT NOT NULL, kind TEXT NOT NULL, observedAt TEXT, bytes TEXT, remainder TEXT NOT NULL DEFAULT '0', PRIMARY KEY(userId,kind));
      CREATE TABLE postpaid_shadow_unmapped (observedAt TEXT PRIMARY KEY, users INTEGER NOT NULL, bytes TEXT NOT NULL, sampleJson TEXT NOT NULL, receivedAt TEXT NOT NULL);
    `),
  },
  // 迁移 49：包晴天律师积分通道——后台设置（含改动留痕）与积分扣减发件箱。
  {
    version: 49,
    up: (d) => d.exec(`
      CREATE TABLE bqt_settings (
        id               INTEGER PRIMARY KEY CHECK (id = 1),
        tunnelEnabled    INTEGER NOT NULL DEFAULT 0,
        centsPerPoint    REAL,
        marginMultiplier REAL,
        grantProRights   INTEGER NOT NULL DEFAULT 1,
        updatedAt        TEXT NOT NULL,
        updatedBy        TEXT
      );
      -- 2026-11-06 用户定：1 元 = 3 积分（centsPerPoint = 100/3）。通道仍默认关闭。
      INSERT INTO bqt_settings (id, centsPerPoint, updatedAt, updatedBy) VALUES (1, 100.0 / 3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'initial');
      CREATE TABLE bqt_settings_audit (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        changedAt TEXT NOT NULL,
        actor     TEXT,
        field     TEXT NOT NULL,
        oldValue  TEXT,
        newValue  TEXT
      );
      CREATE TABLE bqt_consume (
        requestNo         TEXT PRIMARY KEY,
        userId            TEXT NOT NULL,
        lawyerId          TEXT NOT NULL,
        pointsHundredths  INTEGER NOT NULL CHECK (pointsHundredths > 0),
        cents             INTEGER NOT NULL,
        service           TEXT NOT NULL,
        refId             TEXT,
        state             TEXT NOT NULL,
        resultCode        TEXT,
        attempts          INTEGER NOT NULL DEFAULT 0,
        lastError         TEXT,
        usablePointsAfter TEXT,
        createdAt         TEXT NOT NULL,
        updatedAt         TEXT NOT NULL,
        resolvedAt        TEXT,
        resolvedBy        TEXT
      );
      CREATE INDEX idx_bqt_consume_user_state ON bqt_consume(userId, state);
      CREATE INDEX idx_bqt_consume_state_updated ON bqt_consume(state, updatedAt);
      CREATE TABLE bqt_entitlement_snapshot (
        lawyerId  TEXT PRIMARY KEY,
        json      TEXT NOT NULL,
        fetchedAt TEXT NOT NULL
      );
    `),
  },
  // 迁移 50：OpenRouter 账号轮换——每个 key 行记录铸造它的 management 账号指纹，
  // 以及轮换后继续回读旧账号 key 的清单（宽限期内的迟到用量照常结算）。
  {
    version: 50,
    up: (d) => {
      // 幂等：测试脚本会把版本号回退后重跑迁移，列/表可能已存在
      if (!(d.prepare('PRAGMA table_info(openrouter_keys)').all() as { name: string }[]).some(c => c.name === 'mgmtAccount')) {
        d.exec('ALTER TABLE openrouter_keys ADD COLUMN mgmtAccount TEXT');
      }
      d.exec(`
        CREATE TABLE IF NOT EXISTS openrouter_rotated_key (
          keyId         INTEGER PRIMARY KEY REFERENCES openrouter_keys(id),
          retiredAt     TEXT NOT NULL,
          lastCheckedAt TEXT,
          lastUsageUsd  REAL,
          lastChangedAt TEXT,
          doneAt        TEXT
        );
      `);
      // 存量行：配了旧账号 key 就都是旧账号铸造的，否则是当前账号。只存指纹，不存 key。
      const fp = (k: string | undefined) =>
        k ? crypto.createHash('sha256').update(k, 'utf-8').digest('hex').slice(0, 12) : null;
      const owner = fp(process.env.OPENROUTER_PROVISIONING_KEY_RETIRED) ?? fp(process.env.OPENROUTER_PROVISIONING_KEY);
      if (owner) d.prepare('UPDATE openrouter_keys SET mgmtAccount = ? WHERE mgmtAccount IS NULL').run(owner);
    },
  },
  {
    // Google Play 内购交易号部分唯一索引（与 idx_orders_appstore_txn 同口径，防并发双 confirm 同一订单/购买重用）
    version: 51,
    up(d) {
      d.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_googleplay_txn ON orders (transactionId) WHERE transactionId IS NOT NULL AND channel = 'googleplay'"
      );
    },
  },
];

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version   INTEGER PRIMARY KEY,
      appliedAt TEXT NOT NULL
    );
  `);
  const row = d.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null };
  const current = row.v ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    const run = d.transaction(() => {
      m.up(d);
      d.prepare('INSERT INTO schema_version (version, appliedAt) VALUES (?, ?)').run(
        m.version,
        new Date().toISOString()
      );
    });
    run();
  }
}

export function getDb(): Database.Database {
  if (db) return db;
  const dataDir = path.dirname(DB_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const d = new Database(DB_FILE);
  d.pragma('journal_mode = WAL');
  d.pragma('foreign_keys = ON');
  d.pragma('busy_timeout = 5000');
  migrate(d);
  db = d;
  return db;
}

/**
 * 事务 helper：fn 内的所有写操作原子完成，抛错整体回滚。
 * 注意 better-sqlite3 事务是同步的，fn 里不要 await。
 * 用 immediate（BEGIN IMMEDIATE）直接拿写锁：默认 deferred 在多实例部署下
 * 「读快照 → 升级写锁」会撞 SQLITE_BUSY_SNAPSHOT（busy_timeout 对快照过期不生效）。
 * 嵌套调用仍走 savepoint，语义不变。
 */
export function withTransaction<T>(fn: (d: Database.Database) => T): T {
  const d = getDb();
  return d.transaction(() => fn(d)).immediate();
}

/** 仅供测试/脚本：关闭连接并允许重新打开（例如指向新库文件后重新迁移）。 */
export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
