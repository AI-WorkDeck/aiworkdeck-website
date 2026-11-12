// 版本记录（/[lang]/updates 的「历史版本」区）。
//
// 刻意做成静态内容而不是拉 GitHub Releases API：
// 1. 境内用户访问 api.github.com 常年不通，cn 站拉不到就只能显示空列表；
// 2. 镜像 latest.json 只保留最新一版（update-mirror-sync.sh 会主动清理旧包），
//    历史版本本来就没有可查的数据源；
// 3. release notes 是写给开发者的，这里要写给律师看——「这一版你能多做什么」。
//
// 维护：每个 0.X 大版本在数组头部加一条，补丁版 0.X.Y 并入所在大版本那条（桌面仓
// .claude/agents/eng-infra.md 发版链路 4.8，2026-09-23 起硬步骤）。安装包直链只挂最新一版，
// 历史版本给 GitHub 发布页链接兜底（境外可达，境内用户按「大版本全量包」的口径
// 直接装最新版即可，不需要回装旧版）。

export interface LegacyReleaseNote {
    /** 版本号，不带 v 前缀 */
    version: string;
    /** 发布日期 YYYY-MM-DD */
    date: string;
    /** 这一版的主题，一句话 */
    headline: { zh: string; en: string };
    /** 三到五条，用户视角写「能多做什么」，不写内部重构 */
    items: { zh: string; en: string }[];
}

export type ReleaseNote = LegacyReleaseNote | {
    version: string;
    date: string;
    contentKey: 'release0750' | 'release0760' | 'release0770';
};

export const RELEASES: ReleaseNote[] = [
    {
        version: '0.84.2',
        date: '2026-11-12',
        headline: {
            zh: 'AI 助手办事更可靠，你随时可以暂停、改方向、一键撤销',
            en: 'The AI assistant gets more done reliably, and you can pause, redirect or undo it at any time',
        },
        items: [
            {
                zh: '多步任务更靠谱：改条款、加批注、导出 PDF、整理文件、处置修订等连续操作，实测在国内常用模型上的完成率从约四到七成提升到九成以上，用的轮次和额度也明显更少。此前部分模型「先说一句话再动手」时动作会被悄悄丢掉、只回一句话就结束，现在照常执行。',
                en: 'Multi-step work is far more dependable: chains like editing a clause, adding comments, exporting a PDF, organising files or resolving revisions now succeed over 90% of the time on common models in our tests, up from roughly 40–70%, using fewer rounds and less quota. Some models used to announce an action and then silently drop it; the action now runs.',
            },
            {
                zh: '你始终掌控：AI 运行中可以暂停、继续，或在任务窗格里补一句话改方向；对文档的改动可以一键撤销整次运行。退出时只检查本次有改动的项目，也可关闭自动检查；提交失败会说明原因，可单独重试或直接退出。',
                en: 'You stay in control: pause or redirect an AI run, and undo all of its document edits in one click. Quitting checks only projects changed in this session, and automatic checks can be turned off. Failed commits explain the reason and can be retried individually or skipped.',
            },
            {
                zh: '改合同更稳：新增一整条条款一步到位并沿用原有样式，插入后自动核对条号是否顺延；接受 / 拒绝修订后给出重新排好的编号，不会处置错条；带修订的文档按接受后的文字交给 AI，不再把「7」和「15」读成「715」。回答声称「已完成」但实际没执行时会被自动纠正。',
                en: 'Safer contract editing: a whole new clause is inserted in one step with matching style, and clause numbering is checked afterwards; accepting or rejecting a revision shows the renumbered list so the wrong one is never touched; documents with tracked changes reach the AI as accepted text, so "7" and "15" are no longer read as "715". If the AI claims something is done when it was not, it is corrected automatically.',
            },
            {
                zh: '法规更可信：北大法宝查到原文的法规卡显示为已检索；法宝暂时不可用时，AI 最多做两次替代检索，引用的条文标注「未核实」，不会冒称已核实。',
                en: 'More trustworthy legal sources: law cards backed by a live PKULaw result are marked as retrieved; when PKULaw is down the AI makes at most two fallback lookups and marks cited articles "unverified" instead of claiming they were checked.',
            },
            {
                zh: '用起来更顺手：文件右键菜单新增打印、移动到、压缩 / 解压、复制路径；平台 AI 需要重新同意时在对话里原地确认、自动重发这一问；设置、律所管理、项目沟通等多处版式修整；诉讼可视化引擎升级到最新版。',
                en: 'Smoother everyday use: the file context menu adds print, move to, compress / extract and copy path; when platform AI needs your consent again you confirm right in the chat and the question is resent; layouts are tidied across settings, firm management and project chat; the litigation-visualisation engine is updated to its latest version.',
            },
        ],
    },
    {
        version: '0.83.0',
        date: '2026-11-11',
        headline: {
            zh: 'AI 排版只改你说的那一项，不再顺手动别的格式',
            en: 'When the AI formats text, it now changes only what you asked for',
        },
        items: [
            {
                zh: '让 AI 改格式（如「第三条首行缩进 2 字符」「全文 1.5 倍行距」「把第四条加粗」）时，它只改你点名的那一项。此前部分模型会顺手把对齐、行距、段前段后、缩进甚至标题级别一并重置，可能把标题打回正文；实测个别模型此前约三分之二的调用会多改，现在基本不再出现。',
                en: 'When you ask the AI to format text (for example "indent clause 3 by two characters", "1.5 line spacing throughout" or "bold clause 4"), it now changes only that one setting. Previously some models also reset alignment, line spacing, paragraph spacing, indents and even heading levels, which could turn headings back into body text; in our tests one model did this in about two of every three calls before; now it essentially no longer happens.',
            },
            {
                zh: 'AI 工具体系升级收尾：上一版合并后保留的 48 个旧工具名已移除，工具清单更短更清楚；旧对话或旧版技能里出现的旧名会自动对应到新工具，或提示改用哪个新工具，不会报错中断。插件 SDK 的工具关键词上限放宽到 64 个。',
                en: 'The AI tool-system upgrade is complete: the 48 old tool names kept for compatibility after the last release are gone, so the tool list is shorter and clearer. Old names that appear in past conversations or older skills are mapped to the new tools, or the AI is told which new tool to use, instead of failing. The plugin SDK now allows up to 64 tool keywords.',
            },
        ],
    },
    {
        version: '0.82.0',
        date: '2026-11-10',
        headline: {
            zh: 'AI 能替你操作整个应用：会议转纪要、跨案件查期限、开庭日写进对的案件',
            en: 'The AI can now operate the whole app for you: meetings to minutes, deadlines across cases, hearing dates saved to the right case',
        },
        items: [
            {
                zh: '对 AI 说一句话就能跨应用办事：把腾讯会议转成纪要、列出所有案件的近期期限、把开庭日提醒记进正确的案件——案件有多个同名或相近时，它会先问你确认，不会猜。律所管理、项目沟通、脱敏等插件也能被 AI 直接调用，全所数据只对管理员开放。',
                en: 'One sentence is enough to get things done across the app: turn a Tencent Meeting into minutes, list upcoming deadlines across all your cases, and save a hearing-date reminder to the right case. If several cases look alike, the AI asks you to confirm instead of guessing. The law-firm, project-chat and redaction plugins can be driven by the AI as well, and firm-wide data is limited to administrators.',
            },
            {
                zh: '新增法定期限计算（会避开法定节假日与调休），以及两份 Word 的比对：给出差异摘要，或直接生成带修订痕迹的对比稿。',
                en: 'New statutory-deadline calculator that accounts for public holidays and make-up workdays, and a two-document Word comparison that gives either a summary of the differences or a redline with tracked changes.',
            },
            {
                zh: '删除等不可逆操作，AI 动手前会先弹出确认；每次工具调用都记入审计日志，可以回头查它做了什么。',
                en: 'Before the AI deletes anything, it now asks you to confirm, and every tool call is written to an audit log so you can check afterwards what it did.',
            },
            {
                zh: '可在设置里打开「对外 MCP 服务」，让 Claude Code、Codex 等外部 AI 工具使用你的案件与文书；它们改文档时只会提出修订建议，由你逐条接受或拒绝。第三方插件也能声明自己的 AI 工具。',
                en: 'In Settings you can switch on the external MCP service so tools like Claude Code and Codex can work with your cases and documents. When they edit a document they only propose tracked changes, which you accept or reject one by one. Third-party plugins can also declare their own AI tools.',
            },
            {
                zh: 'AI 工具整体精简重排：工具更少、说明更清楚，且顺序固定，提示缓存能被充分复用，每轮对话的费用明显下降，选错工具的情况减少。用英文提问也能直接找到对应功能。让 AI 删除整条条款（如「删除第三条」）不再反复空转；「记住……」类指令更可靠。国际站用户现在可以重新使用 Claude、Gemini、GPT 等模型。另修复北大法宝检索失效，以及新建带标题文档偶被截断的问题；分屏开合后文档会按窗格宽度自动缩放，纯图标按钮悬停会显示名称。',
                en: 'The AI toolset has been streamlined: fewer, clearer tools in a fixed order mean prompt caching is reused far better, so each turn costs noticeably less, with fewer wrong tool choices. Requests written in English now find the right feature directly. Asking the AI to delete a whole clause (such as "delete clause 3") no longer loops, and "remember..." instructions are more reliable. International users can use Claude, Gemini and GPT models again. Also fixes PKULaw search, newly created documents with a title occasionally being cut short, and documents now fit the pane width after opening or closing a split view; icon-only buttons show their name on hover.',
            },
        ],
    },
    {
        version: '0.81.0',
        date: '2026-11-06',
        headline: {
            zh: '编辑器秒开、AI 指哪儿改哪儿，深色模式下纸面也跟着变暗',
            en: 'Documents open in under a second, AI edits land exactly where you point, and dark mode now darkens the page too',
        },
        items: [
            {
                zh: '打开 Word、PPT 更快：编辑引擎在后台提前准备好，常见文书从点击到可编辑由约 3 秒缩短到 1 秒以内。连续打字时最多约 10 秒自动保存一次，切到别的窗口时也会先保存。',
                en: 'Word and PowerPoint files open faster: the editor engine is prepared in the background, so a typical document is ready to edit in under a second instead of about three. While you type, your work is saved at least every ten seconds or so, and also when you switch to another window.',
            },
            {
                zh: '对 AI 说「改这里」「把选中的这句改正式」，它会直接改光标所在段落或你选中的文字，一步到位；如果你在 AI 动手前挪了选区，它会停下来而不是改错地方。个人设置里可以单独设「修订与批注署名」，不必用账户实名。',
                en: 'Tell the AI "change this" or "make the selected sentence more formal" and it edits the paragraph at your cursor or your selection in one step; if you move the selection before it acts, it stops instead of editing the wrong place. You can also set a separate name for tracked changes and comments in personal settings instead of your account name.',
            },
            {
                zh: '深色模式下，Word 纸面、Excel 单元格、标尺和滚动条都跟着变暗，文件里设成黑色的字也会显示为浅色；PPT 幻灯片保留原色。只影响屏幕显示，打印和导出的 PDF 不变。',
                en: 'In dark mode the Word page, Excel cells, ruler and scrollbars now turn dark, and text set to black in the file is shown in a light color; PowerPoint slides keep their own colors. This only affects the screen: printing and exported PDFs are unchanged.',
            },
            {
                zh: '新增官方插件「表格化审阅」（第一期），律所插件新增办案费用台账；离线也能识别中国法条引用与案号。',
                en: 'A new official Tabular Review plugin (first release), a case-expense ledger in the law-firm plugin, and offline recognition of Chinese statute citations and case numbers.',
            },
            {
                zh: '提交版本时可以让 AI 写说明；对话里的计划卡固定在本轮最前；放进团队案件库失败时，原因会留在弹窗里并说明下一步。另修复会议转写稿双滚动条、OCR 结果全角千分位逗号、退出时版本状态偶尔读不出等问题；包晴天律师账户未勾选协议时也能切到扫码登录。',
                en: 'AI can draft the description when you submit a version; the plan card stays at the top of each turn; if adding to the team case library fails, the reason stays in the dialog with a next step. Also fixes the double scrollbar in meeting transcripts, full-width thousands separators in OCR results and the version status occasionally failing to load on exit; 包晴天 lawyer accounts can switch to QR-code sign-in before ticking the agreement.',
            },
        ],
    },
    {
        version: '0.80.1',
        date: '2026-11-06',
        headline: {
            zh: '更稳的保存与同步：断网、服务重启、超时重试时，文稿和录音不再悄悄丢失或重复',
            en: 'Sturdier saving and syncing: brief outages, service restarts and timeouts no longer silently lose or duplicate your documents and recordings',
        },
        items: [
            {
                zh: 'Word、Excel、PPT 自动保存失败后会按 5 秒、15 秒、30 秒、1 分钟自动重试，状态栏显示倒计时；本机服务恢复后立即补存；编辑器里按 Cmd/Ctrl+S 随时立刻保存。迟到的旧稿不会覆盖更新的内容。',
                en: 'If an autosave in Word, Excel or PowerPoint fails, it now retries automatically after 5 s, 15 s, 30 s and then every minute, with a countdown in the status bar; it saves right away once the local service recovers, and Cmd/Ctrl+S saves immediately at any time. A late, older copy can never overwrite newer content.',
            },
            {
                zh: '保存文档时先写临时文件再整体替换，磁盘写满或进程被关时原文件不再被清空；会议录音分片超时重传不会再重复写入同一段音频。',
                en: 'Documents are written to a temporary file and swapped in whole, so a full disk or a forced quit can no longer empty the original; re-sent meeting-recording chunks after a timeout are no longer written twice.',
            },
            {
                zh: '「放进团队案件库」时点「重新连接云端」会真正换新凭证，已放进去的案卷继续同步；仍不行时可「重新绑定这份案卷」，本机文件和历史不动。0.80.1 起，云端服务本身出错时会直接显示原因，不再一律让你重新连接。',
                en: '"Reconnect cloud" in "Add to team case library" now really renews the credentials and already-shared case files keep syncing; if it still fails, "Re-link this case file" starts fresh without touching local files or history. From 0.80.1, when the cloud service itself has a problem you see the actual reason instead of always being asked to reconnect.',
            },
            {
                zh: '应用中途被关后，「任务被中断」的说明只写在被打断的那一轮，不再误写进上一轮已完成的回答；AI 还在运行时不允许回退对话，避免已删的回答重新冒出来。',
                en: 'After an unexpected quit, the "task interrupted" note is added only to the interrupted turn, never to an earlier finished answer; rolling back a conversation is blocked while the AI is still running, so deleted answers no longer reappear.',
            },
            {
                zh: '跨设备推送文件失败会自动退还扣掉的额度；手机同步、腾讯会议同步、回收站恢复等在网络慢或中途退出时不再卡死或出现重复项。',
                en: 'Credits are refunded automatically when a cross-device file push fails; mobile sync, Tencent Meeting sync and restoring from the trash no longer hang or create duplicates when the network is slow or the app quits midway.',
            },
            {
                zh: '0.80.1：已装本地识别组件时，右键「识别文字（OCR）」会先自动启动本机识别服务，不再逐份失败、劝你改用云端；带文字层的 PDF 能正常导出保留版式的 Word；识别结果里不再混进印章的原始标记。',
                en: '0.80.1: With the local recognition add-ons installed, right-click "Recognize text (OCR)" now starts the local service first instead of failing file by file and suggesting the cloud; PDFs with a text layer export to layout-preserving Word again; raw seal markup no longer leaks into the recognized text.',
            },
        ],
    },
    {
        version: '0.79.0',
        date: '2026-11-05',
        headline: {
            zh: '扫描件和图片一键识别文字：右键即可复制、导出 Word，并与原件并排校对',
            en: 'Recognize text in scans and images with one click: copy or export to Word from the right-click menu and proofread side by side',
        },
        items: [
            {
                zh: '在资源管理器里对 PDF 或图片右键「识别文字（OCR）」，可复制文字、导出 TXT 或 Word；支持多选批量，带进度、可取消，单份失败不影响其余。',
                en: 'Right-click a PDF or image in the explorer and choose "Recognize text (OCR)" to copy the text or export it as TXT or Word; select several files to process them in a batch with progress and cancel, and one failure will not stop the rest.',
            },
            {
                zh: '导出 Word 后自动分屏，左边原件、右边识别结果，方便逐行校对；识别结果按行分段，不再整页挤成一段。',
                en: 'After exporting to Word, the original and the recognized text open side by side for line-by-line proofreading, and the text is split into lines instead of one block per page.',
            },
            {
                zh: '新增「保留版式的 Word」和「可搜索 PDF」：本地识别与自备密钥可直接使用；平台识别需待服务端更新后开放，届时自动可用。',
                en: 'New "layout-preserving Word" and "searchable PDF" exports work with local recognition and your own API key; platform recognition will enable them automatically once the service update rolls out.',
            },
            {
                zh: '带文字层的 PDF 直接在本机提取，不上传、不计费；需要上传识别时，沿用「扫描件识别」的偏好与告知，不会悄悄扣费。',
                en: 'PDFs that already contain text are extracted on your computer without uploading or charges; when uploading is needed, your scan-recognition preference and notice still apply, so nothing is charged silently.',
            },
            {
                zh: '修复截图识字框选后点「识别」需要点两下的问题；窗口不在前台时也能一下点中按钮。',
                en: 'Fixed the screenshot text recognition "Recognize" button needing two clicks after selecting an area; buttons now respond to the first click even when the window is in the background.',
            },
        ],
    },
    {
        version: '0.78.0',
        date: '2026-11-05',
        headline: {
            zh: '一百多处细节打磨：首次使用更顺手，选中就查、团队协作、工作记录与会议转写更可靠',
            en: 'Over a hundred refinements: smoother first run, and more reliable look-up, team collaboration, work logs, and meeting transcription',
        },
        items: [
            {
                zh: '首次使用更清爽：权限窗「稍后设置」能记住，首启弹窗不再叠在一起；登录弹窗重新排版，两项同意一次提示；窗口大小和位置会被记住。',
                en: 'A cleaner first run: "Set up later" for permissions is remembered, first-launch dialogs no longer stack, the sign-in dialog is reorganized with both consents checked at once, and window size and position are remembered.',
            },
            {
                zh: '选中就查插入的法条和工商信息另起一段，来源写「北大法宝 / 企查查」，日期按中文格式；选中整句话也能查到条文；「仅替换为正确全称」真正替换且可一步撤销。',
                en: 'Look-up results are inserted as a new paragraph with readable sources (PKULaw / Qichacha) and localized dates; selecting a whole sentence now finds the article text; "Replace with correct full name" truly replaces and can be undone in one step.',
            },
            {
                zh: '团队协作：「放进团队案件库」不再点了没反应，出错时说明原因并可重新连接或断开多余的案件库；改昵称不再导致已入库案卷要求重新连接。',
                en: 'Team collaboration: "Add to team library" now always responds, explains failures, and lets you reconnect or disconnect extra libraries; changing your display name no longer forces already-shared matters to reconnect.',
            },
            {
                zh: '工作记录真正记住开关、扣除离开的空闲时间，时长按 15 秒取整，可按日期查询并导出 CSV；会议录音新增「生成访谈笔录」，腾讯会议可选会后自动同步纪要与待办。',
                en: 'Work logs now remember the recording switch, deduct idle time, round to 15 seconds, filter by date, and export CSV; meeting recordings can generate interview transcripts, and Tencent Meeting can optionally auto-sync minutes and to-dos after a meeting.',
            },
            {
                zh: '诉讼可视化选「全部」不再反复回到同一步，风格选择不再错号；文件脱敏不再把「支付自」当人名、不再切碎公司全称，副本按原文件名命名。',
                en: 'Litigation visuals no longer loop when choosing "All" and pick the right style; file redaction no longer mistakes verbs for names or splits company names, and redacted copies keep the original file name.',
            },
        ],
    },
    { version: '0.77.0', date: '2026-11-04', contentKey: 'release0770' },
    { version: '0.76.2', date: '2026-11-04', contentKey: 'release0760' },
    { version: '0.75.7', date: '2026-10-31', contentKey: 'release0750' },
    {
        version: '0.74.0',
        date: '2026-10-28',
        headline: {
            zh: 'AI 表格操作更可靠，文书、演示与 Office 文件操作更完善',
            en: 'More reliable AI spreadsheet editing and improved document, presentation, and Office file operations',
        },
        items: [
            {
                zh: '改进 AI 对电子表格的读取、公式写入、排序和查找替换，排序时保留随行公式与格式，并在内容变化或目标不明确时停止操作。',
                en: 'Improved AI spreadsheet reading, formula entry, sorting, and find-and-replace. Sorting preserves row formulas and formatting, while changed content or ambiguous targets stop the operation.',
            },
            {
                zh: '补齐图表、数据透视表、数据验证、条件格式和命名区域等表格操作，让 AI 能完成更完整的数据整理与分析任务。',
                en: 'Expanded spreadsheet operations for charts, pivot tables, data validation, conditional formatting, and named ranges help AI complete more data preparation and analysis tasks.',
            },
            {
                zh: 'Word 支持更完整的段落、标题和条款读取；演示文稿可精确修改指定页面与对象，局部替换保留周边格式，并改进表格边框和图片适配。',
                en: 'Word gains more complete paragraph, heading, and clause reading. Presentation edits can target specific slides and objects, preserve surrounding formatting during partial text replacement, and better handle table borders and image fitting.',
            },
            {
                zh: 'Office 插件补充新建文档、打开项目文件副本和导出 PDF 等文件操作，明确区分副本与原文件，并在操作未完成时说明实际结果。',
                en: 'Office add-ins gain file operations including document creation, opening copies of project files, and PDF export, with clear distinctions between copies and originals and explicit outcomes when an operation is incomplete.',
            },
            {
                zh: 'Office 与 WPS 根据宿主实际能力提供操作，不支持的功能会明确提示；本轮已验证 Mac Office 的相关保存重开流程，WPS 新增图片、图表和过渡等能力尚未完成完整实机验证。',
                en: 'Office and WPS operations reflect each host’s capabilities, with explicit feedback for unsupported features. Relevant save-and-reopen flows were verified in Mac Office; new WPS image, chart, and transition capabilities have not yet completed full testing in the native applications.',
            },
        ],
    },
    {
        version: '0.73.0',
        date: '2026-10-27',
        headline: {
            zh: '日历与办案工作流体验更新，脱敏识别和诉讼出图更可靠',
            en: 'Improved calendar and legal workflows, with more reliable redaction and litigation diagram generation',
        },
        items: [
            {
                zh: '日历支持独立工作区视图与项目快捷筛选，并补齐桌面日程向手机同步所需的服务能力；手机端可用时间以对应客户端版本为准。',
                en: 'Calendar gains dedicated workspace views and quick project filters, alongside the service support needed to sync desktop events to mobile. Availability on mobile depends on the corresponding client release.',
            },
            {
                zh: '内置高频办案工作流有了独立编辑器，合同审查、证据整理等任务的操作入口和进行状态更加清楚。',
                en: 'Built-in legal workflows now have a dedicated editor, making contract review, evidence organization, and task progress clearer and easier to follow.',
            },
            {
                zh: '脱敏增强对编号当事人、房号、全角数字及分组手机号的识别，并保留 Word 中换行、制表符等原始分隔，降低漏脱敏和复敏残留。',
                en: 'Redaction better recognizes numbered parties, room numbers, full-width digits, and grouped phone numbers while preserving Word line breaks and tabs, reducing missed redactions and restoration residue.',
            },
            {
                zh: '诉讼可视化改为独立出图流程，材料选择、确认、继续与取消状态更清晰，不再打断右侧对话。',
                en: 'Litigation visualization now uses a dedicated generation flow with clearer material selection, confirmation, continuation, and cancellation states, without interrupting the conversation pane.',
            },
            {
                zh: '插件入口按实际功能分配，皮肤不再占用侧栏；同步改进项目沟通、腾讯会议和多语言界面的操作体验。',
                en: 'Plugin entry points now match each plugin’s function, so themes no longer occupy the sidebar. Project messaging, Tencent Meeting, and multilingual interactions are also improved.',
            },
        ],
    },
    {
        version: '0.72.1',
        date: '2026-10-27',
        headline: {
            zh: '主题预览跟随应用明暗与语言设置',
            en: 'Theme previews follow the app’s appearance and language settings',
        },
        items: [
            {
                zh: '配合 1.0.2 版主题插件，修复主题预览未随应用切换浅色或深色的问题。',
                en: 'Together with theme plugins version 1.0.2, fixes theme previews not following the app’s light or dark appearance.',
            },
            {
                zh: '修复主题预览文字未跟随应用语言设置的问题。',
                en: 'Fixes theme preview text not following the app’s language setting.',
            },
        ],
    },
    {
        version: '0.72.0',
        date: '2026-10-26',
        headline: {
            zh: '启动与文件打开提速，对话更顺手，文书、表格和演示编辑体验更新',
            en: 'Faster startup and file opening, smoother conversations, and improved document, spreadsheet, and slide editing',
        },
        items: [
            {
                zh: '优化启动与文件打开过程，减少进入工作台和加载文档时的等待。',
                en: 'Spend less time waiting for the workbench to start and for documents to open.',
            },
            {
                zh: '完善对话与随手对话模式，重新整理 AI 输入区，让输入、附加材料与继续交流更加清楚顺手。',
                en: 'Refined conversation and quick-chat modes, with a clearer AI input area for writing prompts, attaching materials, and continuing a discussion.',
            },
            {
                zh: '改进 Word 文书、Excel 表格与 PowerPoint 演示的编辑操作，完善缩略图和工作表标签，并修复输入与自动保存中的问题。',
                en: 'Improved editing for Word documents, Excel spreadsheets, and PowerPoint presentations, including thumbnails and sheet tabs, with fixes for input and autosave.',
            },
            {
                zh: '完善文件标签与版本管理，扩充 AI 可用的版本工具，方便整理材料、查看修改并处理版本记录。',
                en: 'Improved file tags and version management, with more version tools available to the AI for organizing materials and reviewing changes.',
            },
            {
                zh: '界面扩展至 20 种语言，并更新工作台视觉与布局；官网同步提供多语言页面和语言切换。',
                en: 'The interface now supports 20 languages, alongside refreshed workbench visuals and layout. The website also adds multilingual pages and a language picker.',
            },
        ],
    },
    {
        version: '0.71.0',
        date: '2026-10-23',
        headline: {
            zh: '项目消息与待确认事项集中处理，恢复语音等工具的完整操作体验',
            en: 'Project messages and confirmations in one place, with restored voice and business-tool workflows',
        },
        items: [
            {
                zh: '消息中心集中展示项目沟通、尽调通知和需要本人确认的律所事项，可从消息直接进入相关会话或业务页面；不同来源的权限与已读状态分别保留。',
                en: 'The message center brings together project conversations, due diligence notifications, and firm matters requiring your confirmation, with direct links to the relevant conversation or page and source-specific access and read status.',
            },
            {
                zh: '麦克风选择恢复显示真实设备名称；修复录音停止后列表不刷新、长时间收尾超时，以及语音组件安装失败却显示成功的问题。',
                en: 'Microphone selection shows real device names again. Recording lists refresh after stopping, long recording finalization continues correctly, and failed voice component installations are reported accurately.',
            },
            {
                zh: '修复脱敏导入当前文件和长任务等待、诉讼图保存与取消、窄栏日程编辑及删除确认、依据文档右窗打开和项目审查标准管理等问题，恢复工具迁移前的操作体验。',
                en: 'Restores current-file import and long-running redaction, diagram save and cancellation behavior, narrow-panel calendar editing and deletion, right-pane reference opening, and project review-standard management.',
            },
            {
                zh: '资源管理器可直接新建文书、表格、演示文稿和会议录音；文件标签支持浏览与组合搜索筛选，手机收件、切稿、采纳或取回团队文件后，文件树及时刷新。',
                en: 'Create documents, spreadsheets, presentations, and meeting recordings directly from the file explorer. Browse file tags, combine them in search filters, and see the file tree refresh after receiving mobile files, switching or adopting drafts, and taking team changes.',
            },
            {
                zh: '插件详情可发现并安装可用更新，失败后可重试；同时修复编辑器固定与滚动工具栏的对齐，并将左栏收起按钮移到外缘，减少对内容的遮挡。',
                en: 'Plugin details show available upgrades and support retrying failed updates. Editor toolbar controls align correctly, and the sidebar collapse button moves outside the content area.',
            },
        ],
    },
    {
        version: '0.70.0',
        date: '2026-10-22',
        headline: {
            zh: '懒人模式四大办案工作流即点即用；AI 智能分档与案件记忆沉淀，文书修订、表格演示及大目录体验全面升级',
            en: 'Four built-in Easy Mode legal workflows; Auto AI routing and project memory, plus faster document revision, spreadsheet/slide toolbars, and large-folder browsing',
        },
        items: [
            {
                zh: '懒人模式新增「诉讼可视化制图」「扫描件与图片 OCR 清洗归档」「长录音逐字稿精修与纪要」「监管法规与判例检索汇编」四大高频工作流，支持一键启动与分步进度跟踪；在普通对话中表达相关需求时，也会自动浮现快捷启动卡片。',
                en: 'Easy Mode adds four high-frequency legal workflows—Litigation Visual Charting, Scanned PDF & Image OCR Archiving, Long Recording Transcript & Minutes, and Regulatory & Case Law Compilation—with one-click launch, step-by-step progress, and smart intent cards directly in chat.',
            },
            {
                zh: 'AI 对话默认启用「智能（Auto）」模式，按任务复杂度自动匹配快速答复、标准处理或深度思考，也可随时手动固定档位；新增项目与个人长期记忆面板，办案中提炼的关键事实与写作偏好可审核入库，并在后续对话中自动引用与溯源。',
                en: 'AI chat now defaults to Auto mode, matching simple questions, standard tasks, or deep analysis automatically while still allowing manual selection. A new memory panel lets you review and save key case facts and drafting preferences for future sessions with source attribution.',
            },
            {
                zh: '在文书中选中文字后，浮窗可直接发起「法言法语润色、改写扩写、风险审查、翻译、浓缩精简」或一键带入右侧对话（支持快捷键 Ctrl/Cmd+Shift+L）；电子表格与演示文稿分别换上专属工具栏，常用数字格式、冻结首行、求和及幻灯片版式、增删复制与对齐分布触手可及。',
                en: 'Selecting text in a document brings up one-click actions—Legal Polish, Rewrite, Risk Review, Translate, Condense—or sends the excerpt straight into AI chat (Ctrl/Cmd+Shift+L). Spreadsheets and presentations now feature dedicated toolbars for number formats, freeze header row, auto-sum, slide layouts, and alignment.',
            },
            {
                zh: '大幅提升关联大型本地文件夹时的打开与检索速度，包含上万份底稿的目录也能即点即开；macOS 端支持从微信直接拖入文件，并在遇到系统目录权限限制时提供分步授权指引与拖拽授权窗口。',
                en: 'Opening and searching linked local folders with tens of thousands of files is now instantaneous. On macOS, files can be dragged directly from WeChat into the workbench or chat, accompanied by step-by-step folder permission guidance and a drag-to-authorize helper.',
            },
            {
                zh: '升级受邀客户尽调协作界面：优化顶部总览、左侧事项筛选、清单卡片与右侧详情面板的视觉层次，客户查看资料要求、AI 核验说明与上传历史更加清晰顺手。',
                en: 'Refreshed the invited client due diligence workspace with clearer hierarchy across the status header, category filters, checklist cards, and detail drawer for reviewing requirements, AI check feedback, and submission history.',
            },
        ],
    },
    {
        version: '0.69.0',
        date: '2026-10-22',
        headline: {
            zh: '尽调清单在线收件与报告勾稽；项目沟通助手与律所、团队、项目层级统一',
            en: 'Online due diligence collection and report linking; project communication assistants and unified firm, team, and project hierarchy',
        },
        items: [
            {
                zh: '律师可以在线创建尽调清单，或导入已有清单并拆分为具体事项；清单项可生成 AI 参考图展示组织架构图、证照等材料样式，确认后随清单发布给客户。',
                en: 'Create a due diligence checklist online, or import an existing list and split it into individual items. Generate AI reference images for checklist items to illustrate organization charts, certificates, and other materials before publishing to the client.',
            },
            {
                zh: '客户在完整桌面客户端中打开“客户协作”标签页，输入邀请码即可进入受邀项目，并切换查看多个项目；协作访问独立保存，保留原有登录账号和其他功能。',
                en: 'Clients can open the Client Collaboration tab in the full desktop app, enter an invitation code, and switch between invited projects. Collaboration access is stored separately while their existing app account and other features remain available.',
            },
            {
                zh: '每项支持多文件上传与历次版本留存。客户同意 AI 核验后可查看具体反馈，补传材料或提交申诉；律师在清单中复核并最终确认文件。',
                en: 'Each item supports multiple files and retains submission history. With client consent, AI checks provide specific feedback for replacement submissions or appeals; the lawyer reviews and gives final confirmation in the checklist.',
            },
            {
                zh: '收集的材料可按清单归档到资源管理器中的尽调底稿目录，用于后续撰写报告；报告内容可关联来源文件和原文摘录，方便逐项勾稽核对。',
                en: 'Collected materials can be organized by checklist in the file explorer for use as due diligence working papers. Report content can be linked to source files and excerpts for cross-checking.',
            },
            {
                zh: '项目沟通新增律所、团队与项目分层云端助手（支持共享群答复与个人私聊），精简通讯录与会话入口，并统一律所、团队、项目三层称谓；同时优化进入项目默认展开 AI 面板、主界面更新进度、本地组件安装指引与注册地址脱敏。',
                en: 'Project Communication adds firm, team, and project cloud assistants (with shared group replies and private chats), streamlines the directory and chat entry, and unifies firm, team, and project terminology—alongside opening the AI panel by default, top-bar update progress, local component setup guidance, and registered address redaction.',
            },
        ],
    },
    {
        version: '0.68.0',
        date: '2026-10-21',
        headline: {
            zh: '欢迎页更清爽，文档与文件操作更顺手，缺少组件时可继续完成任务',
            en: 'A cleaner welcome page, smoother document and file handling, and help completing tasks when components are missing',
        },
        items: [
            {
                zh: '首次进入欢迎页时默认收起左侧面板，并记住你之后的开关选择；插件列表分区独立滚动，窄侧栏也能看清名称和操作按钮。',
                en: 'The welcome page starts with the sidebar collapsed and remembers your later choice. Plugin sections scroll independently, with names and action buttons remaining readable in a narrow sidebar.',
            },
            {
                zh: '重新整理文档编辑器的格式工具栏，让常用设置更集中；拖动选择文字时可以同时滚动鼠标滚轮，跨页选取更顺手。',
                en: 'The document formatting toolbar brings common settings together. Scroll the mouse wheel while dragging a text selection to select across pages more easily.',
            },
            {
                zh: '移动文件时保留完整多选范围，文件在访达中变化后可刷新到工作台，标签与文件树的高亮保持同步；支持预览可解码的 QTA 录音。',
                en: 'File moves retain the full selection, changes made in Finder can be refreshed in the workbench, and tabs stay in sync with file-tree highlights. Compatible QTA recordings can also be previewed.',
            },
            {
                zh: '扫描 PDF 转 Word、语音识别等任务遇到缺少组件或模型时，会提供准备与重试入口；扫描识别可选择本地处理，或同意将页面上传至阿里云 OCR 识别并按用量计费。改进 Windows 上的组件检测与 PDF 转换。',
                en: 'Tasks such as scanned PDF-to-Word conversion and speech recognition offer setup and retry steps when components or models are missing. Choose local scan recognition, or consent to uploading pages to Alibaba Cloud OCR with usage-based charges. Windows component detection and PDF conversion are also improved.',
            },
            {
                zh: '修复文件拖入 AI 对话、法条语义检索和文档生成后回复摘要丢失的问题；改进应用内更新，让日常工作与升级衔接更顺畅。',
                en: 'Fixed dragging files into AI chat, semantic statute searches, and missing response summaries after document generation. In-app updates also fit more smoothly into everyday work.',
            },
        ],
    },
    {
        version: '0.67.0',
        date: '2026-10-20',
        headline: {
            zh: '编辑器打开更快更省内存；Word 协议条款定位与六项常用格式一步调准',
            en: 'Faster, lighter document editor; reliable Word clause positioning and formatting',
        },
        items: [
            {
                zh: '升级桌面内嵌文档编辑器引擎：打开合同与文书时的内存占用显著下降，启动与字体加载更快，多文档切换及弹窗关闭时更稳定。',
                en: 'Upgraded the built-in desktop document engine: opening contracts and pleadings uses significantly less memory, starts up and loads fonts faster, and stays steadier across document switches and dialogs.',
            },
            {
                zh: '修复自动编号条款定位：无论合同里的「第一条」「（一）」「1.1」是 Word 自动编号还是手动输入，AI 都能准确识别条款结构并定位到对应段落。',
                en: 'Fixed positioning on auto-numbered clauses: whether headings like “Article 1”, “(1)”, or “1.1” use Word automatic numbering or plain text, the AI now recognizes the clause structure and locates the right paragraph.',
            },
            {
                zh: '改进文书格式调整：缩进、中西文字体、字号、下划线、段前段后间距与倍行距支持连续多段一并生效；自动编号段落不再重复叠加首行缩进，1.5 倍行距等常用设置按倍数准确换算。',
                en: 'Improved legal document formatting: indentation, CJK/Western fonts, font sizes, underlines, paragraph spacing, and line spacing apply cleanly across consecutive paragraphs; auto-numbered items no longer get double first-line indents, and multiples like 1.5× line spacing apply accurately.',
            },
            {
                zh: '内置编辑器与 Microsoft Word、WPS 加载项同步支持上述条款定位与格式调整能力。',
                en: 'The built-in editor and the Microsoft Word and WPS add-ins all share the updated clause positioning and formatting behavior.',
            },
        ],
    },
    {
        version: '0.66.0',
        date: '2026-10-19',
        headline: {
            zh: '完整更新与任务接续，压缩包直接预览，工作台更清爽',
            en: 'Full updates and task continuation, archive previews, and a cleaner workbench',
        },
        items: [
            {
                zh: '完整更新下载后可在退出时安装，退出前先保存编辑内容，并为符合条件的本机 AI 任务保留接续状态。本次请使用完整安装包升级，以获得这项更新能力。',
                en: 'Downloaded full updates can install when you quit, after saving edits and preserving eligible local AI tasks for continuation. Use the full installer for this release to gain the new update capability.',
            },
            {
                zh: '压缩包内的文件可以直接浏览、预览和导入项目，也可以拖到访达、资源管理器及其他支持接收文件的应用；图片预览支持连续查看。',
                en: 'Browse and preview archive contents, import entries into your project, or drag them to Finder, File Explorer, and other apps that accept files. Image previews support browsing through images.',
            },
            {
                zh: '修复文件拖出后工作台可能无法点击的问题；改进 Mac 完整升级和 Windows 安装助手的启动等待。',
                en: 'Fixed unresponsive workbench clicks after dragging files out, and improved full upgrades on Mac and startup handling for the Windows installation helper.',
            },
            {
                zh: '简化工作台分隔线并对齐面板标题，保留文件树斑马纹；Windows 菜单与项目工具分行显示，避免窄窗口下相互遮挡。',
                en: 'Simpler dividers and aligned panel headings retain alternating file-tree rows. Windows menus and project tools use separate rows to avoid overlap in narrow windows.',
            },
            {
                zh: 'AI 输入区将 Jev 介绍和选项收为“了解并使用 Jev”，需要时展开，减少常驻说明占用的空间。',
                en: 'The AI composer keeps the Jev introduction and options in an expandable “About Jev & settings” control, leaving more space for your work.',
            },
        ],
    },
    {
        version: '0.65.0',
        date: '2026-10-18',
        headline: {
            zh: 'DPIA 工作台按需安装，常用工具独立管理，长文朗读更流畅',
            en: 'An optional DPIA workbench, independently managed tools, and smoother long-form reading',
        },
        items: [
            {
                zh: '新增可选 DPIA 工作台插件，支持材料溯源、事实确认、补答复评与版本留存，评估会话和导出文件归入当前项目。插件采用 GDPR/EU 评估方法，需配置 Node.js 与 Python 文档依赖；PDF 及逐页预览另需 LibreOffice，正式报告仍需人工复核。',
                en: 'The optional DPIA Workbench plugin supports source tracking, fact confirmation, reassessment after follow-up answers, and version history, with assessment conversations and exports kept in the current project. It uses a GDPR/EU assessment method and requires Node.js and Python document dependencies; PDF output and page previews also require LibreOffice, and formal reports still require human review.',
            },
            {
                zh: '搜索、语音、脱敏、诉讼可视化、日历、收藏、剪贴板与洞察八项工具可独立安装、启停和卸载，保留原有侧栏位置与启用状态。',
                en: 'Search, Voice, Desensitization, Litigation Visualization, Calendar, Favorites, Clipboard, and Insight can be installed, enabled, disabled, and uninstalled independently while retaining their sidebar placement and enabled state.',
            },
            {
                zh: '插件可连接开发者提供的登录、订阅及工具服务，并分别保存用户与项目设置；开发者可申请入驻、使用受限投稿令牌提交插件。断开连接、停用或撤销权限后，旧页面和迟到请求不再沿用原权限。',
                en: 'Plugins can connect to developer-provided sign-in, subscription, and tool services, with separate user and project settings. Developers can apply and submit plugins using scoped submission tokens. Disconnecting, disabling, or revoking access also invalidates old pages and late requests.',
            },
            {
                zh: '长文朗读在首段准备好后即可开始，不必等待全文合成；支持播放中即时调速、分段字幕、暂停继续与原速 WAV 导出，并改进音色搜索和键盘操作。',
                en: 'Long-form reading starts as soon as the first segment is ready, without waiting for the whole text. Change speed during playback, follow segment captions, pause and resume, or export a WAV at its original speed, with improved voice search and keyboard controls.',
            },
            {
                zh: '组件安装失败后可以立即重试，旧任务不再干扰新任务；Mac 安装包移除其他平台的多余媒体依赖并改进压缩，减少下载体积。',
                en: 'Failed component installations can be retried immediately without interference from the previous attempt. Mac installers remove unnecessary media dependencies for other platforms and use improved compression to reduce download size.',
            },
        ],
    },
    {
        version: '0.64.0',
        date: '2026-10-17',
        headline: {
            zh: '插件正文短期缓存，大文档读取与登录更可靠',
            en: 'Transient document caching and more reliable reading and sign-in for add-ins',
        },
        items: [
            {
                zh: '0.64.1 更新：验证码组件无法加载时，可在桌面端或 Office/WPS 插件中选择兼容验证。合同审查支持保存并确认项目审查标准，逐项保留原文摘录、理由与建议；标准或文档变化会提示重新确认或审查。',
                en: '0.64.1 update: choose compatible verification in the desktop app or Office/WPS add-ins when the usual verification widget cannot load. Contract review lets you save and confirm project standards, retain source excerpts, reasons and suggestions for each rule, and identify results made outdated by document or standard changes.',
            },
            {
                zh: 'Office/WPS 插件不再把文档全文存进请求队列，工具原始内容也不再写入会话历史；删除会话会同步清理相关队列、摘要与正文缓存。用户消息、AI 回复及思考记录仍保留至你删除会话。',
                en: 'Office/WPS add-ins no longer store document bodies in queued requests or raw tool payloads in conversation history. Deleting a conversation also clears its queued requests, summaries and document caches; user messages, AI replies and reasoning remain until deletion.',
            },
            {
                zh: '大文档读取最多等待 120 秒；正文超过本轮模型可容纳的长度时明确提示截断，缓存失效时提示并尝试重新发送全文，避免 AI 在不知情的情况下缺少正文。',
                en: 'Large-document reads can wait up to 120 seconds. The AI is told when text exceeds the current model budget, and an expired document cache prompts a full-text resend instead of silently proceeding without the document.',
            },
            {
                zh: '官网、桌面端与 Office/WPS 插件统一使用密码登录；尚未设置密码的账号可按提示验证身份并首次设密。',
                en: 'The website, desktop app and Office/WPS add-ins use password sign-in, with identity verification and first-time password setup for accounts that do not yet have one.',
            },
            {
                zh: '插件中的 AI 修改指令可携带修改理由，并随指令传给插件端，供修订卡片接入展示；卡片实际展示取决于插件端的配套更新。',
                en: 'AI editing commands can include a reason and pass it to the add-in for revision-card integration; displaying that reason requires the corresponding add-in update.',
            },
            {
                zh: '支持将可解码的 QTA 录音转换后转写；打开已有项目内的子文件夹时，确认范围后即可继续使用。',
                en: 'Compatible QTA recordings can be converted for transcription, and folders nested inside an existing project can be opened after confirming their scope.',
            },
        ],
    },
    {
        version: '0.63.0',
        date: '2026-10-15',
        headline: {
            zh: '选中文字直接拖移，工具栏一键接受或拒绝修订，文件树直转合并 PDF',
            en: 'Drag selected text directly, accept or reject revisions at the cursor, and convert or merge PDFs from the file tree',
        },
        items: [
            {
                zh: '文档编辑器中选中一段文字后，按住选中区即可直接拖到新位置，原位置与新落点作为一次操作一步撤销。',
                en: 'After selecting text in the document editor, press and drag it directly to a new spot; the move is recorded as a single undoable step.',
            },
            {
                zh: '未先点中修订标记时，点击工具栏的“接受修订”或“拒绝修订”会自动处理光标所在处及之后的第 1 处修订，并在跳回文档开头时给出提示。',
                en: 'Clicking Accept or Reject Revision in the toolbar without a selected mark now acts on the first revision at or after the cursor and lets you know when it wraps to the top of the document.',
            },
            {
                zh: '项目文件树与对话文件暂存区支持把文件直接拖到微信等外部应用发送；文件树右键支持将 Word、Excel、PPT、图片或纯文本直接转为同目录 PDF，或多选多份文件合并为一份 PDF。',
                en: 'Drag files directly from the project file tree or chat staging bar into external apps such as WeChat; right-click in the file tree to convert Word, Excel, PowerPoint, image, or text files to PDF in the same folder, or merge multiple selected files into one PDF.',
            },
            {
                zh: '法条查询在北大法宝直连未命中特定法条号时自动检索全文定位条文；企查查按主体名称核验时支持相近名称候选比对，提示名称字形差异供律师复核。',
                en: 'Statute lookup automatically falls back to full-text article search when a direct PKULaw article lookup misses; Qichacha company verification compares close name candidates and highlights character differences for lawyer review.',
            },
        ],
    },
    {
        version: '0.62.0',
        date: '2026-10-15',
        headline: {
            zh: '律所收案利冲与收费看板，项目沟通通讯录，云端备份与更新提示优化',
            en: 'Law firm intake, conflict checks, and billing dashboards; project chat directory; clearer cloud backup and update prompts',
        },
        items: [
            {
                zh: '新增律所管理工作区与个人中心“我的收案与利冲”：支持提交收案立项申请、自动检索本所在办与历史案件利益冲突、向关联承办律师发起站内信放行征询，以及利冲委员终审建项。',
                en: 'New Law Firm Management workspace and a personal Intake & Conflict Check view: submit matter intake requests, scan active and historical matters for conflicts, request clearance from related lawyers via in-app messages, and create projects upon final approval.',
            },
            {
                zh: '支持发票开具申请、手动回款核销与金蝶/用友标准凭证 CSV 导出，并按办案单元、合伙人团队、业务部门与全所汇总工作负荷、创收、回款率与账龄看板。',
                en: 'Submit invoice requests, record manual payment write-offs, export standard Kingdee or Yonyou CSV vouchers, and review workload, revenue, collection rate, and aging dashboards across units, partner teams, departments, and the firm.',
            },
            {
                zh: '项目沟通升级按组织与项目分组的通讯录，支持快速检索同事与客户并直接发起会话；团队与律所切换流程更顺畅，各插件在侧栏与工作区使用独立识别图标。',
                en: 'Project Chat adds an organization- and project-grouped directory to search colleagues or clients and start conversations directly, alongside smoother team switching and distinct plugin icons across the sidebar and workspace.',
            },
            {
                zh: '未开通订阅时点击底栏“文件云端备份”会明确说明订阅状态并提供前往开通入口；修复跨大版本检查更新时的提示显示问题。',
                en: 'Clicking Cloud Backup in the status bar without an active subscription now clearly explains your status with a direct link to subscribe, and cross-version update checks display the proper prompt.',
            },
        ],
    },
    {
        version: '0.61.0',
        date: '2026-10-14',
        headline: {
            zh: '在项目中与同事、客户沟通，按需分享文件',
            en: 'Talk with colleagues and clients and choose which project files to share',
        },
        items: [
            {
                zh: '中国大陆站账号可从插件广场安装“项目沟通”，与律师、同事和客户建立单聊或群聊，发送消息和文件；国际站暂未开通。',
                en: 'Mainland China accounts can install Project Chat from the marketplace for direct or group conversations and file sharing with lawyers, colleagues, and clients. International accounts are not yet supported.',
            },
            {
                zh: '聊天中可引用项目文件的当前版本，将收到的文件收进项目库、在工作区打开，或加入 AI 对话。',
                en: 'Quote the current version of a project file in chat, save received files to your project, open them in the workspace, or add them to an AI conversation.',
            },
            {
                zh: '项目文件默认仅内部成员可见，律师可单独向客户开放；客户自己上传的文件始终可见。',
                en: 'Project files are visible to internal members by default. Lawyers can grant client access to individual files, while clients can always view their own uploads.',
            },
            {
                zh: '项目与引用文件保留稳定标识；聊天记录只在你主动归档时收进项目，随项目管理版本。',
                en: 'Projects and file references keep stable identifiers. Chat history enters project version control only when you explicitly archive it.',
            },
            {
                zh: '0.61.1 补丁：客户无法读取内部项目记忆；成员被移出项目或改为客户后，之前排队的 AI 输入不再执行。',
                en: '0.61.1 patch: clients cannot read internal project memory. When members are removed from a project or changed to clients, their previously queued AI input will no longer execute.',
            },
            {
                zh: '0.61.2 补丁：多标签切换、版本恢复与 AI 连续改稿时，文档保存与重新打开更稳定；多人同时上传大文件或发起 AI 对话时，连接不易中断。',
                en: '0.61.2 patch: saving and reopening documents are more reliable when switching tabs, restoring versions, or applying consecutive AI edits; connections stay steadier when multiple users upload large files or start AI conversations at the same time.',
            },
        ],
    },
    {
        version: '0.60.0',
        date: '2026-10-13',
        headline: {
            zh: '按需显示编辑标记，补全更贴近上下文，保存与版本恢复更稳',
            en: 'Choose your editing marks, get contextual completions, and save more reliably',
        },
        items: [
            {
                zh: '文档自动补全根据光标前后文提出续写，经独立审读后显示；可随时关闭或重新开启，采用后可一次撤销。建议仍需你核对，调用会使用 AI 额度。',
                en: 'Document completion uses the text around your cursor and independent review before showing a suggestion. Turn it off or on at any time and undo an accepted suggestion in one step. Suggestions still need your review and use AI credits.',
            },
            {
                zh: '编辑器新增特殊字符下拉设置，可分别选择段落标记、手动换行、空格和制表符是否显示，并记住你的选择。',
                en: 'A new editor dropdown lets you show or hide paragraph marks, manual line breaks, spaces, and tabs separately, with your choices remembered.',
            },
            {
                zh: '减少大文件版本处理拖住文稿保存的情况；本地后端异常时显示状态并尝试恢复，保留编辑器中尚未保存的内容。',
                en: 'Large-file version processing no longer holds up document saves. Local backend failures show a status and trigger recovery attempts while unsaved editor content is kept.',
            },
            {
                zh: '新保存的大文件及音视频版本保留完整内容，支持恢复；明确开启云端备份后才同步，未开启时仍可在本机保存。',
                en: 'New versions of large files and audio or video retain their full contents for recovery. Cloud backup runs only after you enable it; local saving remains available without it.',
            },
            {
                zh: 'AI 回复后可建议下一步提问，支持编辑、Tab 发送或关闭；内置浏览器工具栏更紧凑，修复快速输入地址被截断的问题。',
                en: 'After an AI reply, optional next-message suggestions can be edited, sent with Tab, or turned off. The browser toolbar is more compact and no longer truncates quickly typed addresses.',
            },
        ],
    },
    {
        version: '0.59.0',
        date: '2026-10-12',
        headline: {
            zh: '从系统直接打开文档，修改后保存回原文件',
            en: 'Open documents from your desktop and save changes to the original file',
        },
        items: [
            {
                zh: '安装新版后，可在 macOS 和 Windows 的“打开方式”中选择 AI WorkDeck 打开 Word、PDF 等受支持文件，也可由你设为默认应用。',
                en: 'After installing this version, choose AI WorkDeck from Open With on macOS or Windows for supported files such as Word documents and PDFs. You can also choose it as your default app.',
            },
            {
                zh: '单独打开文件即可开始阅读或编辑，无需先建项目，也不会把同一文件夹里的其他材料一起导入；支持编辑的文件保存回原位置。',
                en: 'Read or edit individual files without creating a project or importing other documents from the same folder. Editable files are saved back to their original location.',
            },
            {
                zh: '可连续打开多份文件，在标签页间切换；不同文件夹中的同名文件分别保留，重复打开同一文件会回到已有标签。',
                en: 'Open multiple files in tabs. Files with the same name in different folders stay separate, while reopening the same file returns to its existing tab.',
            },
        ],
    },
    {
        version: '0.58.0',
        date: '2026-10-11',
        headline: {
            zh: '项目清单跨设备对齐；订阅额度与云空间清楚可查',
            en: 'One project catalog across devices; clearer subscription and cloud storage allowances',
        },
        items: [
            {
                zh: '同一账户下的桌面、云端和插件项目可在统一清单中查看，保留文件所在位置，减少在不同设备上重复寻找项目。',
                en: 'View desktop, cloud, and add-in projects in one account catalog, with file locations preserved so projects are easier to find across devices.',
            },
            {
                zh: '手机录音和上传可选择统一清单中的项目；iOS 文件工作区可选择云端或桌面位置取件，桌面文件需所在设备在线。',
                en: 'Choose projects from the unified catalog for mobile recordings and uploads. The iOS file workspace can retrieve files from cloud or desktop locations; desktop files require that device to be online.',
            },
            {
                zh: '保留按需充值与单项解锁，新增每 30 天 149 元的 Pro 方案，含 745 Credits、每 7 天最多使用 200 Credits，并附无线剪贴板、暂存区和 3GB 持久云空间。',
                en: 'Keep pay-as-you-go credits and individual unlocks, or choose Pro at CNY 149 per 30 days: 745 Credits with a 200-Credit limit every 7 days, plus wireless clipboard, staging, and 3GB of persistent cloud storage.',
            },
            {
                zh: '账户分别显示订阅周/月额度与充值余额，超额默认暂停，开启后才使用充值余额；200MB 临时中转空间在取件确认后释放。',
                en: 'See subscription period and weekly allowances separately from wallet credits. Spending beyond the allowance pauses unless you enable wallet use; temporary relay space is capped at 200MB and released after receipt is confirmed.',
            },
        ],
    },
    {
        version: '0.57.0',
        date: '2026-10-10',
        headline: {
            zh: '生成文件就近归档；文档编号与版面检查；编辑和手机收件体验改进',
            en: 'File generated documents where you work; numbering and layout checks; improved editing and mobile inbox',
        },
        items: [
            {
                zh: 'AI 新建文件默认放在当前文档所在目录，也可按你指定的位置保存；对话中生成的文件可以直接拖到左侧项目目录归档。',
                en: 'Files created by AI default to the current document’s folder, or a location you specify. Drag generated files from the conversation into a project folder in the sidebar.',
            },
            {
                zh: '文档检查可识别手写序号与自动编号混用的线索，帮助发现重复编号；还可选择将指定页面转为 PDF 交给 AI 检查版面，开始前会提示耗时与额度消耗，由你确认。',
                en: 'Document checks can flag signs of manual numbers mixed with automatic numbering, helping identify duplicate numbering. You can also choose pages to export as PDF for an AI layout review, with time and credit usage explained before you confirm.',
            },
            {
                zh: '修复点击接受或拒绝当前修订时的报错，并修复部分 PDF 被当作文字文档打开后显示乱码的问题。',
                en: 'Fixed errors when accepting or rejecting the current revision, and garbled display caused by some PDFs opening as text documents.',
            },
            {
                zh: '改善大段粘贴时的卡顿，以及保存、关闭文档时的状态提示；对话中的确认选项正常显示，不再露出内部标签。',
                en: 'Improved responsiveness when pasting large amounts of text and made save and close status messages more reliable. Confirmation options in conversations display correctly without exposing internal tags.',
            },
            {
                zh: '桌面端增加手机收件状态入口，方便查看手机上传的照片、视频和录音是否已收到，以及文件归档到哪个项目。',
                en: 'A mobile inbox status entry on desktop lets you check whether uploaded photos, videos, and recordings have arrived and which project they were filed in.',
            },
        ],
    },
    {
        version: '0.56.0',
        date: '2026-10-10',
        headline: {
            zh: '文档修订操作更直接；试用用量提示与报告出处核对',
            en: 'Quicker revision controls; trial usage information and source-linked reports',
        },
        items: [
            {
                zh: '可直接在文档工具栏接受或拒绝光标处的当前修订，也可一次接受或拒绝全部修订，无需先打开审阅面板。',
                en: 'Accept or reject the revision at the cursor directly from the document toolbar, or accept or reject all revisions at once, without first opening the review panel.',
            },
            {
                zh: '修复文档重新加载或重试打开后，额外出现一套英文菜单和工具栏的问题，保持编辑界面一致。',
                en: 'Fixed an extra set of English menus and toolbars appearing after reloading a document or retrying an open operation, keeping the editing interface consistent.',
            },
            {
                zh: '账户菜单可查看账户服务返回的剩余试用天数和 AI 对话轮次，离线时显示同一账户最近同步的余额并提示待同步。',
                en: 'The account menu shows remaining trial days and AI turns returned by the account service; when offline, it displays the last balance synced for the same account with a pending-sync notice.',
            },
            {
                zh: '新增证据关联报告技能：依据项目材料起草报告或备忘录时，引导 AI 将有依据的结论链接到来源原文，并明确标出缺少或仅有部分证据的事项，方便逐条回看核对；AI 建立的链接仍需人工确认。',
                en: 'A new Evidence-Linked Report skill guides AI to link supported conclusions in reports and memoranda back to project source passages, while flagging missing or partial evidence for review. Links created by AI still require human verification.',
            },
        ],
    },
    {
        version: '0.55.0',
        date: '2026-10-08',
        headline: {
            zh: '腾讯会议插件上架；插件启用即见，并可在工作区标签页中使用',
            en: 'Tencent Meeting in Marketplace; instant plugin access and workspace tabs',
        },
        items: [
            {
                zh: '可从插件广场安装腾讯会议插件，手动同步会议列表，读取已有逐字稿与智能纪要，归档到当前项目后交给 AI 整理纪要、提取待办。需先安装腾讯会议官方 CLI 并登录，材料读取取决于账号权限及录制处理状态。',
                en: 'Install Tencent Meeting from Marketplace to manually sync meeting lists, read available transcripts and smart minutes, and archive them to the current project for AI-drafted minutes and action items. Install the official Tencent Meeting CLI and sign in first; access depends on account permissions and recording readiness.',
            },
            {
                zh: '在插件广场安装并启用插件后，当前工作台左侧立即显示入口，无需重新进入项目；禁用或卸载后，入口同步移除。',
                en: 'Installing and enabling a plugin in Marketplace immediately adds its entry to the workbench sidebar, without reopening the project. Disabling or uninstalling it removes the entry.',
            },
            {
                zh: '插件可在工作区标签页中打开，与文档切换使用，也可拖入分栏并排查看；再次点击同一插件时回到已有标签页，避免重复打开。',
                en: 'Plugins now open in workspace tabs alongside documents and can be dragged into a split pane for side-by-side use. Selecting the same plugin again returns to its existing tab instead of opening a duplicate.',
            },
        ],
    },
    {
        version: '0.54.0',
        date: '2026-10-07',
        headline: {
            zh: '本机字体与快捷段落排版；文档修订和日程保存改进',
            en: 'Local fonts and quick paragraph formatting; improved revisions and schedule saving',
        },
        items: [
            {
                zh: '0.54.1 补丁：从欢迎页左侧新建事项时，已选项目能正确保存，不再误报“请选择项目”；缩短复杂文档打开及修订面板清单加载的等待。',
                en: '0.54.1 patch: creating a scheduled item from the Welcome sidebar now saves the selected project correctly, without an incorrect “Please select a project” prompt. Complex documents and revision lists load with less waiting.',
            },
            {
                zh: '桌面端可在字体菜单中管理并启用本机已安装的字体，重启编辑器后用于文档排版。',
                en: 'On desktop, manage and enable fonts installed on your computer from the font menu, then use them in documents after restarting the editor.',
            },
            {
                zh: '选中文字后输入、按回车或 Tab，按 Word 的习惯覆盖选区，并可一次撤销；光标处调整字体和字号后，新输入的文字随之生效。标尺与格式标记默认显示，也可随时关闭。',
                en: 'Typing, pressing Enter, or pressing Tab over selected text now replaces the selection as in Word and can be undone in one step. Changing the font or size at the cursor applies to newly typed text. Rulers and formatting marks are shown by default and can be turned off.',
            },
            {
                zh: '新增快捷段落面板，可直接设置首行与悬挂缩进、段前段后间距、行距和对齐方式，并使用正文、公文、合同等排版预设。',
                en: 'A new paragraph panel offers first-line and hanging indents, paragraph spacing, line spacing, and alignment, with presets for body text, official documents, and contracts.',
            },
            {
                zh: '改善 AI 连续逐段修订时越改越慢的问题，保留细粒度修订标记；批量修改期间切换修订显示方式，会在当前批次完成后生效。',
                en: 'Improved the progressive slowdown during AI paragraph-by-paragraph editing while retaining fine-grained revision marks. Changes to the revision display mode during batch edits take effect after the current batch finishes.',
            },
        ],
    },
    {
        version: '0.53.0',
        date: '2026-10-01',
        headline: {
            zh: 'Word 修订比对正式上线；大文档比对等待与进度展示',
            en: 'Official Word revision comparison; sustained waiting and progress feedback for large documents',
        },
        items: [
            {
                zh: '0.53.1 补丁：文档比对支持最小修订模式，在短语或相近语句修改时按字符精细标出改动（保留公共前后缀，仅标记删改差异字），避免粗暴整段整行替换；正文修订标记支持鼠标悬停浮现气泡卡片，直接查看修订者姓名、时间与修改类型。',
                en: '0.53.1 patch: document comparison now refines revisions to minimal character-level diffs for similar phrases, preserving common text and marking only changes instead of replacing whole paragraphs. Hovering over revision markers in the document body now displays an author card with name, timestamp, and edit type.',
            },
            {
                zh: '新增 DOCX 修订比对：选中两份 Word 文档即可按句段比对，生成独立且可继续编辑的比对稿；正文增删、段落移动、双方批注、表格修订及脚尾注引用均按 Word 修订标准完整呈现。',
                en: 'New DOCX revision comparison: select two Word documents to compare sentence by sentence, generating an independent editable document. Insertions, deletions, moved text, merged comments, table changes, footnotes, and endnotes are fully presented as standard Word revisions.',
            },
            {
                zh: '取消大文档比对 180 秒固定超时：长文档比对期间展示底层真实流转阶段与已用时间，不设固定硬超时；连续 5 分钟无阶段变化时提示停滞，可自主选择继续等待或安全取消。',
                en: 'Removed the 180-second fixed timeout for large DOCX comparisons: shows actual processing stages and elapsed time without premature cancellation. If five minutes pass without stage changes, a prompt lets you continue waiting or safely cancel.',
            },
            {
                zh: '比对过程具备死机与崩溃识别：底层文档引擎若发生异常或意外退出，立即明确提示并释放资源，不会陷入无声的死循环，原始文件保持原样无改动。',
                en: 'Added crash and fault detection for document comparisons: if the underlying engine aborts or exits unexpectedly, the task finishes immediately with clear feedback and cleans up resources without corrupting source files.',
            },
            {
                zh: '比对弹窗适配小屏视口：在紧凑窗口下弹窗支持内容滚动，确保取消与继续按钮随时可见、可点。',
                en: 'Responsive comparison dialog: supports content scrolling on compact screens, ensuring that Cancel and Continue buttons remain fully visible and clickable.',
            },
        ],
    },
    {
        version: '0.52.0',
        date: '2026-09-30',
        headline: {
            zh: '连续批注保存修复；文件整理与法律意见核验指引改进',
            en: 'Fixes for saving consecutive comments; clearer guidance for file organization and legal opinion checks',
        },
        items: [
            {
                zh: '修复 AI 连续添加批注时，部分批注保存后内容为空、未挂在对应原文上的问题。',
                en: 'Fixed a case where consecutive AI comments were saved with empty text and lost their attachment to the selected passage.',
            },
            {
                zh: '改进 AI 整理文件的指引：整理指定文件夹时，在该目录内分类并保留原文件夹，未经明确要求不将文件移到项目根目录。',
                en: 'Improved guidance for AI file organization: sort within the specified folder and retain that folder, without moving files to the project root unless explicitly requested.',
            },
            {
                zh: 'AI 面板较窄时，模型选择和用量统计保持可读，减少文字挤压、逐字换行。',
                en: 'Model selection and usage statistics remain readable in a narrow AI panel, with less cramped text and awkward line wrapping.',
            },
            {
                zh: '改进法律意见修订指引：对材料尚未核实的事实明确提示，保留草稿身份，不自行补写出具主体；复杂事实与法律结论仍需人工审阅。',
                en: 'Improved guidance for revising legal opinions: flag facts not yet verified from the source materials, retain draft status, and avoid inventing the issuing party. Complex facts and legal conclusions still require human review.',
            },
            {
                zh: '选中文字后的检索菜单按内容显示相应入口，减少与所选内容无关的检索选项。',
                en: 'The search menu for selected text now shows relevant options based on the selection, reducing unrelated search entries.',
            },
        ],
    },
    {
        version: '0.51.0',
        date: '2026-09-29',
        headline: {
            zh: '打开即用，不再先登录；用 AI、装付费内容、连团队案件库时再登录',
            en: 'Open and start working without signing in; sign in only when you use AI, install paid content, or connect a team case library',
        },
        items: [
            {
                zh: '启动后直接进入工作台，不再先过登录页。看文档、编辑、管理本地项目都不需要账户；AI 对话、安装付费插件、连接团队案件库这类必须有账户的功能，点下去时才就地弹出登录，登完接着刚才的操作，不会被带离当前页面。退出登录停在原页；换账户时会说明本机项目属于这台电脑、不随账户走。',
                en: 'The app now opens straight into the workbench with no sign-in page first. Viewing, editing, and managing local projects need no account; features that do, such as AI chat, installing paid plugins, and connecting a team case library, bring up sign-in in place the moment you use them, and you carry on where you were. Signing out keeps you on the same page, and switching accounts explains that local projects belong to this computer, not to the account.',
            },
            {
                zh: '工作台像 VS Code 一样以标签为中心：新的「欢迎」标签集中了新建项目、打开文件夹、取案卷、连接团队服务器、客户凭访问码进入案卷和最近项目；左栏新增「项目」面板随时切换项目；日历成为一个标签，可以和文档并排打开；已打开的标签在重启后恢复原样。',
                en: 'The workbench is tab-centered like VS Code: a new Welcome tab gathers new project, open folder, pull a case file, connect a team server, client access by code, and recent projects; a Projects panel in the left rail switches projects at any time; the calendar is now a tab that sits beside your documents; and open tabs are restored after a restart.',
            },
            {
                zh: 'PDF 一批修复：组件安装过程可见并有超时提示；PDF 转 Word 失败时如实告知，不再悄悄换成丢版式的方式；编辑器还在启动时会等它就绪；重复点击不再生成多份；回收站不再显示幽灵计数、也不再误删同路径文件。当前文档是图片时 AI 直接看图，图片预览可用滚轮放大。音频与视频有了统一的播放控制条，支持自动字幕和边下边播。',
                en: 'A batch of PDF fixes: component installation is visible and times out with a message; when PDF to Word fails you are told instead of a silent fallback that loses layout; the app waits for the editor to finish starting; repeated clicks no longer produce duplicates; and the recycle bin no longer shows phantom counts or deletes a different file at the same path. When the current document is an image the AI looks at it directly, and image preview zooms with the scroll wheel. Audio and video share one set of playback controls with automatic subtitles and streaming playback.',
            },
            {
                zh: 'AI 计划模式的计划可以在 Markdown 标签里直接修改并加批注，改动和批注一并交给模型照着执行。AI 学会了使用回收站，删掉的东西可以找回；桌面端永久删除进系统废纸篓。安全验证组件加载不出来时，会点明需要放行哪些网络地址，不再盲发验证码。',
                en: 'Plans in the AI plan mode can be edited and annotated directly in a Markdown tab, and both are handed to the model to carry out. The AI now uses the recycle bin, so what it deletes can be recovered, and a permanent delete on desktop goes to the system Trash. When the human-verification component fails to load, the app names the network addresses to allow instead of sending a code blindly.',
            },
            {
                zh: '0.51.1 补丁：欢迎页可以直接「打开文件…」，选一个文档就以它所在的文件夹入项目并打开；账户头像与设置回到右上角。AI 的思考过程随回复保存，切到别的会话再切回来、或断线重连，已经写出的思考、工具过程和正文原样还在，思考秒数接着算，历史消息里也能展开回看。思考型模型（Kimi K3）更稳：按时延挑供应商、排队超过半分钟自动换一家、简单问题不再深想几分钟，思考超过一分钟界面会说明原因并给出停止按钮。AI 每问更省：开着文档时不再把 PDF、诉讼可视化、演示等无关工具塞给模型，并改为先给核心工具、其余按需检索，同一问的上下文体积约减半；工具面逐个盘点后补齐了跨项目全文检索、导出 PDF、复制文件和在某句前后一步插入。',
                en: '0.51.1 patch: the Welcome tab gains "Open File", which opens the chosen document with its folder as the project; the account avatar and Settings return to the top right. The AI\'s thinking is saved with each reply, so switching to another conversation and back, or reconnecting after a drop, keeps the thinking, tool activity, and text already produced, the thinking timer keeps counting, and past messages can be expanded to review it. Thinking models (Kimi K3) are steadier: providers are picked by latency, a request queued for more than half a minute is moved to another provider, simple questions no longer think for minutes, and after a minute of thinking the interface explains why and offers a Stop button. Every AI question is leaner: with a document open, unrelated tools (PDF, litigation diagrams, slides) are no longer pushed to the model, and the model now receives a core toolset first and looks up the rest on demand, roughly halving the context per question; a tool-by-tool audit added project-wide full-text search, export to PDF, copy files, and one-step insertion before or after a sentence.',
            },
            {
                zh: '0.51.2 补丁：精简 AI 每次对话携带的重复指引，让更多上下文空间留给你的问题、文档和对话记录。文档编辑、文件处理等工具的使用条件与必要约束仍然保留，并按当前任务和文档类型提供对应指引。',
                en: '0.51.2 patch: repeated instructions sent with each AI conversation have been trimmed, leaving more context space for your questions, documents, and conversation history. The requirements and safeguards for tools such as document editing and file handling remain in place, with guidance matched to the current task and document type.',
            },
            {
                zh: '0.51.3 补丁：修复 AI 输入框在窄栏下将“智能体”逐字换行的问题；新建空白文档可参与比对，比对前先保存两份文档的当前修改。AI 修订文书时补充项目资料读取、完成前核验和检查点恢复处理；复杂文书的事实准确性仍需人工审阅。',
                en: '0.51.3 patch: fixes the Agent label wrapping vertically in a narrow AI panel. Newly created blank documents can be compared, and pending changes in both documents are saved before comparison. Document revision gains project-source reading, completion checks, and checkpoint recovery improvements; factual accuracy in complex documents still requires human review.',
            },
            {
            zh: '面向客户的协作：客户访问码由案件库签发，客户通过专属门户进入；律师侧尽调材料审核形成闭环，可以通过、驳回并写明理由、撤回已审结果，客户端看到对应状态并按要求重新上传。',
                en: 'Working with clients: access codes are issued by the case library and clients enter through a dedicated portal; due-diligence review on the lawyer side is a closed loop with approve, reject with a stated reason, and withdraw, and the client sees the status and re-uploads as requested.',
            },
        ],
    },
    {
        version: '0.50.0',
        date: '2026-09-28',
        headline: {
            zh: '分屏与标签不再丢文档；转写先确认再扣费；文件多选、拖拽与快速打开更可靠',
            en: 'Split view and tabs stop losing documents; transcription confirms before charging; multi-select, drag and drop, and Quick Open are more reliable',
        },
        items: [
            {
                zh: '分屏后关闭右侧窗格，标签会并回左侧，不再留下看不见却仍打开的文档；Office、纯文本、draw.io 等可编辑文档不会再同时开在左右两侧互相覆盖。浏览器面板「重新加载」不再留下卡住的旧页面。AI 对话关闭右栏再打开会回到原来的会话，每轮回复正常结束也不会再误报「连接已断开」。',
                en: 'Closing the right pane after a split now merges its tabs back into the left side instead of leaving a hidden document open; editable files such as Office documents, plain text, and draw.io diagrams can no longer be open on both sides at once and overwrite each other. Reloading the browser panel no longer leaves a stuck page behind. Closing and reopening the AI panel returns you to the same conversation, and a reply that ends normally no longer triggers a false "connection lost" warning.',
            },
            {
                zh: '资源管理器多选与拖拽更符合直觉：勾选文件夹会带上或松开全部子项，框选连带子文件夹，回收站同一规则，取消勾选的文件不会再被批量删除或复制带走；把文件拖到空白处就移到根目录，手滑的小幅拖拽不再当真。标签管理弹窗按 Esc 即可关闭，新建标签的颜色选项不再溢出；右键菜单能识别多选并找回「对比文档」，「复制」改名为更准确的「创建副本」。',
                en: 'Multi-select and drag and drop in the file explorer are more intuitive: checking a folder includes or releases all of its children, marquee selection sweeps up subfolders, the recycle bin follows the same rule, and a file you unticked is never swept into a bulk delete or copy; dropping a file on empty space moves it to the root, and a small accidental drag no longer counts. Tag dialogs close with Esc, new tag color swatches no longer overflow, right-click menus recognize multi-selection and bring back "Compare Documents," and "Copy" is now the clearer "Create a Copy."',
            },
            {
                zh: '提交平台转写前会先弹出确认，说明计费方式、预计费用与账户余额，并提示本机转写这条不出本机的路径；右键转写、面板转写、录音结束后的自动转写三个入口都覆盖，不会再在你没确认的情况下预扣 Credits。',
                en: 'Before a paid transcription is submitted you now see a confirmation with how billing works, the estimated cost, and your balance, plus the option to transcribe on this device instead; it covers the right-click menu, the panel button, and the automatic transcription after a recording ends, so Credits are never held without your confirmation.',
            },
            {
                zh: '快速打开（⌘P）、AI 对话里的文件引用、事项文件选择器等六处文件列表，之前只看得到项目根目录；现在都能搜到全项目的文件，从对话里按名字打开文件也会优先匹配根目录的同名文件。',
                en: 'Quick Open (Cmd+P), file references in AI chat, the task file picker, and three other file lists used to see only the project root; they now search the whole project, and opening a file by name from a chat prefers the root-level match.',
            },
            {
                zh: '编辑器一批细节修复：xlsx 表格可以直接打字了；在访达里改名已打开的文档后，编辑器会跟着新文件名保存，不再分出两份；导出 PDF 会提示完成并存到项目目录；审阅面板的「全部接受 / 全部拒绝」只作用于当前筛选出的修订；版本记录的完整历史页去掉了 Git 术语和哈希。',
                en: 'A batch of editor fixes: you can type directly into xlsx cells; renaming an open document in Finder is picked up, so saving no longer creates a second file under the old name; exporting to PDF confirms completion and saves into the project folder; "Accept All" and "Reject All" in the review panel apply only to the changes you filtered; and the full version history no longer shows Git jargon or hashes.',
            },
        ],
    },
    {
        version: '0.49.0',
        date: '2026-09-24',
        headline: {
            zh: '弹窗不再误改文档；文件夹与重命名更可靠；设置页与提示统一',
            en: 'Dialogs no longer leak keystrokes into your document; folders and renames are reliable; a unified Settings page and notifications',
        },
        items: [
            {
                zh: '版本详情、管理标签等弹窗打开时，按 Tab 或继续打字不会再把文字写进背后的文档；新建的文档里你的修订现在署你的名字，审阅面板「我」筛选能看到它们。',
                en: 'With a dialog open (version details, tag manager, and others), pressing Tab or typing no longer lands in the document behind it; in a newly created document your tracked changes are now attributed to you, and the "Me" filter in the review panel shows them.',
            },
            {
                zh: '本地文件夹项目里新建的空文件夹不会再莫名出现在回收站，恢复后也不会再次消失；选中文件夹再点「新建文档」，文档会落进该文件夹。文件重命名后，标签页、窗口标题、底栏和 AI「当前文档」立即同名。',
                en: 'In local-folder projects, empty folders you create no longer turn up in the recycle bin or vanish again after being restored; creating a document with a folder selected now places it inside that folder. After a rename, tabs, the window title, the status bar, and the AI\'s "current document" update at once.',
            },
            {
                zh: '原生菜单「文件 → 导出为 PDF」与工具栏 PDF 图标现在真的会导出并弹出保存窗口；内置浏览器打不开网址时会说明原因并提供重试，不再一片空白。',
                en: 'The native File → Export as PDF menu and the toolbar PDF button now actually export and open a save dialog; when the built-in browser cannot reach a site, it explains why and offers a retry instead of showing a blank page.',
            },
            {
                zh: '设置页各分项统一为同一套紧凑布局，与插件广场侧栏一致；全应用的提示条（已删除、报错、加载中）收敛成同一种浅色样式，不再有黑底、绿底两种并存；充值弹窗里输入的金额清楚可见。',
                en: 'Every section of Settings now shares one compact layout matching the plugin marketplace sidebar; notifications across the app (deleted, errors, loading) use a single light style instead of two competing dark and green ones; the amount you type in the top-up dialog is clearly visible.',
            },
            {
                zh: '诉讼可视化：时间轴导出 PPTX 时事件卡片不再互相遮挡，标题不再压在卡片上；尽调插件在主体清单为空或没有文件命中时会当场提示，不再入库成功后才在章节里报错。',
                en: 'Litigation visuals: timeline PPTX exports no longer have overlapping event cards or a title covering them; the due-diligence plugin now warns immediately when the party list is empty or matches no files, instead of failing later inside a chapter.',
            },
        ],
    },
    {
        version: '0.48.0',
        date: '2026-09-23',
        headline: {
            zh: '国际站登录修好；AI 遇到不明确的要求先问你再动手',
            en: 'International sign-in fixed, and the AI now asks before acting on an unclear request',
        },
        items: [
            {
                zh: '国际站（workdeck.ai）桌面端登录：验证码发送卡在「发送中」、收不到邮件的问题已修复；人机验证平时不会跳出验证框，看不到是正常状态。',
                en: 'Desktop sign-in on the international site (workdeck.ai): the verification code no longer gets stuck on "sending" or fails to arrive; human verification does not normally pop up, so not seeing a challenge is expected.',
            },
            {
                zh: '登录页在「中国大陆」与「国际」之间切换时，整页语言跟随切换（国际站英文、大陆中文），一步到位不再刷新页面；手动选过语言的仍按你的选择显示。',
                en: 'Switching the sign-in page between "Mainland China" and "International" now switches the whole page\'s language with it (English for international, Chinese for mainland) in one step, with no reload; if you have manually chosen a language, that choice is kept.',
            },
            {
                zh: 'AI 对话遇到不够明确的要求（比如「能帮我清理一下这份文档吗」）会先给出几个选项问清楚再动手，不再自行猜测大范围改动；指令明确时照旧直接执行，Office/WPS 任务窗格同样支持。',
                en: 'When a request to the AI is not specific enough (for example, "can you clean up this document"), it now asks a few clarifying questions with options before acting, instead of guessing at a broad edit; clear instructions are still carried out directly, and the same applies in the Office/WPS task pane.',
            },
            {
                zh: '编辑器正文里的「AI 审校」浮球收起后会留一截把手贴在边缘，点一下就能展开，不会再找不回来；Windows 深色模式下，右上角的最小化、最大化、关闭按钮也跟着变深。',
                en: 'The floating "AI review" button in the editor now collapses to an edge handle instead of disappearing, so a single click brings it back; on Windows, the minimize, maximize, and close buttons in the top-right corner now follow dark mode too.',
            },
        ],
    },
    {
        version: '0.47.0',
        date: '2026-09-23',
        headline: {
            zh: '登录页重做，国际站开放；模型选择器标明实付价',
            en: 'A rebuilt sign-in page with the international site enabled, and real prices in the model picker',
        },
        items: [
            {
                zh: '桌面端登录页重做：登录与注册合为一步，可在国内站与国际站账号之间切换，国际站的人机验证也已接通。',
                en: 'The desktop sign-in page has been rebuilt: signing in and signing up are one step, you can switch between China and international accounts, and human verification on the international site now works end to end.',
            },
            {
                zh: '模型选择器直接标出每个模型的实付价格，并按价位分档排列，选模型时心里有数。',
                en: 'The model picker now shows what each model actually costs and groups them by price tier, so you know what you are choosing.',
            },
            {
                zh: 'AI 往表格里新增行时沿用原有格式，不再出现新行的字体、边框与上文不一致的情况。',
                en: 'When the AI adds rows to a table, they inherit the existing formatting, so a new row no longer breaks the font or borders of the rows above it.',
            },
            {
                zh: 'AI 改动文档后的提示写明改的是哪一份文件，点开即到，不再笼统显示「当前文档」。',
                en: 'After the AI edits a document, the notice names the exact file and opens it directly, instead of a generic "current document".',
            },
            {
                zh: '应用内的对话框与操作菜单统一了外观，中英文字体也一并理顺。',
                en: 'Dialogs and action sheets across the app now share one look, and Chinese and English typography has been tidied up.',
            },
        ],
    },
    {
        version: '0.46.0',
        date: '2026-09-20',
        headline: {
            zh: 'AI 对话大改造：会话导航、从此分叉、有据续写',
            en: 'A major AI chat overhaul — session navigation, forking mid-conversation, and evidence-grounded writing suggestions',
        },
        items: [
            {
                zh: '新增「有据续写」：选中案卷里已核实的材料，AI 给出的续写建议会标出材料来源，插入前可以预览，一键还可撤销。',
                en: 'A new "grounded continuation" feature drafts from vetted project material, shows where each suggestion comes from, and lets you preview or undo the insertion.',
            },
            {
                zh: 'AI 对话新增会话导航：可以在长对话里快速跳转到之前的某条追问，也可以从任意一条回复重新分叉出新的讨论，不影响原有记录。',
                en: 'Chat conversations now support quick navigation between past turns, and you can branch a new discussion from any earlier reply without disturbing the original thread.',
            },
            {
                zh: '对话可以 @ 引用案卷里的合同、证据或笔记，当前文档和历史附件都会带入上下文；长对话的加载和翻看明显更快。',
                en: 'Use @ to bring a contract, piece of evidence, or note from the case file directly into a chat, along with the current document and earlier attachments; long conversations now load and scroll noticeably faster.',
            },
            {
                zh: 'AI 现在能对 PDF 按页操作（旋转、删除、提取等），也能在 Excel 表格里批量查找替换；点「停止」能让 AI 立刻停下来，回复下方会显示用了什么工具、花了多久。',
                en: 'The AI can now operate on individual PDF pages (rotate, delete, extract, and more) and do bulk find-and-replace in Excel; Stop now actually stops the AI immediately, and each reply shows which tools it used and how long it took.',
            },
            {
                zh: '全站配色换新（东方清雅体系）；Office/WPS 插件支持跨文件参照与跨文档修改，登录新增邮箱验证码方式。',
                en: 'A refreshed color theme across the app; the Office/WPS add-in can now reference other open files and edit across documents, and sign-in adds an email verification-code option.',
            },
        ],
    },
    {
        version: '0.45.0',
        date: '2026-09-15',
        headline: {
            zh: '交稿流程更明确；脱敏识别覆盖统一社会信用代码与执业证号',
            en: 'A clearer handoff flow, plus broader redaction coverage for registration and license numbers',
        },
        items: [
            {
                zh: '点「交稿」会先看到当前状态和三步说明，不会在没有改动时误报「已交稿」。',
                en: 'Submitting your work now shows the current status and a three-step confirmation first, instead of misreporting a submission when nothing changed.',
            },
            {
                zh: '团队协作中，首次上传项目会先问是否愿意使用真实项目名，拒绝的话只上传匿名编号，保护客户信息。',
                en: 'The first time a project is shared with your team, you are asked whether to use its real name; declining uploads only an anonymous ID, protecting client information.',
            },
            {
                zh: '多人协作时，同一个人在不同分支上的修改会被识别为一人并合并计数；修订记录的作者不再出现「未知作者」。',
                en: "A collaborator's edits across different branches are now recognized as one person instead of being double-counted, and revision authorship no longer shows as unknown.",
            },
            {
                zh: '脱敏功能新增统一社会信用代码、执业证号等号码规则识别，浏览失败时会给出明确的退出提示。',
                en: 'Redaction now recognizes unified social credit codes, practicing license numbers, and similar identifiers, with a clear message when a scan fails.',
            },
            {
                zh: 'AI 深入审校临时失败时，服务器会自动重试一次并给出失败原因，不用自己再点一次。',
                en: 'If deep review fails momentarily, the server now retries automatically once and reports why, instead of making you try again.',
            },
        ],
    },
    {
        version: '0.44.0',
        date: '2026-09-15',
        headline: {
            zh: 'AI 回复过程可视化；关键卡片常驻定位入口',
            en: "See the AI's thinking and actions as they happen, plus a persistent locator for items awaiting your response",
        },
        items: [
            {
                zh: 'AI 回复改为按时间顺序展示思考、执行和正文，处理过程看得更清楚。',
                en: 'AI replies now show thinking, actions, and the final answer in the order they happened, making the process easier to follow.',
            },
            {
                zh: '长文档处理、AI 请求超时和会议转写失败时的重试逻辑更稳，减少半途卡住的情况。',
                en: 'Retry handling for long documents, AI request timeouts, and failed meeting transcriptions is more resilient, with fewer cases of getting stuck midway.',
            },
            {
                zh: '需要你回答或审批的 AI 卡片新增常驻定位入口，不会因为对话往下滚动而找不到。',
                en: "AI cards awaiting your answer or approval now have a persistent locator, so they won't get lost as the conversation scrolls down.",
            },
            {
                zh: '项目名过长时，顶部栏改为省略显示，常用操作按钮仍然可以点。',
                en: 'A long project name is now truncated in the top bar while the usual action buttons remain reachable.',
            },
        ],
    },
    {
        version: '0.43.0',
        date: '2026-09-14',
        headline: {
            zh: '律师版三方合并；提交历史一目了然',
            en: 'A three-way merge built for lawyers, plus a clear commit history',
        },
        items: [
            {
                zh: '修复上一版编辑器的几个问题：中文输入法候选条误触发、表格内打不进字、误触快捷键关闭所有标签页。',
                en: 'Fixed several editor regressions from the previous release: a Chinese input method glitch, an inability to type inside tables, and a shortcut that closed every tab.',
            },
            {
                zh: '新增提交历史标签页：像看代码版本记录一样，查看案卷里谁在什么时候改了什么。',
                en: "A new commit history tab lets you see who changed what and when in a case file, much like a code repository's history.",
            },
            {
                zh: '新增律师版三方合并：多人各自修改后，不冲突的部分自动合并，冲突处再逐处选择保留哪一版，并能看到每段改动的来源。',
                en: "A new three-way merge for lawyers automatically combines non-conflicting edits from multiple collaborators, lets you decide conflict by conflict which version to keep, and shows where each passage came from.",
            },
            {
                zh: '交稿前会弹出「结束工作→取回最新稿→交稿」三步引导并说明协作机制，避免误操作覆盖别人的修改。',
                en: 'Before submitting, a three-step guide — finish working, pull the latest draft, then submit — walks you through the collaboration flow so you do not overwrite someone else\'s edits.',
            },
        ],
    },
    {
        version: '0.42.0',
        date: '2026-09-13',
        headline: {
            zh: '头像昵称实时同步；PPT 导出改走本机引擎',
            en: 'Instant avatar and name sync, plus PPT export now runs on a local engine',
        },
        items: [
            {
                zh: '头像、昵称改了之后桌面端立刻同步显示，不用重启应用。',
                en: 'Changing your avatar or display name now shows up on the desktop immediately, with no restart needed.',
            },
            {
                zh: '断网时 AI 对话会在 2 秒内提示网络异常，不再无声卡住。',
                en: 'If the network drops, the AI chat now flags the problem within two seconds instead of hanging silently.',
            },
            {
                zh: '修复中文输入法候选还没确认就被当作正常打字的问题，输入更准确。',
                en: 'Fixed a case where an unconfirmed Chinese input method candidate was treated as finished text, making typing more accurate.',
            },
            {
                zh: '即时审校时页面不会再被自动拉回光标位置，滚动更顺畅。',
                en: 'The page no longer snaps back to the cursor during live review, making scrolling smoother.',
            },
            {
                zh: 'PPT 可编辑导出改用本机引擎处理，不再需要额外的云端授权。',
                en: 'Editable PPT export now runs on a local engine and no longer requires a separate cloud authorization.',
            },
        ],
    },
    {
        version: '0.41.0',
        date: '2026-09-11',
        headline: {
            zh: '审阅体验对齐 Word 原生',
            en: 'Track changes and review now feel like native Word',
        },
        items: [
            {
                zh: '文档修订换用全新审阅引擎，批注和修改建议的呈现方式更接近 Word 的原生体验。',
                en: 'Document review now runs on a new engine, so comments and suggested edits look and feel closer to native Word.',
            },
            {
                zh: '修复上一版中文输入确认和右键菜单的问题。',
                en: 'Fixed Chinese input confirmation and right-click menu issues from the previous release.',
            },
        ],
    },
    {
        version: '0.40.0',
        date: '2026-09-11',
        headline: {
            zh: '中文姓名自动脱敏；AI 回复分层展示',
            en: 'Automatic Chinese name redaction and a clearer, layered AI reply view',
        },
        items: [
            {
                zh: '中文姓名脱敏改为默认自动识别（基于常见姓氏和上下文规则），不用再逐个手动输入姓名。',
                en: 'Chinese name redaction now detects names automatically by default, using common surnames and context rules, instead of requiring you to enter each name by hand.',
            },
            {
                zh: 'AI 回复分层展示：思考、执行过程和正式回复分开呈现，可以固定查看进度。',
                en: "The AI's thinking, actions, and final reply are now shown as separate layers, with a pinned view of progress.",
            },
            {
                zh: '修订批注气泡改到页面外侧显示，滚动定位更准，减少原生阅读异常。',
                en: 'Revision comment bubbles now sit outside the page margin with more accurate scroll positioning, reducing native rendering glitches.',
            },
            {
                zh: '语音合成的英文音色不再需要联网下载模型。',
                en: 'The English text-to-speech voice no longer needs to download a model over the network.',
            },
        ],
    },
    {
        version: '0.39.0',
        date: '2026-09-10',
        headline: {
            zh: '全新脱敏 2.0 引擎：本地识别、可复敏、默认不上传',
            en: 'A new redaction engine — local detection, reversible tokens, and no background uploads by default',
        },
        items: [
            {
                zh: '新增脱敏 2.0 引擎：本地识别公司名，支持预览、补充敏感词和保留词，普通条款保持可读；人名仍由你自己填写完整词语。',
                en: 'A new 2.0 redaction engine detects company names locally, with previews and custom sensitive/preserved terms, while keeping ordinary text readable; personal names are still entered by hand.',
            },
            {
                zh: 'DOCX 和文本文件脱敏后默认使用统一编号，另存一份加密的复敏文件和密码，编辑副本后可以一键复原；PDF 的涂黑和星号处理不可逆，使用前请留意。',
                en: 'Redacted DOCX and text files use consistent tokens by default, with a separately encrypted recovery file and password so you can restore them after editing a copy; PDF blackout and asterisk modes are irreversible, so use them with care.',
            },
            {
                zh: '桌面端默认关闭导入和保存后的自动 AI 打标签，避免脱敏前的原文被后台悄悄发送出去。',
                en: 'Automatic AI tagging on import and save is now off by default, preventing unredacted text from being sent out in the background.',
            },
            {
                zh: '修复旧版本显示「补丁已完成」却仍在使用旧后端的问题，程序启动时会确认补丁真的生效。',
                en: 'Fixed an issue where the app reported a patch as applied while still running the old backend; startup now confirms the patch actually took effect.',
            },
        ],
    },
    {
        version: '0.38.0',
        date: '2026-09-09',
        headline: {
            zh: '本地写作补全与即时审校；AI 对话新增记忆与任务队列',
            en: 'Local writing completion and live review, plus AI chat memory and task queuing',
        },
        items: [
            {
                zh: '本地写作补全：输入机构、人名、法规条款、案号或常用表述的开头，从候选中选择，按 Tab 补全；项目和个人词库会越用越准，也可以关闭学习或清空已学内容。',
                en: 'Local writing completion: type the start of an organization, person, law/article, case number, or a recurring phrase, pick a suggestion, and press Tab to complete it; project and personal vocabularies improve with use, and learning can be disabled or cleared.',
            },
            {
                zh: '资料提示与插入：认出案卷里的主体后可以查看已有资料，并插入正文或表格；查外部数据库需要主动选中文字点一下，结果先预览再插入，不会一边打字一边偷偷联网查。',
                en: 'Contextual information: once a known entity is recognized, you can review its saved information and insert it into text or a table; external lookups require an explicit selection and a click, with a preview before insertion — typing alone never triggers a background query.',
            },
            {
                zh: '即时审校：写作时就能看到编号、待填内容、金额算式、统一社会信用代码等本地检查提示，AI 深入审校只在点击「深入审校」时才会调用。',
                en: 'Live review: local checks for numbering, placeholders, arithmetic, and identifiers like unified social credit codes appear while you write; AI-powered deep review only runs when you click it.',
            },
            {
                zh: 'AI 对话新增分层记忆和任务队列：AI 会记住之前交代过的重点，执行长任务时可以随时插话调整，多个任务会排队依次处理。',
                en: 'AI chat now keeps layered memory and a task queue: it remembers what you told it earlier, lets you interject while it works on a long task, and processes multiple tasks in order.',
            },
            {
                zh: 'PPT、PDF 转换、语音合成等大体积组件改成按需下载，安装包更小；协作邀请与头像昵称显示改为以官网账户为准，改了就同步。',
                en: 'Large components such as PPT generation, PDF conversion, and speech synthesis now download on demand, shrinking the installer; collaboration invites and your avatar/display name now follow your website account and sync automatically.',
            },
        ],
    },
    {
        version: '0.37.0',
        date: '2026-09-09',
        headline: {
            zh: '工作台细节打磨；能力包按需安装',
            en: 'Workbench polish and on-demand capability packages',
        },
        items: [
            {
                zh: '资源管理器统一走本机文件路径，拖入文件更可靠。',
                en: 'Explorer file imports now consistently use local file paths, making drag-and-drop more reliable.',
            },
            {
                zh: '修复编辑器工具栏对齐错位、查找浮层闪黑、标签页未按文件类型着色等问题。',
                en: 'Fixed editor toolbar misalignment, a black flash in the search overlay, and workbench tabs not coloring by file type.',
            },
            {
                zh: '新增能力包安装与切换功能，已安装的资源包有更新时会主动提示。',
                en: 'Added capability-package installation and switching, with proactive update notifications for installed packages.',
            },
            {
                zh: '团队版新增使用统计入口；生成的文档可以选择关闭 AI WorkDeck 的应用标识。',
                en: 'Added a team usage statistics view, and generated documents can now have the AI WorkDeck application marker turned off.',
            },
        ],
    },
    {
        version: '0.36.0',
        date: '2026-09-07',
        headline: {
            zh: '修复保存失败循环、未保存提醒；诉讼可视化图形编辑更稳',
            en: 'Save-loop fixes, unsaved-change warnings, and steadier diagram editing',
        },
        items: [
            {
                zh: '修复保存失败后反复重试卡住的问题；关闭窗口或离开页面前，如果有未保存的内容会先提醒你。',
                en: 'Fixed saves getting stuck in a retry loop after a failure, and added a warning before you close a window or leave a page with unsaved changes.',
            },
            {
                zh: '会议纪要里的表格能正常导入了，AI 回答里的排版内容也可以直接插入文档。',
                en: 'Tables now import correctly into meeting notes, and formatted content in AI replies can be inserted directly into a document.',
            },
            {
                zh: '录音过程中如果没有声音会有提示，麦克风的默认选择也更准确了。',
                en: 'You now get a heads-up if a recording is silent, and the default microphone is chosen more reliably.',
            },
            {
                zh: '诉讼可视化图形在切换样式前会先确认是否覆盖已做的手动调整，画布也会正确刷新；同时修复了导出图片文字缺失、默认文件名和旧版关系图标签的问题。',
                en: 'Litigation visualization now confirms before a style change overwrites your manual edits and refreshes the canvas correctly, alongside fixes for missing text in exported images, default export names, and legacy relationship labels.',
            },
            {
                zh: '新建的 Word 文件会保留兼容格式；清除项目符号、设置正文居中现在都能正确生效。',
                en: 'New Word files now keep a compatible format, and removing bullet lists or centering paragraphs works correctly.',
            },
        ],
    },
    {
        version: '0.35.0',
        date: '2026-09-05',
        headline: {
            zh: '一批稳定性修复：文件、依据检索、文档写入更可靠',
            en: 'Stability pass: steadier files, evidence search, and document writes',
        },
        items: [
            {
                zh: 'AI 面板里的宽表格不再被裁掉，可以左右滑动看完整内容。',
                en: 'Wide tables in the AI panel no longer get cut off — scroll sideways to see the rest.',
            },
            {
                zh: '文件上传被中断后，底部状态栏不会再谎称还在上传。',
                en: 'If an upload is interrupted, the status bar no longer falsely claims it is still uploading.',
            },
            {
                zh: '依据检索遇到账户或额度问题时，会直接提示去连接账户或充值，不再一直空转重试。',
                en: 'When evidence search hits an account or quota problem, it now points you to connect an account or top up, instead of silently retrying.',
            },
            {
                zh: '让 AI 整理文件时，现在可以一次批量移动多个文件。',
                en: 'Asking the AI to organize files now supports moving several files in one batch.',
            },
            {
                zh: 'AI 写入文档、表格或新建文件失败时不再悄无声息；新建文档还能直接指定放进哪个文件夹。',
                en: 'If the AI fails while writing to a document or sheet, or creating a file, it no longer fails silently — and new documents can be created directly inside a chosen folder.',
            },
        ],
    },
    {
        version: '0.34.0',
        date: '2026-09-05',
        headline: {
            zh: '整篇校对提速；项目版本记录默认开启；案件库邀请同事',
            en: 'Faster whole-document proofreading, version history by default, and case-library invites',
        },
        items: [
            {
                zh: '在 Word 里让 AI「校对错别字与病句」整篇文档时不再卡在原地不动：现在按段落推进，任务窗格能看到进度。',
                en: 'Asking the AI to proofread an entire Word document no longer stalls — it now moves through the document section by section, with progress shown in the task pane.',
            },
            {
                zh: '项目版本记录改为默认开启，不用再手动打开；不需要留痕时可以随时关闭并清除历史。',
                en: 'Project version history is now on by default, with no manual setup needed, and you can turn it off and clear it at any time.',
            },
            {
                zh: '案件库支持零配置直接连接官方云端，还能按手机号邀请同事加入案件协作。',
                en: 'The case library now connects to the official cloud with zero setup, and you can invite colleagues to a case by phone number.',
            },
            {
                zh: '把电脑里的文件拖进项目目录时会直接复制进去；上传失败也不会再留下一个空白的占位文件。',
                en: 'Dragging a file from your computer into a project folder now copies it in directly, and a failed upload no longer leaves a blank placeholder.',
            },
        ],
    },
    {
        version: '0.33.0',
        date: '2026-09-02',
        headline: {
            zh: '文件右键发送微信；多处稳定性修复',
            en: 'Send files to WeChat, and several stability fixes',
        },
        items: [
            {
                zh: '文件右键新增「发送」：macOS 上直接调出系统分享面板发到微信，Windows 上复制到剪贴板方便转发。',
                en: 'Right-click a file to Send: on macOS it opens the system share sheet straight to WeChat; on Windows it copies the file for you to paste elsewhere.',
            },
            {
                zh: '修复任务清单更新会报错、标签页跟着左侧栏一起消失的问题。',
                en: 'Fixed the task list failing to save updates, and tabs disappearing along with the sidebar.',
            },
            {
                zh: '修复依据面板里企查查检索失败、部分图片读取不出来的问题。',
                en: 'Fixed company-lookup searches failing in the evidence panel, and some images not loading.',
            },
        ],
    },
    {
        version: '0.32.0',
        date: '2026-09-02',
        headline: {
            zh: '合同审查工作流；修订三态切换；审阅面板升级',
            en: 'Contract review workflow, three-way revision views, and an upgraded review pane',
        },
        items: [
            {
                zh: '新增合同审查工作流：AI 会按结构核对合同条款是否齐全。',
                en: 'New contract review workflow: the AI checks a contract’s structure for missing clauses.',
            },
            {
                zh: '修订显示新增三种视图——全部修订、简洁标记、最终稿，随时切换查看。',
                en: 'Tracked changes now have three views — full markup, simplified marks, and a clean final draft — switchable anytime.',
            },
            {
                zh: '审阅面板做成 Word 式的审阅窗格：作者、类型、理由和处置意见联动显示。',
                en: 'The review pane is now Word-style, linking author, type, reasoning, and disposition together.',
            },
            {
                zh: 'AI 修改长段落时不再整段删除重写，批注定位也更准。',
                en: 'The AI no longer deletes and rewrites an entire long paragraph just to edit part of it, and comment anchors land more accurately.',
            },
            {
                zh: 'App 内新增注销账号功能，可以删除账号并清空云端全部数据。',
                en: 'The app now supports deleting your account from within it, removing all your data from the cloud.',
            },
        ],
    },
    {
        version: '0.31.0',
        date: '2026-09-01',
        headline: {
            zh: '安装器多处修复；邮箱登录合并为一步',
            en: 'Installer fixes and a streamlined email sign-in',
        },
        items: [
            {
                zh: '邮箱登录合并了注册与登录，国际版此前缺注册入口的问题解决了。',
                en: 'Email sign-in now combines registration and login in one step, fixing the missing sign-up entry in the international version.',
            },
            {
                zh: '安装器新增磁盘空间检查，空间不够会提前拦下，不会装到一半才失败。',
                en: 'The installer now checks disk space upfront, so it stops early instead of failing partway through.',
            },
            {
                zh: '修好了安装器右上角的关闭按钮，点了能真正退出。',
                en: 'Fixed the installer’s close button — clicking it now actually quits.',
            },
            {
                zh: '点击「立即安装」后，安装器会正确收进角落显示进度，不再像是卡住了。',
                en: 'After clicking Install Now, the installer properly minimizes to a corner progress card instead of appearing to freeze.',
            },
            {
                zh: '修复英文界面下变量库与版本记录里的署名仍显示中文的问题。',
                en: 'Fixed names still showing in Chinese in the variable library and version history when using the English interface.',
            },
        ],
    },
    {
        version: '0.30.0',
        date: '2026-09-01',
        headline: {
            zh: 'Windows 一键安装重做；双架构合并；稳定性加固',
            en: 'Redesigned Windows installer, a unified x64/ARM64 package, and stability fixes',
        },
        items: [
            {
                zh: 'Windows 安装体验重新设计为一键安装，并修复了 Windows on ARM 设备启动死循环的问题。',
                en: 'Redesigned Windows setup into a one-click install and fixed a startup loop on Windows-on-ARM devices.',
            },
            {
                zh: 'Windows 装机包合并成一份，同时支持 x64 与 ARM64 处理器。',
                en: 'The Windows installer is now a single package that supports both x64 and ARM64 processors.',
            },
            {
                zh: '修复应用首次启动可能卡死、断线后界面残留、英文界面文案缺失的问题。',
                en: 'Fixed the app occasionally hanging on first launch, leftover UI after a disconnect, and missing text in the English interface.',
            },
        ],
    },
    {
        version: '0.29.0',
        date: '2026-08-31',
        headline: {
            zh: '安装流程重新设计；插件绑定桌面项目',
            en: 'Redesigned installers and plugin-to-desktop project binding',
        },
        items: [
            {
                zh: '安装流程重新设计：Windows 品牌向导、macOS 安装包更稳，插件安装器也同步上线。',
                en: 'Redesigned the install flow with a branded Windows wizard, a sturdier macOS installer, and matching installers for the add-in.',
            },
            {
                zh: '官网下载改走 CDN 直连，速度更稳定。',
                en: 'Website downloads now go through a CDN for steadier speeds.',
            },
            {
                zh: '插件里选择项目会绑定桌面端的项目归档，对话记录和文档在桌面与插件之间互通。',
                en: 'Picking a project in the add-in now ties to its desktop case file, mirroring conversations and documents between the two.',
            },
        ],
    },
    {
        version: '0.28.0',
        date: '2026-08-30',
        headline: {
            zh: '插件多窗格会话隔离；断线自动续传',
            en: 'Isolated add-in sessions across panes, with automatic reconnect',
        },
        items: [
            {
                zh: '在 Word 与 PowerPoint（或 WPS 文字与演示）里同时打开插件窗格时，对话不会再互相抢断，答案也不会消失到一半。',
                en: 'Opening the add-in in Word and PowerPoint (or their WPS equivalents) at the same time no longer breaks each other’s conversation, and replies no longer vanish partway through.',
            },
            {
                zh: '网络波动断线后，插件对话能自动接上，不会漏掉内容。',
                en: 'If the connection drops, the add-in’s conversation now reconnects automatically without losing content.',
            },
            {
                zh: '修复表格列宽调整时会把列悄悄压没、却还显示成功的问题。',
                en: 'Fixed a table column-width change that could silently collapse columns to zero width while still reporting success.',
            },
        ],
    },
    {
        version: '0.27.0',
        date: '2026-08-28',
        headline: {
            zh: '浅色深色双主题；WPS 加载项全面上线；AI 看懂图片',
            en: 'Light/dark themes, a full WPS add-in launch, and AI that reads your images',
        },
        items: [
            {
                zh: '新增浅色、深色双主题，账户入口也合并得更清爽。',
                en: 'Added light and dark themes, and merged the account entry points for a cleaner look.',
            },
            {
                zh: '手机拍的照片和录音可以中转同步到桌面：统一3GB空间、30天有效期；在资源管理器里右键录音文件就能直接转写。',
                en: 'Photos and recordings from your phone can now relay to the desktop, with a shared 3GB quota and a 30-day window — right-click a recording in the file explorer to transcribe it directly.',
            },
            {
                zh: 'WPS 加载项全面上线：在 WPS 文字、表格、演示里都能直接用 AI WorkDeck。',
                en: 'The WPS add-in is now fully available — use AI WorkDeck directly inside WPS Writer, Spreadsheets, and Presentation.',
            },
            {
                zh: 'AI 对话现在能直接看懂你发的图片，不再只靠文字识别。',
                en: 'The AI can now understand images you send directly, instead of relying only on text recognition.',
            },
            {
                zh: '修复 WPS 插件里多处会让你看到错误结果的问题，比如表格与演示内容定位不准、格式修订过多。',
                en: 'Fixed several issues in the WPS add-in that could show incorrect results, including inaccurate positioning in tables and presentations, and excessive formatting revisions.',
            },
        ],
    },
    {
        version: '0.26.0',
        date: '2026-08-27',
        headline: {
            zh: '会员计费体系；依据面板核对法条与数字；面板自由停靠',
            en: 'In-app billing and membership tiers, a new Basis panel, and free-form panel docking',
        },
        items: [
            {
                zh: '新增「依据」面板：自动识别文中出现的公司、法规、判决书，点开就能看到企业信息、法条原文、判决内容，不用再切出去查。',
                en: 'A new Basis panel recognizes the companies, statutes, and court decisions mentioned in a document — click through to see company details, the full text of a statute, or the judgment itself without leaving the page.',
            },
            {
                zh: '新增一致性校验：同一主体同一数字前后矛盾时会被标出来，可以一键统一，以「修订」形式写入，能在审阅面板里接受或拒绝。',
                en: 'A new consistency check flags contradictory figures for the same entity across a document, with a one-click fix that lands as a tracked revision to accept or reject in Review.',
            },
            {
                zh: '变量库、收藏夹、剪贴板、语音、依据这些面板现在能自由拖到左侧栏、右侧或底部停靠，按自己的习惯摆放；AI 对话输入框也重新做了视觉设计。',
                en: 'Panels for the variable library, favorites, clipboard, voice, and Basis can now be dragged to the left rail, the right side, or the bottom to match how you work; the AI chat composer has also been redesigned.',
            },
            {
                zh: '应用内充值与会员体系上线：顶栏可见余额，微信扫码或信用卡直接在应用（含 Office 插件）里充值，按累计消费与充值升级律师职级，等级越高充值赠送比例越高。',
                en: 'In-app top-ups and membership tiers have arrived: a balance shows in the top bar, recharge by WeChat or card without leaving the app or the Office add-in, and spending or topping up raises your tier, with better bonus rates at higher tiers.',
            },
            {
                zh: '企查查新增知识产权检索工具；AI 执行任务时的过程展示也更容易看懂了。',
                en: 'Qichacha lookups now cover intellectual property records, and the AI now shows its step-by-step progress more clearly.',
            },
        ],
    },
    {
        version: '0.25.0',
        date: '2026-08-24',
        headline: {
            zh: 'Office 插件任务窗格大改版；诉讼可视化新增时间轴生成',
            en: 'A redesigned Office add-in task pane, and automatic case timelines',
        },
        items: [
            {
                zh: 'Office 插件任务窗格大改版：新增计划卡、定位、批注、附件、会话管理，并支持中英双语切换。',
                en: 'The Office add-in task pane has been rebuilt, adding plan cards, source positioning, annotations, attachments, and session management, in both Chinese and English.',
            },
            {
                zh: 'Office 插件新增语音听写，说话就能输入。',
                en: 'The Office add-in now supports voice dictation — speak instead of typing.',
            },
            {
                zh: '诉讼可视化集成「时间轴大师」：拿到原始材料就能直接生成案件时间轴。',
                en: 'Litigation visualization now includes Timeline Master, turning raw case materials straight into a timeline.',
            },
            {
                zh: '官方版的外部服务（OCR、语音、企查查等）默认统一走平台代采，不用再自己配置。',
                en: 'In the official build, external services such as OCR, voice, and Qichacha are now provisioned by the platform by default, with no configuration needed.',
            },
            {
                zh: '修复插件发消息偶尔被锁死、证据链接建立失败没有提示、拖拽建证据链接在部分内嵌页面里失灵等问题。',
                en: 'Fixed the add-in occasionally locking up when sending a message, evidence links failing silently on error, and drag-to-link not working inside some embedded pages.',
            },
        ],
    },
    {
        version: '0.24.0',
        date: '2026-08-23',
        headline: {
            zh: '尽调报告模块上线；证据链接与底稿定位',
            en: 'The due diligence module arrives, with evidence links and source positioning',
        },
        items: [
            {
                zh: '新增「证据链接」：把文件或引文拖进文档就能建立到原始材料的链接，写作时随时点开定位到证据出处。',
                en: 'A new evidence link feature: drag a file or a quote into a document to link it to the source material, then jump straight to that source at any time while writing.',
            },
            {
                zh: '审阅面板新增「证据」页与「底稿」页：前者看文中每处陈述链接了哪些材料，后者按章节浏览底稿、按状态筛选并显示置信度与引文；改动过的正文会被标记为与证据不一致，提醒复核。',
                en: 'The Review panel gains an Evidence tab, showing which materials back each statement, and a Source Documents tab for browsing by chapter with status filters, confidence, and citations; edited text that no longer matches its evidence is flagged for a second look.',
            },
            {
                zh: '新增勾稽核查：自动比对陈述内容与底稿材料的关键要素，帮你发现两边对不上的地方。',
                en: 'A new cross-check automatically compares statements against the underlying materials and surfaces where they disagree.',
            },
            {
                zh: '底稿定位更精准：PDF 引文自带定位卡片，图片画框会跟着旋转角度走，音视频材料能停在具体那一帧。',
                en: 'Source positioning is more precise: PDF citations come with locator cards, image highlights follow the page rotation, and audio or video can freeze on the exact frame.',
            },
            {
                zh: '尽调交付件可以直接导出：底稿目录、查验计划、缺口清单一键生成。',
                en: 'Due diligence deliverables can be exported directly — a source document catalog, a verification plan, and a gap list, all in one click.',
            },
        ],
    },
    {
        version: '0.23.0',
        date: '2026-08-21',
        headline: {
            zh: '稳定性审计上线；AI「假成功」与脱敏遗漏修复',
            en: 'A major stability audit, fixing false AI success and redaction gaps',
        },
        items: [
            {
                zh: '修复多处「AI 悄悄失败却报成功」的问题：常见的几十类工具失败此前会被误判成功，AI 声称已保存文件其实没有写入，编辑段落时也可能因编号错位而改错地方。',
                en: 'Fixed several cases where the AI silently failed but reported success — dozens of common tool failures were misread as succeeding, a file the AI claimed to save was never actually written, and an off-by-one paragraph count could make it edit the wrong passage.',
            },
            {
                zh: '修复可能丢内容的风险：切换项目、返回列表或退出登录时不再静默丢弃刚编辑的内容；压缩历史消息时也不再误删最后一段正文。',
                en: 'Fixed several ways edits could quietly disappear: switching projects, returning to the project list, or signing out no longer discards what was just typed, and compressing chat history no longer drops the last paragraph.',
            },
            {
                zh: '补齐脱敏遗漏：PDF 中被换行拆开的敏感字串、DOCX 的页眉页脚现在也在脱敏扫描范围内；同时修正了把案号、快递单号误判成身份证或银行卡号而错误打码的问题。',
                en: 'Closed redaction gaps: sensitive strings split across a line break in PDFs, and headers and footers in Word documents, are now scanned too; case numbers and tracking numbers are no longer mistaken for ID or bank card numbers and blacked out by mistake.',
            },
            {
                zh: '修复设置里选了「仅本地」仍会把内容发去云端模型的问题，本地模式现在名副其实。',
                en: 'Fixed content still being sent to a cloud model even after choosing a local-only setting — local mode now actually stays local.',
            },
            {
                zh: '修复回收站还原后文件消失、批量删除吞掉失败提示、录音中断后仍显示录音中等多处细节问题。',
                en: 'Fixed files disappearing after being restored from the recycle bin, bulk deletes hiding failures, and a recording still showing as in progress after it was interrupted.',
            },
        ],
    },
    {
        version: '0.22.0',
        date: '2026-08-20',
        headline: {
            zh: '日历与任务系统上线；手机端项目镜像',
            en: 'Calendar and tasks arrive, plus mobile project mirroring',
        },
        items: [
            {
                zh: '新增日历视图与任务系统：日程和待办直接在工作台里管理。',
                en: 'A new calendar view and task system make it possible to manage a schedule and to-dos right inside the workbench.',
            },
            {
                zh: '手机端支持镜像项目目录、把现场拍摄的影像即时传回项目，并可绑定手机号认领账号。',
                en: 'The mobile companion can now mirror project folders, send photos and video shot on-site straight into the project, and claim an account by phone number.',
            },
            {
                zh: '新增标签维度：可以给文件打上「当事人」「争议焦点」这类标签，检索更快。',
                en: 'New tag types make it possible to label files by party or by disputed issue, so they are easier to find later.',
            },
            {
                zh: '新增轻量文本编辑器，打开 txt/md 文件不再走沉重的文档引擎。',
                en: 'A new lightweight editor opens .txt and .md files without loading the full document engine.',
            },
            {
                zh: '一批稳定性修复：文档加载结果不再被静默丢弃、会议录音的麦克风选择与提示卡片视觉修好、项目列表与版本记录弹窗也按用户反馈改版。',
                en: 'A round of reliability fixes: a late-arriving document load no longer gets silently dropped, the microphone picker and notice card in meeting recording look right again, and the project list and version history popup were reworked based on user feedback.',
            },
        ],
    },
    {
        version: '0.21.0',
        date: '2026-08-19',
        headline: {
            zh: '版本记录图形化；登录更持久',
            en: 'A graphical version history, and longer-lived logins',
        },
        items: [
            {
                zh: '修复 DMG 升级后「AI 对话历史消失」的问题——数据其实一直都在，只是有个显示故障读不出来。',
                en: 'Fixed AI chat history appearing to vanish after a macOS update — the data was always there; only the display had a bug reading it back.',
            },
            {
                zh: '修复会议录音在没有人声的短录音上报错的问题，现在会给出提示并保留重试；也修复了某些 PDF 会让整体搜索失败、殃及其他文件搜不到的问题。',
                en: 'Fixed meeting recording reporting an error on short recordings with no speech — it now shows a clear message with a retry option; also fixed certain PDFs breaking search entirely and hiding results from other files.',
            },
            {
                zh: '版本记录改成图形化时间线，一眼看清楚哪些修改被采纳合并、哪些还在草稿分支上，界面不再出现 Git 术语。',
                en: 'Version history is now a graphical timeline, showing at a glance which edits were merged in and which are still on a draft branch, with no Git jargon in sight.',
            },
            {
                zh: '登录状态默认保持一年，不用像以前那样频繁重新登录；Office 插件也有了独立安装包，并完成签名与公证，安装时不会被系统拦截。',
                en: 'Logins now stay valid for a year by default, reducing how often sign-in is needed; the Office add-in also gets its own signed and notarized installer, so it will not be flagged on install.',
            },
            {
                zh: '脱敏功能改成按需从应用广场安装，默认不占用空间，与诉讼可视化的做法一致。',
                en: 'Redaction is now an optional install from the plugin marketplace, taking no space until needed — the same approach used for litigation visualization.',
            },
        ],
    },
    {
        version: '0.20.0',
        date: '2026-08-19',
        headline: {
            zh: '侧栏与登录页重做；诉讼可视化更稳定',
            en: 'A reworked sidebar and login page, and steadier litigation visualization',
        },
        items: [
            {
                zh: '左侧导航重排，项目概览常驻在小面板里；设置与个人中心移到右上角头像下拉，打开后是独立的标签页。',
                en: 'The left navigation was reorganized, with the project overview now always visible in a compact panel; Settings and the profile page moved under the avatar menu in the top right and open as their own tab.',
            },
            {
                zh: '语音合成与会议录音合并进同一个「语音」入口，用分页切换，减少功能太分散的问题。',
                en: 'Voice synthesis and meeting recording were merged into a single Voice entry with tabs, instead of being scattered across separate places.',
            },
            {
                zh: '诉讼可视化更稳定：修复了指引偶发消失、图表打不开的问题；生成的图表默认可以在应用里直接编辑。',
                en: 'Litigation visualization is steadier: fixed guidance occasionally disappearing and charts failing to open, and generated charts are now editable in the app by default.',
            },
            {
                zh: 'AI 对话里，需要你确认的操作单独做成「待确认」卡片；重复的工具调用记录会自动折叠，不再刷屏。',
                en: 'In AI chat, actions awaiting approval now get their own pending card, and repeated tool calls collapse automatically instead of flooding the log.',
            },
        ],
    },
    {
        version: '0.19.0',
        date: '2026-08-18',
        headline: {
            zh: 'Office 插件账户登录；项目列表信息更丰富',
            en: 'Account login for the Office add-in, and a richer project list',
        },
        items: [
            {
                zh: 'Office 插件登录方式改为手机号/邮箱账号直登，不用再手动粘贴 Key（进阶设置里仍保留这个入口）。',
                en: 'The Office add-in now signs in directly with a phone number or email instead of pasting an access key (that option still exists under advanced settings).',
            },
            {
                zh: '国际版桌面端新增邮箱验证码登录。',
                en: 'The international desktop build adds email verification-code login.',
            },
            {
                zh: '项目列表新增档案信息：客户名称常显，其余字段收进「详情」里按需展开。',
                en: 'The project list now shows profile fields — the client name stays visible, with the rest tucked into an expandable details section.',
            },
            {
                zh: '修复顶部栏点击无响应的问题，补上登出入口，项目列表新增两种视图。',
                en: 'Fixed the top bar not responding to clicks, added a sign-out option, and gave the project list two view modes.',
            },
            {
                zh: '修复登录成功后不跳转、验证滑块只能用一次的问题；官方版下线 Key 登录方式，统一走账号登录。',
                en: 'Fixed a successful login not redirecting and the CAPTCHA slider only working once; the official build has also retired key-based login in favor of account login.',
            },
        ],
    },
    {
        version: '0.18.0',
        date: '2026-08-18',
        headline: {
            zh: '外部服务统一计费；手机号登录；会议录音更稳',
            en: 'Unified billing for external services, phone login, and steadier meeting recording',
        },
        items: [
            {
                zh: '首次启动只需选一个 AI 提供商即可开始工作，其余外部服务（语音、OCR、企查查、Tushare、法宝等）由平台统一采购计费，不必自己申请、粘贴各家的 API Key。',
                en: 'The first-run wizard now only asks for one AI provider — other services such as voice, OCR, Qichacha, Tushare, and Faobao are provisioned and billed by the platform, with no need to sign up for and paste in an API key for each one.',
            },
            {
                zh: '新增手机号验证码登录；官方版从此都要用账号登录，不再支持试用码解锁。',
                en: 'Added phone verification-code login; the official build now requires signing in with an account, and no longer accepts a trial code to unlock.',
            },
            {
                zh: '会议录音更稳：转写失败不会无限期卡住，上传前会提前告知，还能设置花费上限。',
                en: 'Meeting recording is steadier: a failed transcription no longer gets stuck indefinitely, there is a heads-up before a recording uploads, and spending can be capped.',
            },
            {
                zh: '语音合成换成本机引擎，不再经过云端；英文界面下的会议录音面板也修好了显示中文的问题。',
                en: 'Voice synthesis now runs on-device instead of in the cloud, and the meeting recording panel no longer shows Chinese text when the interface is set to English.',
            },
            {
                zh: '修复网页版未登录时反复刷新、切换浏览器标签再切回来内容丢失等问题。',
                en: 'Fixed the web version reloading endlessly when signed out, and content disappearing when switching away from a browser tab and back.',
            },
        ],
    },
    {
        version: '0.17.0',
        date: '2026-08-16',
        headline: {
            zh: '自定义标题栏与菜单栏；桌面细节修复',
            en: 'A custom title bar and menu bar, plus desktop fixes',
        },
        items: [
            {
                zh: '隐藏系统默认标题栏，菜单栏按 AI WorkDeck 的实际功能重新组织，不再是 Electron 的默认菜单。',
                en: 'The default system title bar is now hidden, and the menu bar has been rebuilt around real AI WorkDeck commands instead of the default Electron menu.',
            },
            {
                zh: '修复 Mac 应用坞里应用名显示成「Electron」的问题。',
                en: 'Fixed the app showing up as Electron in the Mac dock instead of its real name.',
            },
            {
                zh: '修复项目文件夹放在 iCloud 云盘时，文件监听会把整个 iCloud 云盘目录都读一遍的问题。',
                en: 'Fixed file watching scanning an entire iCloud Drive when a project folder happened to live there.',
            },
            {
                zh: '修复离开工作台后菜单栏残留高亮、点击没反应的问题。',
                en: 'Fixed menu bar items staying highlighted and unresponsive after leaving the workbench.',
            },
        ],
    },
    {
        version: '0.16.0',
        date: '2026-08-15',
        headline: {
            zh: '中英双语界面；会议录音转写；文档编辑器自建工具栏',
            en: 'Bilingual interface, meeting transcription, and a rebuilt editor toolbar',
        },
        items: [
            {
                zh: '全应用支持简体中文与 English：界面、文档编辑器、AI 回复与工具过程都会跟随你在设置里选的语言。装一个包即可，不需要下载英文版。',
                en: 'The whole application now speaks Simplified Chinese and English: interface, document editor, AI replies, and tool activity all follow the language you pick in Settings. One installer — there is no separate English download.',
            },
            {
                zh: '英文界面下的 AI 助手按国际商事与通用法律语境工作，不预设某一法域的法条。',
                en: 'In English, the AI assistant works in an international commercial and general legal context, without presuming any single jurisdiction.',
            },
            {
                zh: '新增会议录音插件：录音自动转写、区分说话人、生成会议纪要。',
                en: 'New meeting recording plugin: automatic transcription, speaker separation, and AI-drafted minutes.',
            },
            {
                zh: '文档编辑器换成自建工具栏：常用命令直接可点，新增表格操作、脚注尾注、页眉页脚。',
                en: 'The document editor moves to a purpose-built toolbar: common commands are one click away, plus table operations, footnotes and endnotes, and headers and footers.',
            },
            {
                zh: '修掉 AI 在需要调用工具时可能整整三分钟没有反应的问题（传输层错误被吞，只能等超时兜底）。',
                en: 'Fixed a case where the AI could sit unresponsive for three minutes when it needed to call a tool (a transport error was being swallowed, leaving only the timeout to recover).',
            },
        ],
    },
    {
        version: '0.15.0',
        date: '2026-08-14',
        headline: {
            zh: '官网下载走境内镜像；AI 长任务更稳',
            en: 'Mainland mirror for downloads; steadier long AI runs',
        },
        items: [
            {
                zh: '官网下载改走境内镜像直链，不再需要访问 GitHub。',
                en: 'Downloads now come from a mainland mirror instead of requiring GitHub access.',
            },
            {
                zh: 'AI 长任务的额度不足、上下文超窗等情况有了明确提示，不再只是失败。',
                en: 'Long AI runs now explain quota exhaustion and context overflow instead of just failing.',
            },
        ],
    },
    {
        version: '0.14.0',
        date: '2026-08-09',
        headline: {
            zh: '项目概览页；诉讼可视化',
            en: 'Project overview page; litigation visualization',
        },
        items: [
            {
                zh: '新增项目概览页：一页看完档案、统计、动态、日程与历史对话。',
                en: 'New project overview page: profile, statistics, activity, schedule, and past conversations on one page.',
            },
            {
                zh: '诉讼可视化：时间轴、流程图、当事人关系图。',
                en: 'Litigation visualization: timelines, flowcharts, and party relationship maps.',
            },
        ],
    },
];

export const LATEST_RELEASE_NOTE = RELEASES[0];
