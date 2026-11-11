/**
 * 「法人格」测试内容与计分（dev-board#329）。
 *
 * 设计裁决（调研结论内化，全文见卡内提案链接）：
 * - 文案铁律：自嘲只嘲苦劳（加班/法考/被甲方折磨），绝不贬损能力——每个类型
 *   固定「苦劳句 + 能力句」结构，能力句必须是夸赞。
 * - 身份不直接问（维护者 2026-08-31 拍板）：第 1 题用「法考考了多少分」侧面
 *   推断分支（执业者/学生/围观群众），不收集任何显式身份信息。
 * - 无「分享得奖励」钩子（同 lib/badges.ts 红线）；结果页须标注「仅供娱乐」。
 * - 客户端也要计分（答完即出结果，不发答案上服务器），所以本文件不挂
 *   server-only；内容本身是公开物。
 */

export type QuizPool = 'pro' | 'student' | 'egg';

export interface QuizType {
    id: string;
    pool: QuizPool;
    nameZh: string;
    nameEn: string;
    /** 苦劳自嘲句（可以惨，不能弱） */
    toilZh: string;
    toilEn: string;
    /** 能力吹捧句（落点必须夸） */
    praiseZh: string;
    praiseEn: string;
    /** 客户名片版第一句（dev-board#329 维护者洞察：卡也被当作对客户的专业名片来分享）。
     * 仅执业池有；替换苦劳句，能力句共用。措辞过律师执业宣传规范（无胜诉承诺/无同行比较） */
    bizZh?: string;
    bizEn?: string;
    /** 结果页产品桥的一句话话术（dev-board#329：测后转化，按类型「被看懂」） */
    pitchZh: string;
    pitchEn: string;
    /** 稀缺性百分比（静态设定，用于「全国仅 X% 的法律人」） */
    rarity: number;
    /** 三维基准分：卷度 / 抗压 / 锋利，55–99 */
    dims: [number, number, number];
}

export const QUIZ_TYPES: readonly QuizType[] = [
    {
        id: 'juanwang', pool: 'pro',
        nameZh: '红圈卷王', nameEn: 'Elite Grinder',
        toilZh: '凌晨两点写字楼的灯，有一盏是你开的', toilEn: 'One of the 2 a.m. office lights is yours',
        praiseZh: '但全组最硬的项目经验，也刻着你的名字', praiseEn: 'But the strongest deal sheet on the team bears your name',
        bizZh: '重大项目的经验，是一个通宵一个通宵攒出来的', bizEn: 'Big-deal experience, built one all-nighter at a time',
        pitchZh: '卷要卷在刀刃上——尽调、纪要这些体力活，交给你的 AI 工作台', pitchEn: 'Grind where it counts — let your AI workbench take the grunt work',
        rarity: 4, dims: [96, 82, 88],
    },
    {
        id: 'yexingxia', pool: 'pro',
        nameZh: '非诉夜行侠', nameEn: 'Deal Nighthawk',
        toilZh: '白天改 SPA，晚上改 SHA', toilEn: 'SPA by day, SHA by night',
        praiseZh: '交割那天，你比新郎还体面', praiseEn: 'On closing day you outshine the groom',
        bizZh: '每一单交割，都经得起最挑剔的复核', bizEn: 'Every closing stands up to the toughest review',
        pitchZh: '交割文件让 AI 先过一遍，第八版 SHA 也能准点睡', pitchEn: 'Let AI take the first pass, and closing night ends before dawn',
        rarity: 6, dims: [92, 78, 85],
    },
    {
        id: 'tingbian', pool: 'pro',
        nameZh: '庭辩战神', nameEn: 'Courtroom Ace',
        toilZh: '开庭前失眠三天是常规操作', toilEn: 'Three sleepless nights before trial, as usual',
        praiseZh: '站上法庭那一刻，全场都是你的主场', praiseEn: 'The moment you rise, the courtroom is yours',
        bizZh: '每一次开庭，都带着一百分的准备进场', bizEn: 'Never walks into court with less than full preparation',
        pitchZh: '质证思路让 AI 陪你推演，开庭前多睡两个小时', pitchEn: 'Rehearse your cross-examination with AI and sleep two more hours',
        rarity: 5, dims: [80, 90, 95],
    },
    {
        id: 'mishu', pool: 'pro',
        nameZh: '秘书型合伙人', nameEn: 'Do-It-All Partner',
        toilZh: '名片印着 Partner，日程排得像行政', toilEn: 'The card says Partner, the calendar says admin',
        praiseZh: '但全所没你，真的转不动', praiseEn: 'Yet without you the whole firm grinds to a halt',
        bizZh: '合伙人的判断力，事务主任的执行力', bizEn: 'A partner’s judgment with an operator’s execution',
        pitchZh: '全所转不动的事，分一半给 AI 工作台', pitchEn: 'Split the load that keeps the firm turning with an AI workbench',
        rarity: 3, dims: [88, 92, 80],
    },
    {
        id: 'kaogu', pool: 'pro',
        nameZh: '卷宗考古学家', nameEn: 'Case-File Archaeologist',
        toilZh: '十万页案卷里熬红了眼', toilEn: 'Red-eyed after a hundred thousand pages',
        praiseZh: '关键证据永远逃不过你的放大镜', praiseEn: 'No key evidence ever escapes your magnifier',
        bizZh: '十万页案卷里，也能挖出决定性的那一页', bizEn: 'Finds the decisive page in a hundred thousand',
        pitchZh: '十万页案卷让 AI 先挖一遍，放大镜只留给关键证据', pitchEn: 'Let AI dig the hundred thousand pages; save your magnifier for what matters',
        rarity: 6, dims: [85, 80, 93],
    },
    {
        id: 'shejiaohua', pool: 'pro',
        nameZh: '案源社交花', nameEn: 'Rainmaker',
        toilZh: '饭局比开庭还密，胃和肝都在加班', toilEn: 'More dinners than hearings — your liver bills overtime',
        praiseZh: '你的人脉图谱，堪比股权穿透图', praiseEn: 'Your network chart rivals an ownership-structure map',
        bizZh: '人脉即资源，资源即解决方案', bizEn: 'Connections become resources; resources become solutions',
        pitchZh: '饭局照跑，文书让 AI 值夜班', pitchEn: 'Keep the dinners — AI covers the night shift on paperwork',
        rarity: 5, dims: [75, 85, 90],
    },
    {
        id: 'caifeng', pool: 'pro',
        nameZh: '合同裁缝', nameEn: 'Contract Tailor',
        toilZh: '甲方第八版需求，你连夜缝好', toilEn: 'Version eight of the client’s asks, stitched overnight',
        praiseZh: '一份模板在你手里能开出千般花样', praiseEn: 'One template blooms a thousand ways in your hands',
        bizZh: '再复杂的交易结构，也能落成严丝合缝的条款', bizEn: 'The most complex structures, drafted watertight',
        pitchZh: '改模板这种事，AI 比你更愿意熬夜', pitchEn: 'Template surgery is the overtime AI actually enjoys',
        rarity: 8, dims: [82, 84, 86],
    },
    {
        id: 'tiaojie', pool: 'pro',
        nameZh: '调解大师', nameEn: 'Master Mediator',
        toilZh: '两头受气是你的日常', toilEn: 'Caught in the crossfire daily',
        praiseZh: '让原被告握手言和，堪称东方魔法', praiseEn: 'Making both sides shake hands — pure eastern magic',
        bizZh: '把对抗谈成共识，是另一种胜利', bizEn: 'Turning conflict into consensus is a win of its own',
        pitchZh: '方案与台账交给 AI，你专心施展东方魔法', pitchEn: 'Hand the drafts and ledgers to AI; keep the magic to yourself',
        rarity: 5, dims: [70, 96, 84],
    },
    {
        id: 'kuajing', pool: 'pro',
        nameZh: '跨境操盘手', nameEn: 'Cross-Border Player',
        toilZh: '三个时区的会，一个人的深夜', toilEn: 'Calls across three time zones, midnights all your own',
        praiseZh: '红筹 VIE 张口就来，时差表比日历还熟', praiseEn: 'Red-chip and VIE off the top of your head',
        bizZh: '跨越时区与法域，交易节奏从不掉线', bizEn: 'Across time zones and jurisdictions, never off tempo',
        pitchZh: '三个时区的会照开，纪要和翻译 AI 全包', pitchEn: 'Keep the calls across time zones — minutes and translation are on AI',
        rarity: 3, dims: [90, 80, 88],
    },
    {
        id: 'xunshou', pool: 'pro',
        nameZh: 'AI 驯兽师', nameEn: 'AI Whisperer',
        toilZh: '同行还在问「这靠谱吗」，你已经交稿了', toilEn: 'Peers still ask “can we trust it?” — you already filed',
        praiseZh: '第一批把 AI 用明白的法律人，就是你', praiseEn: 'Among the first lawyers to truly master AI',
        bizZh: 'AI 时代的工作方式，已经先用起来了', bizEn: 'Already working the way the AI era demands',
        pitchZh: '你已经是第一批了，来看看更顺手的法律 AI 装备', pitchEn: 'You are already an early adopter — see sharper legal AI gear',
        rarity: 4, dims: [78, 82, 96],
    },
    {
        id: 'shoumen', pool: 'pro',
        nameZh: '风控守门员', nameEn: 'Risk Goalkeeper',
        toilZh: '全公司最会说「不行」的人是你', toilEn: 'The company’s most fluent speaker of “no”',
        praiseZh: '最后帮所有人兜住的，也是你', praiseEn: 'And the one who catches everyone in the end',
        bizZh: '说「不行」之前，已备好三条可行路径', bizEn: 'Before saying no, three workable paths are ready',
        pitchZh: '说「不行」之前，让 AI 把三条替代路径先拟好', pitchEn: 'Before you say no, have AI draft the three alternatives',
        rarity: 6, dims: [80, 94, 88],
    },
    {
        id: 'beiguo', pool: 'pro',
        nameZh: '背锅位大心脏', nameEn: 'Iron-Hearted Fixer',
        toilZh: '法务的宿命是背锅', toilEn: 'In-house counsel’s fate: taking the blame',
        praiseZh: '你的本事是锅背完，事也办成了', praiseEn: 'Your gift: the blame lands, and the job still gets done',
        bizZh: '责任扛得住，结果拿得出', bizEn: 'Carries the responsibility, delivers the result',
        pitchZh: '锅可以背，活让 AI 多分担一点', pitchEn: 'Take the blame if you must — let AI take more of the work',
        rarity: 7, dims: [84, 95, 80],
    },
    {
        id: 'huozidian', pool: 'pro',
        nameZh: '条文活字典', nameEn: 'Walking Statute Book',
        toilZh: '别人查法条，你背法条', toilEn: 'Others look statutes up; you recite them',
        praiseZh: '司法解释更新得比新闻推送还快', praiseEn: 'You track new interpretations faster than the news feed',
        bizZh: '法条与最新司法解释，永远在指尖', bizEn: 'Statutes and the latest interpretations, always at hand',
        pitchZh: '你负责背法条，检索和引用让 AI 对齐', pitchEn: 'You recite the statutes; AI lines up the research and citations',
        rarity: 5, dims: [86, 80, 94],
    },
    {
        id: 'dingzihu', pool: 'student',
        nameZh: '法考钉子户', nameEn: 'Bar-Exam Diehard',
        toilZh: '和「天下第一考」考出了感情', toilEn: 'On intimate terms with the “toughest exam under heaven”',
        praiseZh: '但你比谁都懂坚持的含金量', praiseEn: 'No one knows the worth of persistence better than you',
        pitchZh: '备考间隙，先看看执业后的 AI 工作台长什么样', pitchEn: 'Between mock exams, preview the workbench waiting past the bar',
        rarity: 9, dims: [88, 86, 78],
    },
    {
        id: 'zhangsan', pool: 'student',
        nameZh: '张三观察员', nameEn: 'Zhang San Watcher',
        toilZh: '刑法案例库快被你刷穿了', toilEn: 'You’ve nearly worn out the criminal-case archive',
        praiseZh: '聊起案例眼睛会发光的十级学者', praiseEn: 'A top-tier scholar whose eyes light up over case law',
        pitchZh: '案例检索让 AI 打下手，眼睛留着发光', pitchEn: 'Let AI fetch the cases; save your eyes for lighting up',
        rarity: 8, dims: [72, 80, 92],
    },
    {
        id: 'yubeiyi', pool: 'student',
        nameZh: '公检法预备役', nameEn: 'Public-Service Hopeful',
        toilZh: '行测申论法考三线作战', toilEn: 'Fighting the civil-service and bar exams on three fronts',
        praiseZh: '上岸的意志，比谁都坚定', praiseEn: 'Nobody’s resolve to make it runs deeper',
        pitchZh: '上岸之前，先把 AI 办公这门手艺练上', pitchEn: 'Master AI-powered work before you make the shore',
        rarity: 6, dims: [90, 88, 76],
    },
    {
        id: 'minjian', pool: 'egg',
        nameZh: '民间法律顾问', nameEn: 'Sidewalk Counsel',
        toilZh: '没有执业证，胜似执业', toilEn: 'No license, yet always on duty',
        praiseZh: '朋友圈大小纠纷，都指望你评理', praiseEn: 'Every dispute among friends comes to your bench',
        pitchZh: '下次朋友来咨询，你可以掏出真家伙', pitchEn: 'Next time friends come for counsel, bring real firepower',
        rarity: 2, dims: [65, 85, 88],
    },
] as const;

export const QUIZ_TYPE_MAP: Record<string, QuizType> = Object.fromEntries(QUIZ_TYPES.map(t => [t.id, t]));

export interface QuizOption {
    zh: string;
    en: string;
    /** 计分权重：typeId -> 分值（跨分支的权重会被池过滤自然忽略） */
    w: Record<string, number>;
    /** 仅第 1 题：该选项落定的身份池 */
    pool?: QuizPool;
}

export interface QuizQuestion {
    zh: string;
    en: string;
    options: QuizOption[];
}

export const QUIZ_QUESTIONS: readonly QuizQuestion[] = [
    {
        zh: '当年法考考了多少分？',
        en: 'How did you score on the bar exam back then?',
        options: [
            { zh: '刚过线，惊险上岸', en: 'Scraped past the line', pool: 'pro', w: { caifeng: 1, beiguo: 1 } },
            { zh: '高分飘过，不好意思说', en: 'Aced it — too modest to say', pool: 'pro', w: { huozidian: 2, juanwang: 1 } },
            { zh: '不记得了，年头太久', en: 'Can’t recall — it was ages ago', pool: 'pro', w: { tiaojie: 2, shejiaohua: 1, mishu: 1 } },
            { zh: '还没考 / 正在备考', en: 'Not yet — still preparing', pool: 'student', w: { dingzihu: 1 } },
            { zh: '法考是什么？', en: 'What bar exam?', pool: 'egg', w: {} },
        ],
    },
    {
        zh: '周五晚上十点，合伙人 / 领导发来「在吗」。你的第一反应？',
        en: 'Friday, 10 p.m. The partner texts “you there?” Your first move?',
        options: [
            { zh: '秒回「在的您说」，同时打开电脑', en: 'Instant “yes, go ahead” — laptop already open', w: { juanwang: 2, yexingxia: 1, kuajing: 1, yubeiyi: 1 } },
            { zh: '先截图发小群骂两句，再礼貌回复', en: 'Screenshot to the group chat first, then reply politely', w: { beiguo: 2, dingzihu: 1, caifeng: 1 } },
            { zh: '装没看见——反正周一交也是改', en: 'Pretend not to see it — Monday’s draft gets marked up anyway', w: { zhangsan: 2, shejiaohua: 1, kuajing: 1 } },
        ],
    },
    {
        zh: '委托人问「这官司包赢吗」，你内心的 OS 是？',
        en: 'The client asks, “Is this case a guaranteed win?” Your inner voice says:',
        options: [
            { zh: '说「包赢」的都是骗子，我只能包尽力', en: '“Guaranteed win” is a scammer’s phrase; I guarantee effort', w: { tingbian: 1, kaogu: 1, shoumen: 1, dingzihu: 1 } },
            { zh: '先把《律师执业管理办法》甩过去', en: 'Cite the professional-conduct rules, chapter and verse', w: { huozidian: 2, yubeiyi: 1, shoumen: 1 } },
            { zh: '赢不赢再说，费用和发票先聊清楚', en: 'Win or lose later — fees and invoicing first', w: { shejiaohua: 1, mishu: 1, caifeng: 1, kuajing: 1 } },
        ],
    },
    {
        zh: 'AI 帮你写了份初稿，你会？',
        en: 'AI drafts a document for you. You:',
        options: [
            { zh: '逐句重写——AI 懂什么保密义务', en: 'Rewrite line by line — what does AI know about privilege', w: { kaogu: 2, huozidian: 1, yubeiyi: 1 } },
            { zh: '改改措辞直接用，效率就是正义', en: 'Polish the wording and ship it — efficiency is justice', w: { xunshou: 2, yexingxia: 1, kuajing: 1, zhangsan: 1 } },
            { zh: '让它再出三版，对着挑', en: 'Ask for three more versions and cherry-pick', w: { xunshou: 1, juanwang: 1, shoumen: 1, dingzihu: 1 } },
        ],
    },
    {
        zh: '你的案卷 / 文件夹是什么状态？',
        en: 'What state are your case files in?',
        options: [
            { zh: '三级编号强迫症，颜色标签齐全', en: 'Three-level numbering, color tabs, the works', w: { kaogu: 2, yexingxia: 1, shoumen: 1, yubeiyi: 1 } },
            { zh: '表面乱，但要什么三秒找到', en: 'Looks chaotic, but anything surfaces in three seconds', w: { mishu: 2, tiaojie: 1, zhangsan: 1, beiguo: 1 } },
            { zh: '搜索框就是我的归档系统', en: 'The search box is my filing system', w: { xunshou: 2, shejiaohua: 1, kuajing: 1 } },
        ],
    },
    {
        zh: '饭局上有人得知你是学法的，让你「帮忙看个合同」：',
        en: 'At dinner, someone learns you studied law and asks you to “glance at a contract”:',
        options: [
            { zh: '当场掏出手机划重点，职业病没救了', en: 'Phone out, clauses highlighted on the spot — occupational hazard', w: { caifeng: 2, huozidian: 1, dingzihu: 1 } },
            { zh: '笑着递名片：「来所里聊，给你打折」', en: 'Smile and hand over a card: “Come by the office, friend rate”', w: { shejiaohua: 2, mishu: 1, tiaojie: 1 } },
            { zh: '「我是学刑法的，合同不归我管」', en: '“I do criminal law — contracts aren’t my department”', w: { zhangsan: 2, tingbian: 1, yubeiyi: 1 } },
        ],
    },
    {
        zh: '半夜两点你还醒着，最可能是因为：',
        en: 'It’s 2 a.m. and you’re still up. Most likely because:',
        options: [
            { zh: '明天交割 / 交标书，文件还在改', en: 'Closing or bid due tomorrow; documents still moving', w: { yexingxia: 2, juanwang: 1, kuajing: 1, dingzihu: 1 } },
            { zh: '过一遍明天开庭的质证思路，越想越精神', en: 'Running tomorrow’s cross-examination — wide awake now', w: { tingbian: 2, kaogu: 1, yubeiyi: 1 } },
            { zh: '刷到一个离谱判例，转发给了所有同行', en: 'Found an absurd ruling and forwarded it to every colleague', w: { zhangsan: 2, huozidian: 1, xunshou: 1 } },
        ],
    },
    {
        zh: '公司 / 团队要上一个明显有风险的方案，你：',
        en: 'The team wants to push a plainly risky plan. You:',
        options: [
            { zh: '书面说「不行」，并附三条替代路径', en: 'Put “no” in writing — with three alternatives attached', w: { shoumen: 2, huozidian: 1, mishu: 1 } },
            { zh: '先说「可以」，回头默默把坑一个个填掉', en: 'Say “fine”, then quietly fill in every pothole', w: { beiguo: 2, mishu: 1, tiaojie: 1 } },
            { zh: '拉个会，让所有人当面把话说开', en: 'Call a meeting and get it all on the table', w: { tiaojie: 2, shejiaohua: 1, beiguo: 1 } },
        ],
    },
    {
        zh: '如果明天可以不当法律人，你想：',
        en: 'If you could quit law tomorrow, you would:',
        options: [
            { zh: '不行，这行虐我千百遍，我待它如初恋', en: 'Never — this trade wrongs me daily and I love it still', w: { dingzihu: 2, tingbian: 1, juanwang: 1 } },
            { zh: '去教书 / 做博主，把见过的离谱事讲给人听', en: 'Teach or start a channel — the world needs these stories', w: { zhangsan: 2, tiaojie: 1, xunshou: 1 } },
            { zh: '想都不敢想，明天还有三个 deadline', en: 'Can’t even imagine it — three deadlines due tomorrow', w: { yexingxia: 1, juanwang: 1, beiguo: 1, kaogu: 1, kuajing: 1 } },
        ],
    },
] as const;

export interface QuizResultData {
    typeId: string;
    /** 卷度 / 抗压 / 锋利，55–99 */
    dims: [number, number, number];
}

function clampDim(n: number): number {
    return Math.max(55, Math.min(99, Math.round(n)));
}

/**
 * 计分：按第 1 题落池，池内权重求和取最高（同分按类型表顺序稳定裁决）；
 * 三维 = 类型基准 ± 由答案序列决定的确定性微扰（同样的答案永远同样的分，
 * 结果图 URL 可复现）。
 */
export function computeQuizResult(answers: number[]): QuizResultData {
    const pool: QuizPool = QUIZ_QUESTIONS[0].options[answers[0]]?.pool ?? 'pro';
    const egg = QUIZ_TYPES.find(t => t.pool === 'egg')!;
    const scores = new Map<string, number>();
    answers.forEach((choice, i) => {
        const opt = QUIZ_QUESTIONS[i]?.options[choice];
        if (!opt) return;
        for (const [id, n] of Object.entries(opt.w)) {
            scores.set(id, (scores.get(id) ?? 0) + n);
        }
    });

    let winner = egg;
    if (pool !== 'egg') {
        const candidates = QUIZ_TYPES.filter(t => t.pool === pool);
        winner = candidates.reduce((best, t) =>
            (scores.get(t.id) ?? 0) > (scores.get(best.id) ?? 0) ? t : best, candidates[0]);
    }

    const seed = answers.reduce((s, a, i) => s + (a + 1) * (i + 3), 0);
    const dims = winner.dims.map((base, k) => clampDim(base + ((seed * (k + 7)) % 7) - 3)) as [number, number, number];
    return { typeId: winner.id, dims };
}

/** 昵称清洗：结果图上要放的用户输入，唯一入口 */
export function sanitizeNickname(raw: string): string {
    // eslint-disable-next-line no-control-regex
    return raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 12);
}
