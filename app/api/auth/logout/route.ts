import { NextRequest, NextResponse } from 'next/server';
import { deleteSession, SESSION_COOKIE } from '@/lib/sessions';

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    deleteSession(token);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
