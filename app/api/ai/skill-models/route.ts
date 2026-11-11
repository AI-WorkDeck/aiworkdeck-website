import { NextRequest, NextResponse } from 'next/server';
import { getUserByToken, SESSION_COOKIE } from '@/lib/sessions';
import { getBalance } from '@/lib/credits';
import { listAiModels, defaultAiModel } from '@/lib/ai-models';
import { getAiConfig } from '@/lib/ai-config';
import { countUserTurnsToday, MAX_TURNS_PER_DAY } from '@/lib/skill-chat-store';

export const dynamic = 'force-dynamic';

/**
 * Skill 创建页的 AI 能力菜单：本站可选模型、默认模型、（登录时）余额与当日剩余轮数。
 * 未登录也返回菜单——页面要先画出选择器，登录门槛留给真正发起生成的那一刻。
 */
export async function GET(request: NextRequest) {
  const user = getUserByToken(request.cookies.get(SESSION_COOKIE)?.value);
  const { apiKey } = getAiConfig();
  return NextResponse.json({
    configured: !!apiKey,
    models: (await listAiModels()).map(m => ({
      id: m.id,
      label: m.label,
      note: m.note,
      deep: !!m.deep,
    })),
    defaultModel: (await defaultAiModel()).id,
    balanceCents: user ? getBalance(user.id) : null,
    chatTurnsRemaining: user
      ? Math.max(0, MAX_TURNS_PER_DAY - countUserTurnsToday(user.id))
      : null,
  });
}
