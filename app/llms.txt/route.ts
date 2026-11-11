import { siteConfig } from '@/lib/site-config';
import { listSkills } from '@/lib/skills-store';
import { LICENSE_URL, REPO_URL } from '@/lib/structured-data';

/**
 * `/llms.txt`——给大语言模型读的站点说明（llmstxt.org 提案）。
 *
 * 定位要说清楚：这不是标准，Google 2026-05 明确说过 AI Overviews / AI Mode
 * 对页面没有额外要求、不需要 llms.txt。做它的理由是成本近乎为零而下行风险为零，
 * 且生产日志显示 AI 抓取方本来就在高频访问本站；一份把「这是什么产品、
 * 事实清单、主要页面在哪」讲清楚的纯文本，比让模型自己从渲染后的 HTML 里猜要好。
 *
 * 红线：**只写可核验的事实**。不写用户数、下载量、客户名、评分——
 * 这份文件的每一句都可能被原样抄进模型答案，编一个数字就是在全网散播它。
 * 英文优先：AI 搜索的检索与推理主体是英文语料。
 */
export const dynamic = 'force-dynamic';

export async function GET() {
    const o = siteConfig.origin;
    const skills = listSkills({ sort: 'popular' });

    const body = `# AI WorkDeck

AI WorkDeck is an open-source, local-first legal AI workspace for lawyers and
document-heavy teams: an Office-grade editor with tracked changes, AI drafting with
citation checks, Word/WPS add-ins and a plugin marketplace. It is a desktop
application with companion online services. Desktop files are stored locally by default;
cloud AI calls, mobile transfers and shared features have separate data-processing
and storage paths, explained in the Community Edition FAQ.

## Facts

- Open source under the GNU AGPL-3.0 (${LICENSE_URL}). Source: ${REPO_URL}
- Desktop application for Windows and macOS. The document engine is LibreOffice-based.
- Local-first: files are edited on the user's own machine.
- Office integration: add-ins for Microsoft Word and (China site) WPS Office.
- Extensible in two layers: Skills (prompt-level, published instantly) and plugins
  (executable code, human-reviewed and signed per version).
- Open source and not-for-profit: the community edition of the desktop app is free,
  and the project is not run to make money. Metered third-party services (AI models,
  OCR, transcription, company and legal databases, web search) are charged at the
  vendor's own charge plus a flat 20%, which averages out the fees charged by different
  payment channels (App Store purchases can cost 30% or more on top). Servers and other
  fixed costs are fronted by the project's founder up front, not billed to users; if the
  20% leaves a surplus after channel fees and costs, it is amortized against that
  outlay first, and anything left over is donated to a national charity. No
  subscription and no per-seat fee. Accounts and usage are published twice a year at
  ${o}/en/transparency. A commercial license is available for organizations that need
  to be free of AGPL obligations.
- Made by a practising lawyer in Beijing, China.
- Two independent deployments with separate accounts and billing:
  www.aiworkdeck.com (China, CNY) and www.workdeck.ai (international, USD).

## Key pages

- Home: ${o}/en
- Get started / download: ${o}/en/start
- Community Edition FAQ: storage, memory, AI privacy and pricing: ${o}/en/faq
- Marketplace (Skills): ${o}/en/marketplace
- Marketplace (plugins): ${o}/en/marketplace/plugins
- Plugin development guide: ${o}/en/plugins/develop
- Skill charts: ${o}/en/skills/charts
- Articles (published write-ups): ${o}/zh/articles
- Releases and update mechanism: ${o}/en/updates
- Membership tiers: ${o}/en/membership
- Community: ${o}/en/community
- Privacy policy: ${o}/en/legal/privacy
- Terms of service: ${o}/en/legal/terms
- Chinese edition of every page above: replace /en/ with /zh/

## Skills

Skills are packaged prompts that run inside the desktop app on the user's own
documents. Currently published (${skills.length}):

${skills.map(s => `- ${s.name}: ${o}/en/skills/${s.id}`).join('\n')}
`;

    return new Response(body, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            // 内容随 Skill 增减变化，但没必要每次现算——一小时的边缘缓存足够
            'Cache-Control': 'public, max-age=3600',
        },
    });
}
