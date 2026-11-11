import { NextResponse } from 'next/server';
import { getPublicTransparency } from '@/lib/transparency-public';

export const dynamic = 'force-dynamic';

/**
 * 公开账目接口（dev-board#611 / #612）。无鉴权——这一页存在的意义就是给所有人看。
 *
 * **草稿一个字都不出去**：取数只走 `listReports({ publishedOnly: true })`，
 * 没有任何 query 参数能把状态换成 draft。半年报在发布前会反复改，
 * 一个能拿到草稿的接口等于提前把没核对完的数字公之于众。
 *
 * 国际站的页面直接读这个接口（国内站是账目的唯一真源），所以它同时是对外契约。
 */
export async function GET() {
    return NextResponse.json(await getPublicTransparency());
}
