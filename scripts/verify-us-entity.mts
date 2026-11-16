/**
 * Verify the shared company record across both builds and the US domain alias.
 * Run once with NEXT_PUBLIC_AWD_SITE=cn and once with intl; no database or network IO.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { i18n, type Locale } from '@/i18n-config';
import type { Dictionary } from '@/get-dictionary';
import {
    SITE_ID, siteConfig, siteConfigOf, isUsHost, publicEntityForHost,
    INTL_US_LEGAL_ENTITY, US_SITE_ORIGIN, LEGAL_EFFECTIVE_DATE,
} from '@/lib/site-config';
import { companyAboutCopy, CN_REGISTRY_URL, formatIncorporationDate } from '@/content/about/company';
import { mobilePrivacy } from '@/content/legal/mobile-privacy';
import type { LegalDocument } from '@/content/legal/types';

const nameZh = '北京公富信息技术有限公司';
const nameEn = 'BEIJING GONG FU INFORMATION TECHNOLOGY LIMITED';
const uscc = '911101053483482356';
const oldEntity = /京微|Jingwei|真善美|Zhen Shan|79530779|10745170|91110106MA003EM95R/;
let passed = 0;
function ok(label: string) { passed++; console.log(`  ✓ ${label}`); }

console.log(`Company entity validation: ${SITE_ID}`);
for (const entity of [siteConfigOf('cn').legalEntity, siteConfigOf('intl').legalEntity, INTL_US_LEGAL_ENTITY]) {
    assert.equal(entity.nameZh, nameZh);
    assert.equal(entity.nameEn, nameEn);
    assert.equal(entity.registrationNo, uscc);
    assert.equal(entity.registrationLabel.en, 'Unified Social Credit Code');
    assert.equal(entity.incorporatedOn, '2015-06-16');
    assert.equal(entity.registeredAddress.zh, '北京市朝阳区东三环中路1号1幢1单元15层1501内15单元');
    assert.equal(entity.legalRepresentative.zh, '李楠');
    assert.equal(entity.registrationAuthority.zh, '北京市朝阳区市场监督管理局');
}
assert.equal(siteConfigOf('cn').legalEntity.contactEmail, 'hi@aiworkdeck.com');
assert.equal(siteConfigOf('intl').legalEntity.contactEmail, process.env.NEXT_PUBLIC_AWD_INTL_CONTACT_EMAIL ?? 'hi@workdeck.ai');
assert.equal(INTL_US_LEGAL_ENTITY.contactEmail, 'legal@aiworkdeck.us');
assert.equal(US_SITE_ORIGIN, 'https://www.aiworkdeck.us');
assert.ok(!('forum' in INTL_US_LEGAL_ENTITY));
ok('All domains have Gong Fu registration details and retain their contact email');

for (const host of ['aiworkdeck.us', 'www.aiworkdeck.us', 'WWW.AIWORKDECK.US:443', ' www.aiworkdeck.us. ']) {
    assert.equal(isUsHost(host), true, host);
    assert.equal(publicEntityForHost(host), SITE_ID === 'intl' ? INTL_US_LEGAL_ENTITY : siteConfig.legalEntity);
}
for (const host of ['www.workdeck.ai', 'www.aiworkdeck.com', 'evil-aiworkdeck.us', 'aiworkdeck.us.evil.com', 'aiworkdeck.use', null, undefined, '']) {
    assert.equal(isUsHost(host), false, String(host));
    assert.equal(publicEntityForHost(host), siteConfig.legalEntity);
}
ok('Host matching preserves domain/contact routing without selecting an old company');

assert.deepEqual(LEGAL_EFFECTIVE_DATE, { cn: '2026-08-08', intl: '2026-08-08' });
assert.equal(siteConfigOf('cn').icpFiling, '京ICP备2024096997号-8');
assert.equal(siteConfigOf('intl').icpFiling, '');
assert.equal(siteConfigOf('cn').paymentChannel, 'wxpay');
assert.equal(siteConfigOf('intl').paymentChannel, 'stripe');
assert.equal(siteConfigOf('cn').legalEntity.forum.en, 'Beijing Arbitration Commission');
assert.equal(siteConfigOf('intl').legalEntity.forum.en, 'the Hong Kong International Arbitration Centre (HKIAC)');
assert.equal(siteConfigOf('intl').legalEntity.governingLaw.en, 'the laws of Hong Kong SAR');
ok('Original dates, filing values, payment routes and dispute provisions remain intact');

let legalCount = 0;
for (const lang of i18n.locales) {
    const dictionary = JSON.parse(fs.readFileSync(new URL(`../dictionaries/${lang}.json`, import.meta.url), 'utf8')) as Dictionary;
    const about = companyAboutCopy(dictionary, lang, siteConfig.legalEntity);
    assert.ok(about.intro.includes(lang === 'zh' || lang === 'zh-hant' ? nameZh : nameEn));
    assert.ok(!oldEntity.test(JSON.stringify(about)));
    assert.ok(!/\{company\}/.test(about.intro));
    assert.ok(formatIncorporationDate('2015-06-16', lang).length > 0);

    for (const region of ['', '-intl']) {
        for (const kind of ['terms', 'privacy']) {
            const module = await import(new URL(`../content/legal/${kind}${region}-${lang}.ts`, import.meta.url).href);
            const doc = Object.values(module).find((value): value is LegalDocument =>
                typeof value === 'object' && value !== null && 'sections' in value && 'intro' in value
            );
            assert.ok(doc, `${kind}${region}-${lang}: document exists`);
            const text = JSON.stringify(doc);
            assert.ok(!oldEntity.test(text), `${kind}${region}-${lang}: no old entity identifiers`);
            const section = doc.sections.find(s => s.id === (kind === 'terms' ? 'parties' : 'controller'));
            assert.ok(section);
            const first = JSON.stringify(section.blocks[0]);
            assert.ok(first.includes(nameEn) && first.includes(uscc), `${kind}${region}-${lang}: actual identity is populated`);
            assert.ok(!/Companies Ordinance|香港法例|Hong Kong|香港特别行政区/.test(first));
            assert.ok(doc.effectiveLabel.includes('2026-08-08') && doc.effectiveLabel.includes('2026-11-16'));
            assert.ok(!/\{__T_|\{(?:role|company|number|address|email|site|otherSite|date)\}/.test(text), `${kind}${region}-${lang}: placeholders resolved`);
            if (region && kind === 'privacy') {
                const cross = doc.sections.find(s => s.id === 'cross-border');
                assert.ok(cross);
                assert.ok(!/Hong Kong SAR \(controller\)|香港特别行政区（控制者）/.test(JSON.stringify(cross.blocks.slice(0, 2))));
            }
            legalCount++;
        }
    }
    const mobile = JSON.stringify(mobilePrivacy(lang as Locale, dictionary));
    assert.ok(mobile.includes(nameEn) && mobile.includes(uscc));
    assert.ok(!oldEntity.test(mobile));
    assert.ok(!/operated from Hong Kong|香港主体运营/.test(mobile));
}
assert.equal(CN_REGISTRY_URL, 'https://www.gsxt.gov.cn/');
ok(`All ${i18n.locales.length} company/mobile locales and ${legalCount} legal documents resolve the new company`);

const page = fs.readFileSync(new URL('../app/[lang]/about/page.tsx', import.meta.url), 'utf8');
assert.ok(!/Delaware|Hong Kong|Founder and Director|Founder and Incorporator|founder:|employee:/.test(page));
assert.ok(page.includes('streetAddress: entity.registeredAddress.en'));
assert.ok(page.includes('name: entity.registrationLabel.en'));
ok('Company structured data uses the same registration record and no former-company personnel roles');
console.log(`Passed: ${passed} groups`);
