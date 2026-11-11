// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest,NextResponse } from 'next/server';
import { resolveKeyUser } from '@/lib/account-auth';
import { getSessionUser } from '@/lib/sessions';
import { cloudState,acceptPostpaid,resumeCloud } from '@/lib/postpaid';
export async function GET(request:NextRequest) {
    const user=resolveKeyUser(request)??await getSessionUser();
    if(!user)return NextResponse.json({error:'unauthorized'},{status:401});
    return NextResponse.json(cloudState(user.id));
}
export async function POST(request:NextRequest) {
    const user=resolveKeyUser(request)??await getSessionUser();
    if(!user)return NextResponse.json({error:'unauthorized'},{status:401});
    const body=await request.json().catch(()=>null);
    if(typeof body?.policyVersion!=='string'||body.confirmed!==true)return NextResponse.json({error:'policy_confirmation_required'},{status:400});
    try{return NextResponse.json(body.action==='resume'?resumeCloud(user.id,body.policyVersion):acceptPostpaid(user.id,body.policyVersion));}
    catch(e){return NextResponse.json({error:e instanceof Error?e.message:'postpaid_unavailable'},{status:409});}
}
