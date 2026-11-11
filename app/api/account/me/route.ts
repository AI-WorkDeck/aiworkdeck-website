import {cloudState} from '@/lib/postpaid';
import { accountSubscriptionView } from '@/lib/account-subscription-view';
import { subscriptionSnapshot } from '@/lib/subscription';
import { NextRequest, NextResponse } from 'next/server';
import { resolveKeyUser } from '@/lib/account-auth';
import { isDefaultDisplayName } from '@/lib/users';
import { getBalance, getPlan } from '@/lib/wallet';
import { getUserCircleFirm } from '@/lib/circle-firms';
import { getBqtQingtianStatus } from '@/lib/bqt-auth';
import { accountBillingFields, bqtDisplayBalanceCents, refreshBqtSnapshot } from '@/lib/bqt-account';

/**
 * 桌面端账户概要（Bearer awdk_ 鉴权）。契约见总 Spec §9。
 */
export async function GET(request: NextRequest) {
  const user = resolveKeyUser(request);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // 包晴天律师：先刷新权益快照（失败沿用旧快照），下面的 Pro/余额都读快照。
  await refreshBqtSnapshot(user.id);
  const bqtQingtian = getBqtQingtianStatus(user.id);
  const circleFirm = getUserCircleFirm(user.id);
  return NextResponse.json({
    // 账户终身稳定标识（users.json 的 uuid 主键）：不随 username/displayName 改名
    // 或 Key 轮换变化。桌面 server 模式 awdk-login 桥以它作 external_account_id 映射键。
    accountId: user.id,
    username: user.username,
    displayName: user.displayName,
      verifiedEmail: user.emailVerifiedAt ? user.email : null,
    // 经短信验证的手机号（11 位裸号）或 null。桌面 server / 插件云后端的 awdk-login
    // 桥用它做「桥接认领」：把号码写到桥接用户名下，手机端 sms-login 由此解析到
    // 同一账号（手机端账号归一，dev-board#30）。持有者是 awdk_ Key 的主人本人，
    // 不构成对第三方的号码泄露。
    phone: user.phone ?? null,
    // 头像时间戳：桌面端据此拼 `{base}/api/avatar/{accountId}?v={avatarUpdatedAt}`，
    // 没有头像为 null（不是缺键）——键缺失会让消费方分不清「没头像」与「旧版本官网」。
    avatarUpdatedAt: user.avatarUpdatedAt ?? null,
    // 展示名仍是系统默认（打码号 / 打码邮箱 / 等于 username / 空）。
    // 桌面端与官网账户页据此给「填写你的姓名」引导，判定口径见 lib/users.ts。
    displayNameIsDefault: isDefaultDisplayName(user),
    ...cloudState(user.id),
    // 包晴天线报积分折算后的余额（分），旧客户端也能显示个合理的数
    balanceCents: bqtDisplayBalanceCents(user.id) ?? getBalance(user.id),
        subscription: accountSubscriptionView(user.id),
    plan: getPlan(user.id),
    createdAt: user.createdAt,
    ...accountBillingFields(user.id),
    ...(circleFirm ? { circleFirm } : {}),
    ...(bqtQingtian ? { bqtQingtian } : {}),
  });
}
