import { NextResponse } from 'next/server';
import { getGithubStars } from '@/lib/github-stars';

/**
 * 静态生成页（定价、关于……）的 Star 数在构建期为 null 被烤进 HTML，
 * 由导航栏的客户端组件来这里补。复用 lib/github-stars.ts 的进程内缓存，永不阻塞；
 * 拿不到时返回 null，前端据此隐藏数字（不显示 0）。
 */
export const dynamic = 'force-dynamic';

export function GET() {
    const stars = getGithubStars();
    return NextResponse.json({ stars }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
