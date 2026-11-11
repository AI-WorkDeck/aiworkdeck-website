import { NextRequest, NextResponse } from 'next/server';
import { completeSetup, passwordError } from '@/lib/password-flow';
export async function POST(request: NextRequest) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }
  try { await completeSetup(body ?? {}); return NextResponse.json({ ok: true }); }
  catch (e) { return passwordError(e); }
}
