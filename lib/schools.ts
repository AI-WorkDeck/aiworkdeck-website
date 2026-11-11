import 'server-only';

import fs from 'fs';
import path from 'path';

/**
 * 院校名录（dev-board#307）：教育经历学校选择器的数据源。
 * 名单本体在 lib/schools.json（收录规则见该文件的生成任务：只收域名确定的学校，
 * 宁缺毋滥——domain 用于 https://<domain>/favicon.ico 热链校徽，错域名比缺校徽糟）。
 * 校徽刻意不落库不分发：浏览器端引用学校官网 favicon，权利面最轻；拉不到由前端回退图标。
 */

export interface School {
    name: string;
    en?: string;
    domain: string;
    aliases?: string[];
}

let cache: School[] | null = null;

export function listSchools(): School[] {
    if (cache) return cache;
    try {
        cache = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib', 'schools.json'), 'utf-8'));
    } catch {
        // 名单缺失不致命：选择器退化为自由输入（无校徽）
        cache = [];
    }
    return cache!;
}

const norm = (s: string) => s.trim().toLowerCase();

/** 精确匹配（中文名/英文名/别名），用于保存时冻结 domain */
export function findSchool(name: string): School | undefined {
    const q = norm(name);
    if (!q) return undefined;
    return listSchools().find(
        s => norm(s.name) === q || (s.en && norm(s.en) === q) || (s.aliases ?? []).some(a => norm(a) === q)
    );
}

/** 选择器联想：前缀命中优先于包含命中 */
export function searchSchools(q: string, limit = 8): School[] {
    const query = norm(q);
    if (!query) return [];
    const starts: School[] = [];
    const contains: School[] = [];
    for (const s of listSchools()) {
        const keys = [s.name, s.en ?? '', ...(s.aliases ?? [])].map(norm);
        if (keys.some(k => k.startsWith(query))) starts.push(s);
        else if (keys.some(k => k.includes(query))) contains.push(s);
        if (starts.length >= limit) break;
    }
    return [...starts, ...contains].slice(0, limit);
}
