import { toBaseLocale, type Locale } from '@/i18n-config';

interface Question {
    id: string;
    q: string;
    a: string;
    href?: string;
    linkLabel?: string;
}
interface FaqContent {
    eyebrow: string;
    title: string;
    subtitle: string;
    navigation: string;
    pricingTitle: string;
    pricingTableTitle: string;
    privacy: string;
    start: string;
    deploymentEyebrow: string;
    deploymentTitle: string;
    deploymentBody: string;
    deploymentPlanCta: string;
    deploymentCta: string;
    deploymentSubject: string;
    sections: { id: string; title: string; items: Question[] }[];
}

// Evidence and reviewed source revisions: doc/community-faq-evidence.md.
// 口径：先说我们做了什么、你的资料在哪，再用一句话讲清边界；不写代码术语，不堆免责。
const zh: FaqContent = {
    eyebrow: '社区版 · 常见问题',
    title: '你的文件，默认只在你自己的电脑上。',
    subtitle: '只有你主动使用联网功能时，这次任务需要的内容才会发出去；连接全程加密，我们不拿你的内容训练模型，也不出售个人信息。',
    navigation: '常见问题分类',
    pricingTitle: '怎么收费？',
    pricingTableTitle: '价格一览',
    privacy: '隐私政策',
    start: '开始使用社区版',
    deploymentEyebrow: '社区版 · 所内部署',
    deploymentTitle: '想让资料完全留在所里？',
    deploymentBody: '社区版可以部署在事务所自己的服务器上，配合本地模型使用。开发者会和你一起确认需要哪些功能、配多少硬件、哪些对外连接要关掉，让资料的存储和处理都留在所内网络。',
    deploymentPlanCta: '配置部署方案与预算',
    deploymentCta: '联系开发者，聊聊所内部署',
    deploymentSubject: '社区版所内部署咨询',
    sections: [
        { id: 'storage', title: '资料存在哪里', items: [
            { id: 'local-storage', q: '我的案件文件和聊天记录存在哪里？', a: '在你自己的电脑上。桌面端把项目文件、聊天记录和运行日志都保存在本机，也可以直接把电脑里现有的文件夹当作项目。这些文件不会存到我们的服务器上。\n\n导入文件也不会自动上传。只有当你让 AI 处理某份材料时，完成这次任务所需的内容才会发给模型；导入后自动打 AI 标签的功能默认是关着的。' },
            { id: 'mobile-relay', q: '手机拍的材料怎么传到电脑？云端会留多久？', a: '在 iPhone 上拍的原件保存在 App 里，不会进入 iCloud 等系统备份。通过云端传到电脑时，文件只在中转服务器上临时放一下：电脑一确认收到，云端那份就会删除，只留一条不含文件内容的「已送达」记录。\n\n如果文件一直没被取走，或者删除时出了意外，系统每天会自动清理，放了 30 天的会被清掉。手机上的原件和电脑收到的文件由你自己保管，删掉其中一份不影响另一份。' },
            { id: 'file-transfer', q: '在电脑和手机之间传普通文件，也是这样清理吗？', a: '道理一样，期限不同：电脑发给手机的文件在云端暂存 7 天，手机传给电脑的暂存 30 天，到期自动清理。中转只管把文件送过去，不负责备份，重要文件记得在收到的设备上存好。' },
            { id: 'cloud-features', q: '用 Office 插件、官网和同步功能时，数据也只在本机吗？', a: '要看连的是哪里。Office 插件连的是你电脑上的桌面端时，数据留在本机；连的是云端服务时，聊天记录和同步数据会保存在服务器上。官网上的 Skill 帮写对话也会保存在服务器上。\n\n团队和律所的共享记忆要让成员共用，所以存在服务器上；你自己配置了 Git 等远程同步的，记忆也会同步到你指定的仓库。账号、订单和用量记录存在服务器上，用于结算。' },
            { id: 'backup', q: '换电脑、卸载软件或注销账号前，要备份什么？', a: '资料在你自己电脑上，备份也由你掌握：迁移或卸载前，先把项目文件、聊天数据和个人／项目记忆复制一份。只在新电脑上重新登录，旧电脑上的内容不会自动回来。\n\n删除本机文件、云端共享内容、网站账号和外部同步副本是各自独立的操作。手机中转不能当备份用。给我们发诊断日志前，也请先看一眼里面有没有案件内容。' },
        ] },
        { id: 'memory', title: '模型训练与 AI 记忆', items: [
            { id: 'training', q: '会拿我的案件材料训练模型吗？', a: '不会。AI WorkDeck 调用的是现成的大模型，我们不会拿你的材料训练模型。所谓「记忆」，只是把你的偏好、案件事实和工作经验整理成一份能查看、能修改的文字笔记，下次干活时交给模型参考，模型本身不会因此改变。\n\n国内版平台模型请求经 AI WorkDeck 服务器转发至阿里云百炼；国际版使用 OpenRouter。模型服务商按各自的隐私政策处理请求，具体处理地域以所选模型的服务说明为准。对保密要求特别高的材料，可以改用本地模型，或者考虑所内部署。', href: '/zh/privacy', linkLabel: '查看隐私政策与模型服务说明' },
            { id: 'memory-location', q: '记忆存在哪里？个人、项目、团队的记忆有什么不同？', a: '个人记忆和项目记忆存在你电脑上的本地数据库里，随时可以查看、修改和删除；开启 Git 同步后，也会同步到你自己配置的仓库。\n\n团队记忆和律所记忆是给大家共用的，所以存在官网服务器上，只有对应组织的成员能读。团队记忆由团队管理员管理，律所记忆只有总部团队的管理者能写入。往共享记忆里写东西之前，想一想是否适合让这个范围里的每个人看到。' },
            { id: 'memory-review', q: '模型记错了我的习惯，或者把某个案子的做法当成了通用规则，怎么办？', a: '找到那条记忆，改掉或删掉就行。只适用于某一个案子的内容放在项目记忆里，不要写进团队或律所记忆。记忆只是给模型的参考，模型仍可能理解偏差，重要的事实和规则用之前核对一下。' },
        ] },
        { id: 'security', title: 'AI 调用与数据安全', items: [
            { id: 'self-hosting', q: '事务所能用自己的服务器和模型，让资料完全不出所吗？', a: '可以。社区版支持部署在事务所自己的服务器上，接入本地模型，存储和处理都在所内完成。\n\n要做到真正不出所，除了把模型换成本地的，还要把其他会联网的功能一并关掉或换成所内服务，比如云端文字识别、语音转写、联网搜索、手机云端中转、官网共享记忆和远程同步。不同本地模型在工具调用、看图等能力上有差别，需要逐项测试，不一定和默认的云端版本完全一样。\n\n有这个需要的话，欢迎联系开发者，说说规模、打算用的模型、要保留的功能和网络要求，我们一起把方案定下来。' },
            { id: 'model-context', q: '调用 AI 时，哪些内容会离开我的电脑？', a: '只有完成这次任务需要的内容：你的提问、相关的对话、你提供或 AI 为这项任务读取的文件内容，以及用到的记忆。不会默认把整个项目发出去。\n\n使用国内版平台 AI 时，请求经我们的服务器转发至阿里云百炼，服务器处理本次请求内容并记录模型、用量和费用，不把对话正文写入计费记录。国际版平台 AI 使用 OpenRouter。自配供应商和本地模型按你的设置调用。其他插件和在线工具按各自的设置工作。' },
            { id: 'retention', q: '除了我的电脑，对话还会保存在别的地方吗？', a: '桌面端的对话和日志只保存在你自己的电脑上，不会存到我们的服务器。会在服务器上保存内容的，只有你主动使用的几项云端功能：云端 Office 插件、官网 Skill 帮写、团队共享记忆和手机中转，前面各条已分别说明。\n\n模型服务商是否保留请求，取决于阿里云百炼、OpenRouter 及所选模型服务的政策；使用百炼并不意味着所有模型都承诺同一处理地域或零数据留存。', href: '/zh/privacy', linkLabel: '查看隐私政策与模型服务说明' },
            { id: 'confidentiality', q: '处理保密案件时，怎么判断能不能用 AI？', a: '先分清两件事：在本机整理文件，文件内容不会发出去；让 AI 处理或使用联网工具时，相关内容会发给对应的服务。所以动手前想清楚这次会发出什么、发给谁。\n\n常见的做法是只提供完成任务所需的片段，先去掉姓名、证件号码等用不上的信息。如果客户或所里明确要求材料不得外发，就不要交给云端模型，可以改用本地模型或所内部署。' },
            { id: 'team-access', q: '加入团队后，同事能看到我的所有案件吗？', a: '不能。加入团队不会共享你电脑上的项目和文件。同事能看到的，只有你写进团队或律所共享记忆的内容，以及团队看板上按角色和设置显示的用量信息；项目名称是否显示也可以单独设置。\n\n邀请成员、分配管理权限时按需就好；某个客户的保密细节，不要写进全团队都能看到的共享记忆。' },
        ] },
        { id: 'practice', title: '律师日常使用', items: [
            { id: 'citations', q: 'AI 给出的法条、判例和引文，可以直接用吗？', a: '不建议直接用。请回到原始来源核对：法域、发布时间和是否有效、条文版本、案号、审理法院，以及引文是否真的支持结论。模型可能编出不存在的来源，也可能把真实的来源用错。\n\nAI 的输出适合当研究素材和初稿，事实认定、法律适用和最终交付，还是要由办案律师把关。' },
            { id: 'documents', q: '识别扫描件、总结长文、改合同时，要重点核对什么？', a: '逐项核对姓名、金额、日期、否定词、条款编号、附件和跨页表格。识别和总结可能漏掉细节，模型看到的也未必是文件全文。\n\n保留原件，对比修改前后的差异；涉及权利义务的改动、引文和结论要人工确认，不要用摘要代替原始证据。' },
            { id: 'tools', q: '用 Skill、插件和联网工具前，要注意什么？', a: '先弄清它会读哪些文件、连哪些服务、能做哪些操作。第三方工具按它自己的规则处理数据；文件或网页里也可能藏着误导模型的指令。\n\n只给可信的工具必要的权限，重要的写入、删除或对外提交，执行前后都看一眼。排查问题时，不要把客户材料、密钥或密码发到公开社区。' },
            { id: 'regions', q: '国内站、国际站和美国站的账号与数据互通吗？', a: '国内站 aiworkdeck.com 和境外站点是两套独立的系统，账号和在线数据不互通。workdeck.ai 和 aiworkdeck.us 属于同一个境外体系，数据互通。\n\n桌面端要连接你注册和充值的那个站点。切换网站语言不会迁移账号、余额或本机项目。', href: '/zh/start', linkLabel: '查看安装与区域选择' },
        ] },
    ],
};

const en: FaqContent = {
    eyebrow: 'COMMUNITY EDITION · FAQ',
    title: 'Your files stay on your own computer.',
    subtitle: 'Content leaves it only when you choose to use an online feature, and only what that task needs. Connections are encrypted, we never train models on your content, and we never sell personal data.',
    navigation: 'FAQ topics',
    pricingTitle: 'How does pricing work?',
    pricingTableTitle: 'Prices at a glance',
    privacy: 'Privacy policy',
    start: 'Get started with Community Edition',
    deploymentEyebrow: 'COMMUNITY EDITION · SELF-HOSTING',
    deploymentTitle: 'Want your files to never leave the firm?',
    deploymentBody: 'Community Edition can run on your firm’s own server with a local model. We’ll work through the features you need, the hardware to plan for and which outside connections to switch off, so storage and processing stay on your own network.',
    deploymentPlanCta: 'Plan deployment & budget',
    deploymentCta: 'Talk to us about self-hosting',
    deploymentSubject: 'Community Edition self-hosting enquiry',
    sections: [
        { id: 'storage', title: 'Where your files live', items: [
            { id: 'local-storage', q: 'Where are my case files and conversations stored?', a: 'On your own computer. The desktop app keeps project files, conversations and logs locally, and you can use existing folders on your computer as projects. None of this is stored on our servers.\n\nImporting a file doesn’t upload it anywhere. Content is only sent to a model when you ask the AI to work on something, and only what that task needs. Automatic AI tagging on import is off by default.' },
            { id: 'mobile-relay', q: 'How do photos from my phone reach my computer, and how long does the cloud keep them?', a: 'On iPhone, the originals stay inside the app and are left out of iCloud and other system backups. When you send them to your computer through the cloud, the relay server only holds them briefly: as soon as your computer confirms receipt, the cloud copy is deleted. All that remains is a delivery record with no file content.\n\nIf a file is never collected, or a deletion hits a snag, a daily cleanup removes anything that has been there for 30 days. The original on your phone and the copy on your computer are yours to manage; deleting one doesn’t affect the other.' },
            { id: 'file-transfer', q: 'Do regular file transfers between phone and computer work the same way?', a: 'Same idea, different time limits: files sent from your computer to your phone wait in the cloud for 7 days, and files sent from your phone to your computer for 30 days, then they are cleaned up automatically. The relay is for delivery, not backup, so save anything important on the receiving device.' },
            { id: 'cloud-features', q: 'Do the Office add-in, website and sync features also keep everything local?', a: 'It depends on what they connect to. When the Office add-in connects to the desktop app on your computer, data stays local; when it connects to a cloud service, conversations and sync data are stored on that server. Conversations with the Skill drafting assistant on the website are stored on our server too.\n\nTeam and firm memory is shared between members, so it lives on our server. If you set up remote sync such as Git, memory is also synced to the repository you choose. Account, order and usage records are kept on our server for billing.' },
            { id: 'backup', q: 'What should I back up before switching computers, uninstalling or closing my account?', a: 'Because your work lives on your computer, you’re in control of the backup. Before moving or uninstalling, copy your project files, conversation data and personal and project memory. Signing in on a new computer won’t bring back what was on the old one.\n\nDeleting local files, shared cloud content, your website account and external sync copies are separate steps. The phone relay isn’t a backup. Please check diagnostic logs for case content before sending them to us.' },
        ] },
        { id: 'memory', title: 'Model training and AI memory', items: [
            { id: 'training', q: 'Will my case material be used to train a model?', a: 'No. AI WorkDeck uses existing AI models, and we never train models on your material. “Memory” is simply a readable, editable note of your preferences, case facts and working experience that is handed to the model as reference next time. The model itself doesn’t change.\n\nChina platform AI requests pass through AI WorkDeck servers to Alibaba Cloud Model Studio (Bailian); international platform AI uses OpenRouter. Each service handles requests under its own privacy policy and model-specific processing-region terms. For highly sensitive material, you can switch to a local model or consider self-hosting.', href: '/en/privacy', linkLabel: 'Privacy and model service information' },
            { id: 'memory-location', q: 'Where is memory stored, and how do personal, project and team memory differ?', a: 'Personal and project memory is kept in a local database on your computer, where you can view, edit or delete it at any time. If you turn on Git sync, it is also synced to the repository you set up.\n\nTeam and firm memory is shared, so it lives on our server and only members of that organization can read it. Team admins manage team memory, and only managers in the head-office team can write to firm memory. Before adding something to shared memory, make sure it’s right for everyone who can see it.' },
            { id: 'memory-review', q: 'What if the model remembers something wrong, or treats one case as a general rule?', a: 'Find that memory and edit or delete it. Keep anything specific to one case in project memory rather than team or firm memory. Memory is only a reference for the model and it can still misread it, so double-check key facts and rules before relying on them.' },
        ] },
        { id: 'security', title: 'AI requests and data security', items: [
            { id: 'self-hosting', q: 'Can our firm use its own server and models so nothing leaves the office?', a: 'Yes. Community Edition can be deployed on your firm’s own server with a local model, so storage and processing happen in-house.\n\nTo keep everything truly in-house, switching to a local model isn’t enough on its own: other online features also need to be turned off or replaced with in-house services, such as cloud OCR, transcription, web search, the phone cloud relay, shared memory on our website and remote sync. Local models also vary in tool use, image understanding and other capabilities, so each needs testing and may not match the default cloud setup exactly.\n\nIf this is what you need, get in touch with your team size, the model you plan to use, the features you want to keep and your network requirements, and we’ll work out the setup together.' },
            { id: 'model-context', q: 'What leaves my computer when I use AI?', a: 'Only what the task needs: your question, the relevant conversation, file content you provide or the AI reads for that task, and any memory it uses. Your whole project isn’t sent by default.\n\nChina platform AI requests pass through our servers to Alibaba Cloud Model Studio. Our servers process the request content and record the model, usage and charge, without writing conversation content into billing records. International platform AI uses OpenRouter. Custom providers and local models follow your settings. Other add-ins and online tools work according to their own settings.' },
            { id: 'retention', q: 'Are my conversations saved anywhere besides my computer?', a: 'Desktop conversations and logs are saved only on your own computer, not on our servers. Content is stored on our servers only for the cloud features you choose to use: the cloud Office add-in, the Skill drafting assistant, shared team memory and the phone relay, each described above.\n\nRequest retention depends on Alibaba Cloud Model Studio, OpenRouter and the selected model service. Using Model Studio does not mean every model has the same processing region or a zero-retention guarantee.', href: '/en/privacy', linkLabel: 'Privacy and model service information' },
            { id: 'confidentiality', q: 'How do I decide whether AI is appropriate for a confidential matter?', a: 'Keep two things apart: organizing files locally doesn’t send their content anywhere, while asking the AI or an online tool to work on something sends the relevant content to that service. Before you start, be clear about what will be sent and where.\n\nA common approach is to share only the excerpts the task needs and remove names, ID numbers and other details you don’t need. If a client or your firm requires that material never leaves, don’t give it to a cloud model; use a local model or a self-hosting setup instead.' },
            { id: 'team-access', q: 'Once I join a team, can colleagues see all my cases?', a: 'No. Joining a team doesn’t share the projects or files on your computer. Colleagues can only see what you add to shared team or firm memory, plus the usage information the team dashboard shows based on roles and settings. Whether project names are shown is a separate setting.\n\nInvite members and grant admin rights only as needed, and keep one client’s confidential details out of memory the whole team can read.' },
        ] },
        { id: 'practice', title: 'Using it in legal work', items: [
            { id: 'citations', q: 'Can I use statutes, cases and quotations from the AI as they are?', a: 'Not without checking. Go back to the original source and confirm the jurisdiction, publication and effective dates, the version, case number, court, and whether the quotation really supports the conclusion. Models can invent sources or misapply real ones.\n\nTreat AI output as research material and first drafts. Findings of fact, legal analysis and the final work product still need the lawyer handling the matter to sign off.' },
            { id: 'documents', q: 'What should I check closely in OCR, long summaries and contract edits?', a: 'Check names, amounts, dates, negations, clause numbers, attachments and tables that span pages. Recognition and summaries can miss details, and the model may not have seen the whole document.\n\nKeep the original and compare versions. Review any change that affects rights or obligations, along with quotations and conclusions, by hand; a summary is no substitute for the underlying evidence.' },
            { id: 'tools', q: 'What should I check before using a Skill, plugin or online tool?', a: 'Find out which files it reads, which services it contacts and what it can do. Third-party tools handle data under their own rules, and documents or web pages can contain hidden instructions that mislead a model.\n\nGive trusted tools only the access they need, and look over important writes, deletions or outside submissions before and after they run. Never post client material, keys or passwords in the public community when asking for help.' },
            { id: 'regions', q: 'Do the mainland, international and US sites share accounts and data?', a: 'The mainland site, aiworkdeck.com, runs separately from the overseas sites; accounts and online data aren’t shared. workdeck.ai and aiworkdeck.us are the same overseas system and share user data.\n\nConnect the desktop app to the site where you registered and topped up. Switching the website language doesn’t move your account, balance or local projects.', href: '/en/start', linkLabel: 'Installation and region selection' },
        ] },
    ],
};

export function communityFaq(lang: Locale): FaqContent {
    return toBaseLocale(lang) === 'zh' ? zh : en;
}
