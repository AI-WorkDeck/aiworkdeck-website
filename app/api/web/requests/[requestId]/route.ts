// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest } from 'next/server';
import { authorize,failure,json,languageOf } from '@/lib/web-ai/http';
import { validId,WebError } from '@/lib/web-ai/contract';
import { reconcile } from '@/lib/web-ai/service';
import { receipt } from '@/lib/web-ai/store';
import { siteConfig } from '@/lib/site-config';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:NextRequest,context:{params:Promise<{requestId:string}>}) {
  try {
    const user=authorize(request),{requestId}=await context.params;
    if(!validId(requestId))throw new WebError('not_found',404);
    const row=await reconcile(user.id,requestId);if(!row)throw new WebError('not_found',404);
    return json({...receipt(row),currency:siteConfig.currency});
  }catch(e){return failure(e,languageOf(request));}
}
