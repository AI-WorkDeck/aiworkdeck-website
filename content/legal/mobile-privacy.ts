import { mobileAssistantPrivacy } from './mobile-assistant-privacy';
import type { Locale } from '@/i18n-config';
import { toBaseLocale } from '@/i18n-config';
import { SITE_ID, siteConfig } from '@/lib/site-config';
import type { LegalDocument } from './types';

/** Mobile services, with explicitly scoped Android implementation details. */
export function mobilePrivacyLinks(lang: Locale) {
    return toBaseLocale(lang) === 'zh' ? {
        related: '相关隐私说明',
        deletion: '手机账户与数据删除',
        general: '网站及桌面端隐私政策',
        mobile: mobileAssistantPrivacy[lang].mobileTitle,
        other: `${siteConfig.otherSite.labelZh}手机隐私政策`,
    } : {
        related: 'Related privacy resources',
        deletion: 'Mobile account and data deletion',
        general: 'Website and desktop Privacy Policy',
        mobile: mobileAssistantPrivacy[lang].mobileTitle,
        other: `${siteConfig.otherSite.labelEn} mobile Privacy Policy`,
    };
}

export function mobilePrivacy(lang: Locale): LegalDocument {
    const assistant = mobileAssistantPrivacy[lang];
    const zh = toBaseLocale(lang) === 'zh';
    const intl = SITE_ID === 'intl';
    const e = siteConfig.legalEntity;
    const name = zh ? e.nameZh : e.nameEn;
    const region = intl ? (zh ? '新加坡' : 'Singapore') : (zh ? '中国大陆' : 'mainland China');
    const response = intl ? (zh ? '一个月内' : 'within one month') : (zh ? '十五个工作日内' : 'within fifteen working days');

    if (zh) return {
        eyebrow: '隐私与数据',
        title: assistant.mobileTitle,
        effectiveLabel: assistant.effective,
        intro: assistant.mobileIntro.replace('{operator}', name),
        highlightsTitle: '请先了解',
        highlights: [
            '你拍摄的照片、视频和录音先保存在手机应用内；选定项目归档时，再通过加密连接上传至所选服务区域的中转服务器，供你的桌面端接收。未选项目的快速采集先在本地暂存。',
            '定位权限可拒绝。安卓应用将拍摄地点写入手机本地的归档记录；当前现场采集流程不将该定位记录随媒体上传。我们不进行持续后台定位。',
            '中转副本在桌面端确认接收后删除；未接收内容按 30 天中转期限清理。你另行开启的持久文件备份不适用该中转期限。',
            '你可以在应用设置中申请注销，也可以通过本页链接，在没有安装应用时申请删除账户及关联数据。注销不会远程删除手机或电脑中由你保存的文件。',
        ],
        tocTitle: '目录',
        sections: [
            { id: 'operator', title: '一、运营者与适用区域', blocks: [
                { type: 'p', text: assistant.platformDifferences },
                { type: 'p', text: `本服务运营者及个人信息处理者为 ${name}（${e.nameEn}），注册编号 ${e.registrationNo}，联系邮箱 ${e.contactEmail}。服务基础设施位于${region}。` },
                { type: 'p', text: `应用允许选择中国区或国际区。中国区由北京京微资易科技有限公司运营，国际区由 Zhen Shan Mei Grace Legacy Limited 运营，两区账户和存储相互独立。本页对应${intl ? '国际区' : '中国区'}；切换区域时，应同时查阅该区域政策。` },
            ] },
            { id: 'data', title: '二、处理哪些信息及用途', blocks: [
                { type: 'table', head: ['使用场景', '信息与处理方式', '用途'], rows: [
                    ['账户与登录', '你输入的邮箱或适用登录方式下的手机号、密码或验证码；账户标识、登录会话及必要账户资料。账户注册或密码重设在对应官网完成。', '验证身份、保持登录、恢复账户及关联你的项目。'],
                    ['拍照、录像、录音', '你主动采集的照片、视频、录音及文件名、文件类型、拍摄时间、项目与设备标识；采集文件保存于应用内，选定项目归档时上传中转。', '将现场资料送达你选择的项目，并展示上传和接收状态。'],
                    [assistant.androidRecordsLabel, '文件 SHA-256 指纹、拍摄时间、设备型号、系统版本，以及获准后读取的经纬度和精度，保存在手机本地归档记录中。', '供你查看资料来源与文件完整性；当前安卓上传流程不发送该本地定位记录。'],
                    ['项目与文件访问', '项目名称和标识、文件名称和目录信息、文件大小、传输请求及你主动获取的文件内容；已开启云备份的文件可从云端访问。', '展示项目、请求电脑传送文件、预览或下载已获授权的文件。'],
                    ['设备与服务运行', '应用生成的随机设备标识、请求时间、IP 地址、请求路径及处理状态。该设备标识不是 IMEI 或广告标识。', '区分设备、避免重复传输、保护服务及排查故障。'],
                    ['用量与支持', '存储或传输用量、与账户关联的余额及必要计费记录；你主动提供的反馈和联系方式。', '显示服务用量、结算已使用的服务、处理咨询和删除申请。'],
                ] },
                { type: 'p', text: '账户验证和文件传输是提供你请求的服务所必需的处理；可选定位等处理以你的选择和系统权限为基础。拒绝定位不影响拍摄和传输。不提供某项功能必需的数据时，该功能可能无法使用。请仅采集、上传你有权处理的资料。' },
            ] },
            { id: 'permissions', title: assistant.androidPermissionsTitle, blocks: [
                { type: 'ul', items: [
                    '相机：用于你主动拍摄照片或视频。麦克风：用于主动录音及录像收声。',
                    '位置：获准后在采集时获取精确或大致位置，写入本地归档信息；可在系统设置中关闭。',
                    '通知与前台服务：用于显示上传状态，以及在你主动开始录音后切换应用或锁屏时继续录音。录音期间显示持续通知，你可停止录音。',
                    '相册：“同时存入系统相册”设置默认开启，可在设置中关闭；开启时采集会创建相册副本，主动导出也会创建副本。应用不扫描你已有的个人相册。',
                    '应用不读取通讯录、短信、通话记录、系统日历或 IMEI，也不包含广告或第三方行为分析 SDK。',
                ] },
            ] },
            { id: 'recipients', title: '四、信息接收方与跨境情形', blocks: [
                { type: 'p', text: `文件和账户请求通过 HTTPS 传往你所选区域的服务。${intl ? '国际区由香港主体运营，服务器和对象存储位于新加坡。' : '中国区服务器和对象存储位于中国大陆。'} 阿里云提供基础设施与文件存储；适用的短信、邮件服务商为账户验证传送你请求的验证码或账户通知。服务商仅为提供这些服务处理必要信息。` },
                { type: 'p', text: '收件桌面端必须与你的账户或授权项目对应。我们不公开你的现场资料，不出售个人信息，不将上述手机采集内容用于广告或模型训练；照片、录音与文件访问本身不会触发向 AI 模型提供商发送内容。' },
                { type: 'p', text: '你在所在地以外选择服务区域时，账户和上传文件会传至该区域。国内、国际服务不是同一数据存储库。我们依适用法律处理必要的跨境手续，并在需要时另行取得同意；法律要求的披露、争议处理或企业重组中的转移将限于必要范围。' },
            ] },
            { id: 'retention', title: '五、保存期限与删除范围', blocks: [
                { type: 'table', head: ['信息', '保存与删除'], rows: [
                    ['手机及电脑上的文件', '由你控制，账户注销不会远程擦除这些文件。你可以自行删除、清除应用存储，或在备份必要资料后卸载应用。系统相册和导出目录中的副本需另行删除。'],
                    ['中转文件', '桌面端确认接收后删除中转副本；未接收项目达到30天后由定时任务清理。对象存储设35天生命周期作为失败清理的兜底。'],
                    ['持久云备份', '仅在你开启相关备份功能后保存，不按中转期限自动到期。删除备份、撤回备份授权或注销账户后进入清理流程；存储服务暂时失败时保留删除任务重试。'],
                    ['账户与手机服务记录', '保存至注销或处理目的不再存在。注销清理手机账户、会话、设备与项目目录关联、传输请求、中转内容，并处理绑定的官网账户；持久备份可能异步清理。'],
                    ['依法保留记录', '为安全、争议处理、税务或会计义务所必需的记录保留至相应期限，随后删除或匿名化；不会继续用于日常账户服务。具体账户和交易保留规则见对应区域的通用隐私政策。'],
                ] },
                { type: 'p', text: '注销如因待退款余额、未结算事项或服务暂不可用而未完成，界面会提示原因。请通过下方账户删除指引联系我们处理，不必以继续使用应用为条件。' },
            ] },
            { id: 'rights', title: '六、你的选择与权利', blocks: [
                { type: 'p', text: `你可申请查阅、更正、复制或删除个人信息、撤回同意、限制处理，以及按适用法律申请数据转移或提出投诉。请联系 ${e.contactEmail}；我们通常在${response}回复。我们会核验账户归属，但不会要求提供密码或登录验证码。` },
                { type: 'p', text: '应用内路径：设置 → 注销账号。没有安装应用、无法登录或希望仅删除部分云端数据时，可使用本页的“账户与数据删除”链接发起请求。删除账户会终止相关账户服务，请提前保存需要保留的资料。' },
            ] },
            { id: 'protection', title: '七、安全、未成年人及更新', blocks: [
                { type: 'p', text: assistant.sessionStorage },
                { type: 'p', text: assistant.security },
                { type: 'p', text: '本应用面向成年专业用户，不面向18岁以下未成年人。发现误收未成年人信息时，请联系上述邮箱。政策发生实质变化时，我们会说明变化并在法律要求时取得新的同意。' },
            ] },
            { id: 'assistant', title: assistant.title, blocks: [
                { type: 'p', text: assistant.capture.replace('{provider}', intl ? assistant.providerIntl : assistant.providerCn) },
                { type: 'p', text: assistant.processing.replace('{provider}', intl ? assistant.providerIntl : assistant.providerCn) },
                { type: 'p', text: assistant.retention },
                { type: 'p', text: assistant.report },
            ] },
        ],
    };

    return {
        eyebrow: 'Privacy and data',
        title: assistant.mobileTitle,
        effectiveLabel: assistant.effective,
        intro: assistant.mobileIntro.replace('{operator}', name),
        highlightsTitle: 'What to know first',
        highlights: [
            'Photos, videos and recordings are saved in the app. When you file them to a selected project, they are uploaded over an encrypted connection to that region’s relay service for delivery to your desktop. Quick captures without a project stay locally until you file them.',
            'Location permission is optional. Capture coordinates are kept in the phone’s local capture record; the current Android capture flow does not upload that location record with the media. There is no continuous background location tracking.',
            'Relay copies are removed after the desktop acknowledges receipt. Uncollected items have a 30-day relay retention period. Persistent file backup, which you enable separately, has a different retention rule.',
            'You can request account deletion in Settings or through the linked web resource without reinstalling the app. Account deletion does not remotely erase files you keep on your phone or computer.',
        ],
        tocTitle: 'Contents',
        sections: [
            { id: 'operator', title: '1. Operator and service region', blocks: [
                { type: 'p', text: assistant.platformDifferences },
                { type: 'p', text: `The operator and data controller is ${name}, registration number ${e.registrationNo}. Contact ${e.contactEmail}. Service infrastructure is located in ${region}.` },
                { type: 'p', text: `The app supports a choice of China or International service. Beijing Jingwei Ziyi Technology Co., Ltd. operates China service; Zhen Shan Mei Grace Legacy Limited operates International service. Their accounts and storage are separate. This page describes ${intl ? 'International' : 'China'} service; consult the other region’s notice if you select that region.` },
            ] },
            { id: 'data', title: '2. Data and purposes', blocks: [
                { type: 'table', head: ['Feature', 'Data and processing', 'Purpose'], rows: [
                    ['Account and sign-in', 'Email or, where offered, phone number; password or verification code; account identifiers, session credentials and necessary profile data. Registration and password reset use the selected region’s website.', 'Authenticate you, maintain your session, recover your account and associate your projects.'],
                    ['Photo, video and audio capture', 'The photos, videos and recordings you choose to capture, with file name, media type, capture time, project and device identifiers. Files are stored in the app and uploaded to the relay when filed to a selected project.', 'Deliver field material to your chosen project and show transfer status.'],
                    [assistant.androidRecordsLabel, 'SHA-256 file fingerprint, capture time, device model and OS version, and permitted location coordinates and accuracy, stored locally on the phone.', 'Show capture provenance and file integrity. The current Android upload flow does not send this local location record.'],
                    ['Projects and files', 'Project names and identifiers, file names, directory information, sizes, transfer requests and file contents you request; files covered by enabled cloud backup can be accessed from the cloud.', 'List your projects, request files from your computer and preview or download authorised files.'],
                    ['Device and service operation', 'An app-generated random device identifier, request time, IP address, request path and status. The identifier is not an IMEI or advertising ID.', 'Distinguish devices, prevent duplicate transfers, secure the service and diagnose faults.'],
                    ['Usage and support', 'Storage or transfer usage, account balance and necessary billing records; feedback and contact details you choose to provide.', 'Show usage, account for services used and handle support or deletion requests.'],
                ] },
                { type: 'p', text: 'Authentication and transfers are needed to provide the service you request. Optional processing such as location depends on your choice and device permission. Declining location does not prevent capture or transfer. A feature may be unavailable if you decline data necessary for it. Only capture and upload material you are authorised to handle.' },
            ] },
            { id: 'permissions', title: assistant.androidPermissionsTitle, blocks: [
                { type: 'ul', items: [
                    'Camera: photos and videos you initiate. Microphone: recordings and video sound you initiate.',
                    'Location: a permitted precise or approximate location at capture time for your local record. You can revoke permission in system settings.',
                    'Notifications and foreground services: transfer progress and continuation of a recording you started when you switch apps or lock the screen. Recording has a persistent notification and a stop action.',
                    'Photo library: saving captures to Photos is on by default and can be turned off in Settings. When enabled, capture creates a library copy; exporting also creates a copy. The app does not scan your existing photo library.',
                    'The app does not read contacts, SMS, call logs, system calendars or IMEI and contains no advertising or third-party behavioural analytics SDK.',
                ] },
            ] },
            { id: 'recipients', title: '4. Recipients and international transfers', blocks: [
                { type: 'p', text: `Files and account requests use HTTPS to reach the region you select. ${intl ? 'International service is operated from Hong Kong, with servers and object storage in Singapore.' : 'China service uses servers and object storage in mainland China.'} Alibaba Cloud provides hosting and file storage. Where used, SMS and email providers deliver verification or account messages you request, processing only the data needed for those services.` },
                { type: 'p', text: 'Delivery is to a desktop associated with your account or authorised project. We do not publish your captures, sell personal data or use these mobile captures for advertising or model training. Capture and project-file access do not themselves send content to AI model providers.' },
                { type: 'p', text: 'If you select a service region outside your location, your account requests and uploaded files are transferred there. The two regions are separate data stores. Applicable transfer requirements and any required separate consent still apply. Legally required disclosures, dispute handling and business transfers are limited to necessary information.' },
            ] },
            { id: 'retention', title: '5. Retention and deletion', blocks: [
                { type: 'table', head: ['Data', 'Retention and deletion'], rows: [
                    ['Files on your devices', 'You control these copies. Account deletion does not remotely erase them. Delete files or clear app storage yourself, or uninstall after saving anything you need. Copies in Photos or export folders must be removed separately.'],
                    ['Relay files', 'The relay copy is removed after the desktop acknowledges receipt. Uncollected items become eligible for scheduled cleanup after 30 days. Object storage has a 35-day lifecycle as a fallback for failed cleanup.'],
                    ['Persistent cloud backups', 'Stored only when the relevant backup function is enabled. These do not expire under the relay rule. Deleting backups, withdrawing backup permission or deleting the account queues cleanup; failed storage deletion is retried.'],
                    ['Account and mobile-service records', 'Retained while needed for your account. Account deletion clears the mobile account, sessions, device and project associations, transfer requests and relay contents, and processes the linked website account. Persistent backup cleanup can be asynchronous.'],
                    ['Required retained records', 'Records necessary for security, disputes, tax or accounting are retained for the applicable period and then deleted or anonymised; they are not used to continue everyday account services. The region’s general Privacy Policy gives account and transaction retention details.'],
                ] },
                { type: 'p', text: 'If refundable balances, unsettled matters or a service failure prevent deletion, the app explains the reason. Contact us through the account-deletion resource below to resolve it; continuing to use the app is not a condition for requesting deletion.' },
            ] },
            { id: 'rights', title: '6. Your choices and rights', blocks: [
                { type: 'p', text: `You may request access, correction, a copy, deletion, withdrawal of consent or restriction of processing, and portability or a complaint where applicable. Contact ${e.contactEmail}; we normally respond ${response}. We verify account ownership without asking for your password or login verification code.` },
                { type: 'p', text: 'In the app, open Settings and choose Delete account. If you no longer have the app, cannot sign in or want to request deletion of particular cloud data, use the Account and data deletion link on this page. Deleting an account ends related account services; save material you need first.' },
            ] },
            { id: 'protection', title: '7. Security, children and changes', blocks: [
                { type: 'p', text: assistant.sessionStorage },
                { type: 'p', text: assistant.security },
                { type: 'p', text: 'The app is intended for adult professionals and is not offered to people under 18. Contact us if a child’s information was provided in error. We explain material policy changes and obtain new consent where required.' },
            ] },
            { id: 'assistant', title: assistant.title, blocks: [
                { type: 'p', text: assistant.capture.replace('{provider}', intl ? assistant.providerIntl : assistant.providerCn) },
                { type: 'p', text: assistant.processing.replace('{provider}', intl ? assistant.providerIntl : assistant.providerCn) },
                { type: 'p', text: assistant.retention },
                { type: 'p', text: assistant.report },
            ] },
        ],
    };
}
