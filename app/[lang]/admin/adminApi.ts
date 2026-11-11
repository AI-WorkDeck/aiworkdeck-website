import type { Dictionary } from '@/get-dictionary';

/** 新后台面板（包晴天 / Circle）共用的 JSON 调用：统一把传输层失败与业务错误码分开。 */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; body: Record<string, unknown> };

export async function callJson<T>(
    fetcher: (path: string, init?: RequestInit) => Promise<Response>,
    path: string,
    init?: { method: string; body?: unknown },
): Promise<ApiResult<T>> {
    try {
        const res = await fetcher(path, init && {
            method: init.method,
            headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
            body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) return { ok: true, data: body as T };
        return { ok: false, status: res.status, error: typeof body?.error === 'string' ? body.error : `http_${res.status}`, body };
    } catch {
        return { ok: false, status: 0, error: 'network_error', body: {} };
    }
}

/** 传输层/鉴权类失败的统一文案；业务错误码返回 null 交给面板自己翻译。 */
export function transportMessage(r: { status: number; error: string }, copy: Dictionary['adminSites']): string | null {
    if (r.status === 0) return copy.networkError;
    if (r.error === 'relay_not_configured' || r.status === 503) return copy.notConnected;
    if (r.error === 'relay_unavailable' || r.status >= 500) return copy.unavailable;
    return null;
}
