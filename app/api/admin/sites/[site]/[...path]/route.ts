import { NextRequest } from 'next/server';
import { relayAdmin } from '@/lib/admin-relay';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handle(request: NextRequest, context: { params: Promise<{ site: string; path: string[] }> }) {
  const { site, path } = await context.params;
  return relayAdmin(request, site, path);
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
