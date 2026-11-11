import { type Locale, toBaseLocale } from '@/i18n-config';
import { SITE_ID, siteConfig } from '@/lib/site-config';

export function mobileDeletionCopy(lang: Locale) {
    const zh = toBaseLocale(lang) === 'zh';
    const intl = SITE_ID === 'intl';
    const email = siteConfig.legalEntity.contactEmail;
    return {
        subject: zh ? 'AI WorkDeck 手机账户及关联数据删除申请' : 'AI WorkDeck mobile account and associated data deletion request',
        title: zh ? 'AI WorkDeck 手机账户与数据删除' : 'AI WorkDeck Mobile Account and Data Deletion',
        eyebrow: zh ? '隐私与数据' : 'Privacy and data',
        requestTitle: zh ? '不安装应用，也可以申请删除' : 'Request deletion without the app',
        requestBody: zh ? `发送邮件至 ${email}，主题注明“AI WorkDeck 手机账户及关联数据删除申请”。这一路径不要求你重新安装应用或登录官网。` : `Email ${email} with the subject “AI WorkDeck mobile account and associated data deletion request”. You do not need to reinstall the app or sign into the website.`,
        requestAction: zh ? '发送删除申请' : 'Email a deletion request',
        requestDetails: zh ? '请提供账户使用的邮箱或手机号，并注明中国区或国际区。我们会通过账户原有联系方式核验归属；不要发送密码、登录验证码、证件照片或项目原始材料。也可以说明仅希望删除哪些云端数据而保留账户。' : 'Identify the account email or phone number and whether you used China or International service. We verify ownership through your existing account contact. Do not send passwords, login codes, identity-document photos or project files. You may instead specify particular cloud data to delete while keeping your account.',
        response: zh ? `我们通常在${intl ? '一个月' : '十五个工作日'}内回复，核验后处理删除并告知结果；如需先处理余额、未结算事项或依法保留的记录，会说明原因和后续步骤。` : `We normally respond within ${intl ? 'one month' : 'fifteen working days'}, process the verified request and tell you the result. If balances, unsettled matters or legally retained records require further handling, we explain the reason and next steps.`,
        inAppTitle: zh ? '应用内注销' : 'Delete from the app',
        inAppBody: zh ? '打开 AI WorkDeck → 设置 → 注销账号，阅读影响说明并确认。退出登录或卸载应用不等于注销云端账户。若操作失败，可使用上面的邮件入口继续处理。' : 'Open AI WorkDeck → Settings → Delete account, read the consequences and confirm. Signing out or uninstalling does not delete your cloud account. If deletion fails, use the email option above.',
        scopeTitle: zh ? '删除什么，保留什么' : 'What is deleted and what remains',
        scopeMobile: zh ? '删除手机服务的账户身份、会话、设备与项目目录关联、传输请求及中转内容，并处理绑定的官网账户。持久云备份进入删除流程；存储清理失败时会重试，不将“排队清理”当作全部物理副本已经删除。' : 'Deletion covers mobile account identity, sessions, device and project associations, transfer requests and relay contents, and processes the linked website account. Persistent cloud backups enter cleanup; failed storage deletion is retried. Queued cleanup does not mean every physical copy is already erased.',
        scopeRetained: zh ? '依法必须保留的交易、税务、会计、安全及争议处理记录按适用期限保留，随后删除或匿名化。具体规则见对应区域的通用隐私政策。' : 'Transaction, tax, accounting, security and dispute records required by law remain for their applicable retention periods and are then deleted or anonymised. The region’s general Privacy Policy sets out the relevant rules.',
        scopeLocal: zh ? '手机本地原件、系统相册副本、导出文件以及已归档到电脑的文件由你控制，不会因云端账户注销而远程删除。清除应用存储或卸载前，请先保存需要保留的资料。' : 'Originals on your phone, copies in Photos, exported files and files already filed on your computer remain under your control; cloud account deletion does not remotely erase them. Save needed material before clearing app storage or uninstalling.',
        regionTitle: zh ? '选择正确的服务区域' : 'Use the correct service region',
        regionBody: zh ? `本页由${siteConfig.legalEntity.nameZh}提供，处理${intl ? '国际区' : '中国区'}请求。另一服务区域使用独立账户和存储；如你在两区都开有账户，请在申请中说明。` : `This page is provided by ${siteConfig.legalEntity.nameEn} for ${intl ? 'International' : 'China'} service. The other region has separate accounts and storage; tell us if your request concerns accounts in both regions.`,
        mobilePrivacyLink: zh ? '安卓应用隐私政策' : 'Android app Privacy Policy',
        generalPrivacyLink: zh ? '通用隐私政策及保留期限' : 'General Privacy Policy and retention periods',
        otherRegionLink: zh ? `${siteConfig.otherSite.labelZh}删除申请` : `${siteConfig.otherSite.labelEn} deletion requests`,
        operator: zh ? siteConfig.legalEntity.nameZh : siteConfig.legalEntity.nameEn,
    };
}
