// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest } from 'next/server';
import { handleMemory, MemoryRouteContext } from '@/lib/shared-memory-http';

export const dynamic = 'force-dynamic';
const handle = (request: NextRequest, context: MemoryRouteContext) => handleMemory(request, context, true);
export const GET = handle;
export const PUT = handle;
export const DELETE = handle;
