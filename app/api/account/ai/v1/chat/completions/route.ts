// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { resolveRuntimeUser } from '@/lib/platform-ai/auth';
import { AiGatewayError, chatCompletion, gatewayError } from '@/lib/platform-ai/proxy';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function POST(request:Request) {
  try {const user=resolveRuntimeUser(request);if(!user)throw new AiGatewayError('unauthorized',401);return await chatCompletion(user.id,request);}
  catch(e){return gatewayError(e,request);}
}
