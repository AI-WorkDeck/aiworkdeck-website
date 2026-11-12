// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from 'next/server';
import { getUserByToken, SESSION_COOKIE } from '@/lib/sessions';
import { siteOrigins } from '@/lib/site-config';
import { errorBody, LIMITS, WebError } from './contract';
export const languageOf = (request: NextRequest) => request.nextUrl.searchParams.get('lang') === 'en' ? 'en' as const : 'zh' as const;
export function authorize(request: NextRequest, mutation = false) {
  const origin=request.headers.get('origin'), host=request.headers.get('host') ?? request.nextUrl.host;
  const origins=[...siteOrigins];
  if(process.env.NODE_ENV!=='production')origins.push(request.nextUrl.origin);
  if(request.headers.get('sec-fetch-site')==='cross-site' || (mutation && !origin) || (origin && (!origins.includes(origin) || new URL(origin).host!==host)))throw new WebError('forbidden_origin',403);
  const user=getUserByToken(request.cookies.get(SESSION_COOKIE)?.value);
  if(!user)throw new WebError('unauthorized',401);
  return user;
}
export async function readBody(request: NextRequest, maxBytes: number = LIMITS.bodyBytes) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new WebError('invalid_request',415);
  if(Number(request.headers.get('content-length')??0)>maxBytes)throw new WebError('input_too_large',413);
  const reader=request.body?.getReader(); if(!reader)throw new WebError('invalid_request');
  let count=0; const chunks:Uint8Array[]=[];
  try {while(true){const {value,done}=await reader.read();if(done)break;count+=value.byteLength;if(count>maxBytes)throw new WebError('input_too_large',413);chunks.push(value);}}
  finally {await reader.cancel().catch(()=>undefined);reader.releaseLock();}
  let value;
  try {value = JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {throw new WebError('invalid_request');}
  if (Math.max(count, Number(request.headers.get('content-length') ?? 0)) > LIMITS.bodyBytes && value?.mode !== 'agent') throw new WebError('input_too_large',413);
  return value;
}
export function json(value: unknown,status=200){return NextResponse.json(value,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie'}});}
export function failure(error:unknown,lang:'zh'|'en') {
  const e=error instanceof WebError?error:new WebError('upstream_failed',503);
  return json(errorBody(e.code,lang),e.status);
}
