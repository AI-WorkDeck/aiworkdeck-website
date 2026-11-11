/**
 * aiworkdeck.us 展示主体的验证脚本（同一个国际站进程按 Host 换页脚与公司页的主体）。
 *
 * 与其他 verify-*.mts 同一套路：直接 import 被测模块，不起 next 服务。
 * 本脚本**不碰数据库**，所以在仓库根目录直接跑也行；CI 里仍与其他脚本一样
 * 在空目录里执行，两站各跑一遍（NEXT_PUBLIC_AWD_SITE=cn / intl）。
 *
 *   NEXT_PUBLIC_AWD_SITE=intl npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-us-entity.mts
 *
 * 守住三件事：
 * 1. Host 匹配的边界（大小写、端口、子域、以及 `evil-aiworkdeck.us` 这类近似域不许命中）；
 * 2. 国内站构建**永远**不返回美国主体——那种情况只可能是反代配错；
 * 3. 法律文本的缔约主体仍是香港公司。这条是整件事的红线：页脚换名是展示，
 *    换缔约主体是单方面替换合同当事人。
 */
import assert from 'assert';

let passed = 0;
function ok(msg: string) {
    passed += 1;
    console.log(`  ✓ ${msg}`);
}

const {
    SITE_ID,
    siteConfig,
    siteConfigOf,
    isUsHost,
    publicEntityForHost,
    INTL_US_LEGAL_ENTITY,
    US_SITE_ORIGIN,
} = await import('@/lib/site-config');

console.log(`\n[0] 站点 = ${SITE_ID}`);

// ===========================================================================
console.log('\n[1] 美国主体的字段就是公开记录上的那几项');
// ===========================================================================
{
    const e = INTL_US_LEGAL_ENTITY;
    assert.strictEqual(e.nameEn, 'Zhen Shan Mei Grace Legacy US Limited');
    // 特拉华州的登记没有中文名。空串是有意的，不是漏填——页面据此跳过中文名那一行。
    assert.strictEqual(e.nameZh, '', '美国主体没有中文法定名称，必须是空串');
    assert.strictEqual(e.registrationNo, '10745170');
    assert.strictEqual(e.registrationLabel.en, 'Delaware File Number');
    assert.strictEqual(e.registrationLabel.zh, '特拉华州公司档案编号');
    assert.strictEqual(e.incorporatedOn, '2026-08-24');
    assert.strictEqual(e.contactEmail, 'legal@aiworkdeck.us');
    assert.ok(e.registeredAddress.en.includes('8 The Green'), '注册办事处要能对上州务卿档案');
    assert.ok(e.registeredAddress.en.includes('Dover, DE 19901'));
    assert.ok(e.registeredAddress.zh.includes('特拉华州'));
    assert.strictEqual(US_SITE_ORIGIN, 'https://www.aiworkdeck.us');
    // 类型上就没有 forum / governingLaw——真有值说明有人把它当缔约主体用了
    assert.ok(!('forum' in e), '展示主体不得带争议解决机构');
    assert.ok(!('governingLaw' in e), '展示主体不得带适用法');
    ok('字段与特拉华州公开档案一致，且不含法律文本才用的字段');
}

// ===========================================================================
console.log('\n[2] isUsHost 的匹配边界');
// ===========================================================================
{
    for (const h of [
        'aiworkdeck.us',
        'www.aiworkdeck.us',
        'WWW.AIWORKDECK.US',
        'www.aiworkdeck.us:3000',
        'www.aiworkdeck.us.', // 带根点的 FQDN 写法
        '  www.aiworkdeck.us  ',
    ]) {
        assert.strictEqual(isUsHost(h), true, `应命中：${h}`);
    }
    for (const h of [
        'www.workdeck.ai',
        'workdeck.ai',
        'www.aiworkdeck.com',
        'localhost:3000',
        '127.0.0.1:3999',
        // 近似域：结尾像但不是子域，命中就等于让别人挂个域名冒充我们的主体页
        'evil-aiworkdeck.us',
        'aiworkdeck.us.evil.com',
        'aiworkdeck.use',
        null,
        undefined,
        '',
    ]) {
        assert.strictEqual(isUsHost(h), false, `不应命中：${String(h)}`);
    }
    ok('大小写 / 端口 / 根点 / 子域命中，近似域与空值不命中');
}

// ===========================================================================
console.log('\n[3] publicEntityForHost 按站点分叉');
// ===========================================================================
{
    const usHosts = ['aiworkdeck.us', 'www.aiworkdeck.us', 'WWW.AIWORKDECK.US:443'];
    const ownHosts = ['www.workdeck.ai', 'www.aiworkdeck.com', 'localhost:3000', null, ''];

    if (SITE_ID === 'intl') {
        for (const h of usHosts) {
            assert.strictEqual(publicEntityForHost(h), INTL_US_LEGAL_ENTITY, `intl / ${h}`);
        }
        for (const h of ownHosts) {
            assert.strictEqual(
                publicEntityForHost(h),
                siteConfig.legalEntity,
                `intl / ${String(h)} 应回落香港主体`
            );
        }
        assert.strictEqual(publicEntityForHost('www.workdeck.ai').nameEn, 'Zhen Shan Mei Grace Legacy Limited');
        ok('国际站：.us 主机给美国主体，其余给香港主体');
    } else {
        for (const h of [...usHosts, ...ownHosts]) {
            assert.strictEqual(
                publicEntityForHost(h),
                siteConfig.legalEntity,
                `cn / ${String(h)} 必须给本站主体`
            );
        }
        assert.notStrictEqual(publicEntityForHost('www.aiworkdeck.us'), INTL_US_LEGAL_ENTITY);
        ok('国内站：无论什么 Host 都只给本站主体（.us 的 Host 只可能是反代配错）');
    }
}

// ===========================================================================
console.log('\n[4] 法律文本的缔约主体不受影响');
// ===========================================================================
{
    const hk = siteConfigOf('intl').legalEntity;
    const { termsIntlEn } = await import('@/content/legal/terms-intl-en');
    const { termsIntlZh } = await import('@/content/legal/terms-intl-zh');
    const { privacyIntlEn } = await import('@/content/legal/privacy-intl-en');
    const { privacyIntlZh } = await import('@/content/legal/privacy-intl-zh');

    for (const [name, doc] of Object.entries({ termsIntlEn, termsIntlZh, privacyIntlEn, privacyIntlZh })) {
        const text = JSON.stringify(doc);
        // 这四份文本插的是**当前构建**的 siteConfig.legalEntity（见各文件顶部的 `const E`），
        // 所以「写着香港主体」只有在国际站构建下成立；cn 构建下它们插的是北京主体，
        // 那种情况这几个模块本来也不会被渲染。美国主体则是任何构建下都不许出现。
        if (SITE_ID === 'intl') {
            assert.ok(text.includes(hk.nameEn), `${name} 必须写着香港主体`);
        }
        assert.ok(
            !text.includes(INTL_US_LEGAL_ENTITY.nameEn),
            `${name} 不得出现美国主体——那是单方面替换缔约主体`
        );
        assert.ok(
            !text.includes(INTL_US_LEGAL_ENTITY.registrationNo),
            `${name} 不得出现特拉华州档案编号`
        );
    }
    ok(
        SITE_ID === 'intl'
            ? '四份国际站法律文本仍以香港公司为缔约主体'
            : '四份国际站法律文本里不含美国主体'
    );
}

// ===========================================================================
console.log('\n[5] 公司页文案：两份、两个登记机关，措辞不越界');
// ===========================================================================
{
    const { ABOUT_COPY, ABOUT_COPY_US, DE_REGISTRY_URL, HK_REGISTRY_URL } = await import(
        '@/content/about/company'
    );
    assert.notStrictEqual(DE_REGISTRY_URL, HK_REGISTRY_URL);
    assert.ok(DE_REGISTRY_URL.startsWith('https://icis.corp.delaware.gov/'), '查册入口必须是州务卿的域名');

    for (const lang of ['en', 'zh'] as const) {
        const us = ABOUT_COPY_US[lang];
        const hk = ABOUT_COPY[lang];
        assert.ok(us.people.length === 1 && us.people[0].role.includes('Incorporator'));
        const usText = JSON.stringify(us);
        // 公开档案上只有发起人，没有董事同意书——写「董事 / director」就是登了查不到的头衔
        assert.ok(!/\bdirector\b/i.test(usText), `ABOUT_COPY_US.${lang} 不得称董事`);
        assert.ok(!usText.includes('董事'), `ABOUT_COPY_US.${lang} 不得称董事`);
        assert.ok(
            usText.includes(lang === 'en' ? 'Delaware' : '特拉华州'),
            `ABOUT_COPY_US.${lang} 要点明特拉华州`
        );
        assert.ok(!usText.includes('ICRIS'), `ABOUT_COPY_US.${lang} 不该指向香港查册中心`);
        // 香港那份反过来也不许被污染
        const hkText = JSON.stringify(hk);
        assert.ok(!hkText.includes('Delaware'), `ABOUT_COPY.${lang} 不该提特拉华州`);
        assert.ok(!hkText.includes('特拉华州'), `ABOUT_COPY.${lang} 不该提特拉华州`);
    }
    ok('美国文案只提发起人与特拉华州，香港文案未被污染');
}

console.log(`\n全部通过：${passed} 项`);
