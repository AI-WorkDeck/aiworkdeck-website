import { toBaseLocale, type Locale } from '@/i18n-config';
import faq_ar from '@/content/faq/ar.json';
import faq_de from '@/content/faq/de.json';
import faq_el from '@/content/faq/el.json';
import faq_es from '@/content/faq/es.json';
import faq_fr from '@/content/faq/fr.json';
import faq_hi from '@/content/faq/hi.json';
import faq_id from '@/content/faq/id.json';
import faq_it from '@/content/faq/it.json';
import faq_ja from '@/content/faq/ja.json';
import faq_ko from '@/content/faq/ko.json';
import faq_ms from '@/content/faq/ms.json';
import faq_nl from '@/content/faq/nl.json';
import faq_pt from '@/content/faq/pt.json';
import faq_ru from '@/content/faq/ru.json';
import faq_th from '@/content/faq/th.json';
import faq_tr from '@/content/faq/tr.json';
import faq_vi from '@/content/faq/vi.json';


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
            { id: 'training', q: '会拿我的案件材料训练模型吗？', a: '不会。AI WorkDeck 调用的是现成的大模型，我们不会拿你的材料训练模型。所谓「记忆」，只是把你的偏好、案件事实和工作经验整理成一份能查看、能修改的文字笔记，下次干活时交给模型参考，模型本身不会因此改变。\n\n国内版平台模型请求经 AI WorkDeck 服务器转发至阿里云百炼；国际版使用 OpenRouter。模型服务商按各自的隐私政策处理请求，具体处理地域以所选模型的服务说明为准。对保密要求特别高的材料，可以改用本地模型，或者考虑所内部署。', href: '/zh/legal/privacy', linkLabel: '查看隐私政策与模型服务说明' },
            { id: 'memory-location', q: '记忆存在哪里？个人、项目、团队的记忆有什么不同？', a: '个人记忆和项目记忆存在你电脑上的本地数据库里，随时可以查看、修改和删除；开启 Git 同步后，也会同步到你自己配置的仓库。\n\n团队记忆和律所记忆是给大家共用的，所以存在官网服务器上，只有对应组织的成员能读。团队记忆由团队管理员管理，律所记忆只有总部团队的管理者能写入。往共享记忆里写东西之前，想一想是否适合让这个范围里的每个人看到。' },
            { id: 'memory-review', q: '模型记错了我的习惯，或者把某个案子的做法当成了通用规则，怎么办？', a: '找到那条记忆，改掉或删掉就行。只适用于某一个案子的内容放在项目记忆里，不要写进团队或律所记忆。记忆只是给模型的参考，模型仍可能理解偏差，重要的事实和规则用之前核对一下。' },
        ] },
        { id: 'security', title: 'AI 调用与数据安全', items: [
            { id: 'self-hosting', q: '事务所能用自己的服务器和模型，让资料完全不出所吗？', a: '可以。社区版支持部署在事务所自己的服务器上，接入本地模型，存储和处理都在所内完成。\n\n要做到真正不出所，除了把模型换成本地的，还要把其他会联网的功能一并关掉或换成所内服务，比如云端文字识别、语音转写、联网搜索、手机云端中转、官网共享记忆和远程同步。不同本地模型在工具调用、看图等能力上有差别，需要逐项测试，不一定和默认的云端版本完全一样。\n\n有这个需要的话，欢迎联系开发者，说说规模、打算用的模型、要保留的功能和网络要求，我们一起把方案定下来。' },
            { id: 'model-context', q: '调用 AI 时，哪些内容会离开我的电脑？', a: '只有完成这次任务需要的内容：你的提问、相关的对话、你提供或 AI 为这项任务读取的文件内容，以及用到的记忆。不会默认把整个项目发出去。\n\n使用国内版平台 AI 时，请求经我们的服务器转发至阿里云百炼，服务器处理本次请求内容并记录模型、用量和费用，不把对话正文写入计费记录。国际版平台 AI 使用 OpenRouter。自配供应商和本地模型按你的设置调用。其他插件和在线工具按各自的设置工作。' },
            { id: 'retention', q: '除了我的电脑，对话还会保存在别的地方吗？', a: '桌面端的对话和日志只保存在你自己的电脑上，不会存到我们的服务器。会在服务器上保存内容的，只有你主动使用的几项云端功能：云端 Office 插件、官网 Skill 帮写、团队共享记忆和手机中转，前面各条已分别说明。\n\n模型服务商是否保留请求，取决于阿里云百炼、OpenRouter 及所选模型服务的政策；使用百炼并不意味着所有模型都承诺同一处理地域或零数据留存。', href: '/zh/legal/privacy', linkLabel: '查看隐私政策与模型服务说明' },
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

// zh-hant: generated from `zh` (OpenCC cn->tw + Taiwan terms, POLISH X33/Q12); edit both together.
const zhHant: FaqContent = {
    eyebrow: '社區版 · 常見問題',
    title: '你的文件，預設只在你自己的電腦上。',
    subtitle: '只有你主動使用聯網功能時，這次任務需要的內容才會發出去；連接全程加密，我們不拿你的內容訓練模型，也不出售個人資料。',
    navigation: '常見問題分類',
    pricingTitle: '怎麼收費？',
    pricingTableTitle: '價格一覽',
    privacy: '隱私權政策',
    start: '開始使用社區版',
    deploymentEyebrow: '社區版 · 所內部署',
    deploymentTitle: '想讓資料完全留在所裡？',
    deploymentBody: '社區版可以部署在事務所自己的伺服器上，配合本地模型使用。開發者會和你一起確認需要哪些功能、配多少硬體、哪些對外連接要關掉，讓資料的儲存和處理都留在所內網路。',
    deploymentPlanCta: '配置部署方案與預算',
    deploymentCta: '聯絡開發者，聊聊所內部署',
    deploymentSubject: '社區版所內部署諮詢',
    sections: [
        { id: 'storage', title: '資料存在哪裡', items: [
            { id: 'local-storage', q: '我的案件文件和聊天記錄存在哪裡？', a: '在你自己的電腦上。桌面端把項目文件、聊天記錄和運行日誌都保存在本機，也可以直接把電腦裡現有的文件夾當作項目。這些文件不會存到我們的伺服器上。\n\n導入文件也不會自動上傳。只有當你讓 AI 處理某份材料時，完成這次任務所需的內容才會發給模型；導入後自動打 AI 標籤的功能預設是關著的。' },
            { id: 'mobile-relay', q: '手機拍的材料怎麼傳到電腦？雲端會留多久？', a: '在 iPhone 上拍的原件保存在 App 裡，不會進入 iCloud 等系統備份。通過雲端傳到電腦時，文件只在中轉伺服器上臨時放一下：電腦一確認收到，雲端那份就會刪除，只留一條不含文件內容的「已送達」記錄。\n\n如果文件一直沒被取走，或者刪除時出了意外，系統每天會自動清理，放了 30 天的會被清掉。手機上的原件和電腦收到的文件由你自己保管，刪掉其中一份不影響另一份。' },
            { id: 'file-transfer', q: '在電腦和手機之間傳普通文件，也是這樣清理嗎？', a: '道理一樣，期限不同：電腦發給手機的文件在雲端暫存 7 天，手機傳給電腦的暫存 30 天，到期自動清理。中轉只管把文件送過去，不負責備份，重要文件記得在收到的設備上存好。' },
            { id: 'cloud-features', q: '用 Office 外掛、官網和同步功能時，資料也只在本機嗎？', a: '要看連的是哪裡。Office 外掛連的是你電腦上的桌面端時，資料留在本機；連的是雲端服務時，聊天記錄和同步資料會保存在伺服器上。官網上的 Skill 幫寫對話也會保存在伺服器上。\n\n團隊和律所的共享記憶要讓成員共用，所以存在伺服器上；你自己配置了 Git 等遠程同步的，記憶也會同步到你指定的倉庫。帳號、訂單和用量記錄存在伺服器上，用於結算。' },
            { id: 'backup', q: '換電腦、卸載軟體或註銷帳號前，要備份什麼？', a: '資料在你自己電腦上，備份也由你掌握：遷移或卸載前，先把項目文件、聊天資料和個人／項目記憶複製一份。只在新電腦上重新登入，舊電腦上的內容不會自動回來。\n\n刪除本機文件、雲端共享內容、網站帳號和外部同步副本是各自獨立的操作。手機中轉不能當備份用。給我們發診斷日誌前，也請先看一眼裡面有沒有案件內容。' },
        ] },
        { id: 'memory', title: '模型訓練與 AI 記憶', items: [
            { id: 'training', q: '會拿我的案件材料訓練模型嗎？', a: '不會。AI WorkDeck 調用的是現成的大模型，我們不會拿你的材料訓練模型。所謂「記憶」，只是把你的偏好、案件事實和工作經驗整理成一份能查看、能修改的文字筆記，下次幹活時交給模型參考，模型本身不會因此改變。\n\n國內版平台模型請求經 AI WorkDeck 伺服器轉發至阿里雲百鍊；國際版使用 OpenRouter。模型服務商按各自的隱私權政策處理請求，具體處理地域以所選模型的服務說明為準。對保密要求特別高的材料，可以改用本地模型，或者考慮所內部署。', href: '/zh-hant/legal/privacy', linkLabel: '查看隱私權政策與模型服務說明' },
            { id: 'memory-location', q: '記憶存在哪裡？個人、項目、團隊的記憶有什麼不同？', a: '個人記憶和項目記憶存在你電腦上的本地資料庫裡，隨時可以查看、修改和刪除；開啟 Git 同步後，也會同步到你自己配置的倉庫。\n\n團隊記憶和律所記憶是給大家共用的，所以存在官網伺服器上，只有對應組織的成員能讀。團隊記憶由團隊管理員管理，律所記憶只有總部團隊的管理者能寫入。往共享記憶裡寫東西之前，想一想是否適合讓這個範圍裡的每個人看到。' },
            { id: 'memory-review', q: '模型記錯了我的習慣，或者把某個案子的做法當成了通用規則，怎麼辦？', a: '找到那條記憶，改掉或刪掉就行。只適用於某一個案子的內容放在項目記憶裡，不要寫進團隊或律所記憶。記憶只是給模型的參考，模型仍可能理解偏差，重要的事實和規則用之前核對一下。' },
        ] },
        { id: 'security', title: 'AI 調用與資料安全', items: [
            { id: 'self-hosting', q: '事務所能用自己的伺服器和模型，讓資料完全不出所嗎？', a: '可以。社區版支持部署在事務所自己的伺服器上，接入本地模型，儲存和處理都在所內完成。\n\n要做到真正不出所，除了把模型換成本地的，還要把其他會聯網的功能一併關掉或換成所內服務，比如雲端文字識別、語音轉寫、聯網搜索、手機雲端中轉、官網共享記憶和遠程同步。不同本地模型在工具調用、看圖等能力上有差別，需要逐項測試，不一定和預設的雲端版本完全一樣。\n\n有這個需要的話，歡迎聯絡開發者，說說規模、打算用的模型、要保留的功能和網路要求，我們一起把方案定下來。' },
            { id: 'model-context', q: '調用 AI 時，哪些內容會離開我的電腦？', a: '只有完成這次任務需要的內容：你的提問、相關的對話、你提供或 AI 為這項任務讀取的文件內容，以及用到的記憶。不會預設把整個項目發出去。\n\n使用國內版平台 AI 時，請求經我們的伺服器轉發至阿里雲百鍊，伺服器處理本次請求內容並記錄模型、用量和費用，不把對話正文寫入計費記錄。國際版平台 AI 使用 OpenRouter。自配供應商和本地模型按你的設定調用。其他外掛和在線工具按各自的設定工作。' },
            { id: 'retention', q: '除了我的電腦，對話還會保存在別的地方嗎？', a: '桌面端的對話和日誌只保存在你自己的電腦上，不會存到我們的伺服器。會在伺服器上保存內容的，只有你主動使用的幾項雲端功能：雲端 Office 外掛、官網 Skill 幫寫、團隊共享記憶和手機中轉，前面各條已分別說明。\n\n模型服務商是否保留請求，取決於阿里雲百鍊、OpenRouter 及所選模型服務的政策；使用百鍊並不意味著所有模型都承諾同一處理地域或零資料留存。', href: '/zh-hant/legal/privacy', linkLabel: '查看隱私權政策與模型服務說明' },
            { id: 'confidentiality', q: '處理保密案件時，怎麼判斷能不能用 AI？', a: '先分清兩件事：在本機整理文件，文件內容不會發出去；讓 AI 處理或使用聯網工具時，相關內容會發給對應的服務。所以動手前想清楚這次會發出什麼、發給誰。\n\n常見的做法是隻提供完成任務所需的片段，先去掉姓名、證件號碼等用不上的資訊。如果客戶或所裡明確要求材料不得外發，就不要交給雲端模型，可以改用本地模型或所內部署。' },
            { id: 'team-access', q: '加入團隊後，同事能看到我的所有案件嗎？', a: '不能。加入團隊不會共享你電腦上的項目和文件。同事能看到的，只有你寫進團隊或律所共享記憶的內容，以及團隊看板上按角色和設定顯示的用量資訊；項目名稱是否顯示也可以單獨設定。\n\n邀請成員、分配管理權限時按需就好；某個客戶的保密細節，不要寫進全團隊都能看到的共享記憶。' },
        ] },
        { id: 'practice', title: '律師日常使用', items: [
            { id: 'citations', q: 'AI 給出的法條、判例和引文，可以直接用嗎？', a: '不建議直接用。請回到原始來源核對：法域、發佈時間和是否有效、條文版本、案號、審理法院，以及引文是否真的支持結論。模型可能編出不存在的來源，也可能把真實的來源用錯。\n\nAI 的輸出適合當研究素材和初稿，事實認定、法律適用和最終交付，還是要由辦案律師把關。' },
            { id: 'documents', q: '識別掃描件、總結長文、改合同時，要重點核對什麼？', a: '逐項核對姓名、金額、日期、否定詞、條款編號、附件和跨頁表格。識別和總結可能漏掉細節，模型看到的也未必是文件全文。\n\n保留原件，對比修改前後的差異；涉及權利義務的改動、引文和結論要人工確認，不要用摘要代替原始證據。' },
            { id: 'tools', q: '用 Skill、外掛和聯網工具前，要注意什麼？', a: '先弄清它會讀哪些文件、連哪些服務、能做哪些操作。第三方工具按它自己的規則處理資料；文件或網頁裡也可能藏著誤導模型的指令。\n\n只給可信的工具必要的權限，重要的寫入、刪除或對外提交，執行前後都看一眼。排查問題時，不要把客戶材料、密鑰或密碼發到公開社區。' },
            { id: 'regions', q: '國內站、國際站和美國站的帳號與資料互通嗎？', a: '國內站 aiworkdeck.com 和境外站點是兩套獨立的系統，帳號和在線資料不互通。workdeck.ai 和 aiworkdeck.us 屬於同一個境外體系，資料互通。\n\n桌面端要連接你註冊和充值的那個站點。切換網站語言不會遷移帳號、餘額或本機項目。', href: '/zh-hant/start', linkLabel: '查看安裝與區域選擇' },
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
            { id: 'training', q: 'Will my case material be used to train a model?', a: 'No. AI WorkDeck uses existing AI models, and we never train models on your material. “Memory” is simply a readable, editable note of your preferences, case facts and working experience that is handed to the model as reference next time. The model itself doesn’t change.\n\nOn the mainland China site, platform AI requests pass through AI WorkDeck servers to Alibaba Cloud Model Studio (Bailian); on the international sites, platform AI uses OpenRouter. Each service handles requests under its own privacy policy and model-specific processing-region terms. For highly sensitive material, you can switch to a local model or consider self-hosting.', href: '/en/legal/privacy', linkLabel: 'Privacy and model service information' },
            { id: 'memory-location', q: 'Where is memory stored, and how do personal, project and team memory differ?', a: 'Personal and project memory is kept in a local database on your computer, where you can view, edit or delete it at any time. If you turn on Git sync, it is also synced to the repository you set up.\n\nTeam and firm memory is shared, so it lives on our server and only members of that organization can read it. Team admins manage team memory, and only managers in the head-office team can write to firm memory. Before adding something to shared memory, make sure it’s right for everyone who can see it.' },
            { id: 'memory-review', q: 'What if the model remembers something wrong, or treats one case as a general rule?', a: 'Find that memory and edit or delete it. Keep anything specific to one case in project memory rather than team or firm memory. Memory is only a reference for the model and it can still misread it, so double-check key facts and rules before relying on them.' },
        ] },
        { id: 'security', title: 'AI requests and data security', items: [
            { id: 'self-hosting', q: 'Can our firm use its own server and models so nothing leaves the office?', a: 'Yes. Community Edition can be deployed on your firm’s own server with a local model, so storage and processing happen in-house.\n\nTo keep everything truly in-house, switching to a local model isn’t enough on its own: other online features also need to be turned off or replaced with in-house services, such as cloud OCR, transcription, web search, the phone cloud relay, shared memory on our website and remote sync. Local models also vary in tool use, image understanding and other capabilities, so each needs testing and may not match the default cloud setup exactly.\n\nIf this is what you need, get in touch with your team size, the model you plan to use, the features you want to keep and your network requirements, and we’ll work out the setup together.' },
            { id: 'model-context', q: 'What leaves my computer when I use AI?', a: 'Only what the task needs: your question, the relevant conversation, file content you provide or the AI reads for that task, and any memory it uses. Your whole project isn’t sent by default.\n\nOn the mainland China site, platform AI requests pass through our servers to Alibaba Cloud Model Studio. Our servers process the request content and record the model, usage and charge, without writing conversation content into billing records. On the international sites, platform AI uses OpenRouter. Custom providers and local models follow your settings. Other add-ins and online tools work according to their own settings.' },
            { id: 'retention', q: 'Are my conversations saved anywhere besides my computer?', a: 'Desktop conversations and logs are saved only on your own computer, not on our servers. Content is stored on our servers only for the cloud features you choose to use: the cloud Office add-in, the Skill drafting assistant, shared team memory and the phone relay, each described above.\n\nRequest retention depends on Alibaba Cloud Model Studio, OpenRouter and the selected model service. Using Model Studio does not mean every model has the same processing region or a zero-retention guarantee.', href: '/en/legal/privacy', linkLabel: 'Privacy and model service information' },
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

/** W22: full translations for the other locales (structure pinned to `en` by scripts/verify-faq-locales.mts). */
const TRANSLATED: Partial<Record<Locale, FaqContent>> = {
    ar: faq_ar,
    de: faq_de,
    el: faq_el,
    es: faq_es,
    fr: faq_fr,
    hi: faq_hi,
    id: faq_id,
    it: faq_it,
    ja: faq_ja,
    ko: faq_ko,
    ms: faq_ms,
    nl: faq_nl,
    pt: faq_pt,
    ru: faq_ru,
    th: faq_th,
    tr: faq_tr,
    vi: faq_vi,
};

export function communityFaq(lang: Locale): FaqContent {
    const content = lang === 'zh-hant' ? zhHant : toBaseLocale(lang) === 'zh' ? zh : TRANSLATED[lang] ?? en;
    // zh, zh-hant, en and 17 translations; a locale without one falls back to en. Links stay in the visitor's language.
    return {
        ...content,
        sections: content.sections.map(section => ({
            ...section,
            items: section.items.map(item => (item.href ? { ...item, href: item.href.replace(/^\/(zh|en)(?=\/|$)/, `/${lang}`) } : item)),
        })),
    };
}
