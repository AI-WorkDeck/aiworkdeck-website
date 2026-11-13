// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { siteConfig, SITE_LEGAL_EFFECTIVE_DATE } from '@/lib/site-config';
import type { LegalDocument } from './types';

const E = siteConfig.legalEntity;
const TOKENS: Record<string, string> = {
  E_nameEn: E.nameEn,
  E_nameZh: E.nameZh,
  E_contactEmail: E.contactEmail,
  E_registrationNo: E.registrationNo,
  E_registrationLabel_en: E.registrationLabel.en,
  E_registrationLabel_zh: E.registrationLabel.zh,
  E_registeredAddress_en: E.registeredAddress.en,
  E_registeredAddress_zh: E.registeredAddress.zh,
  E_governingLaw_en: E.governingLaw.en,
  E_governingLaw_zh: E.governingLaw.zh,
  E_forum_en: E.forum.en,
  E_forum_zh: E.forum.zh,
  SITE_LEGAL_EFFECTIVE_DATE,
  siteConfig_host: siteConfig.host,
  siteConfig_otherSite_host: siteConfig.otherSite.host,
};

function hydrate<T>(val: T): T {
  if (typeof val === 'string') {
    return val.replace(/\{__T_([A-Za-z0-9_]+)__\}/g, (_, k) => TOKENS[k] ?? '') as unknown as T;
  }
  if (Array.isArray(val)) {
    return val.map(hydrate) as unknown as T;
  }
  if (val && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) out[k] = hydrate(v);
    return out as T;
  }
  return val;
}

export const legalDoc: LegalDocument = hydrate({
  "eyebrow": "Legal",
  "title": "Terms of Service",
  "effectiveLabel": "Effective {__T_SITE_LEGAL_EFFECTIVE_DATE__}",
  "intro": "These Terms form an agreement between you and  (\"we\", \"us\") covering {__T_siteConfig_host__}, the AI WorkDeck desktop application, the Office add-ins, the Skill and plugin plazas and related services (together, the \"Service\"). By registering an account, generating an account key or otherwise using the Service, you confirm that you have read, understood and accepted these Terms.",
  "highlightsTitle": "The short version",
  "highlights": [
    "**AI output is not legal advice.** We do not provide legal services and no lawyer-client or agency relationship arises from your use of the Service. AI output may contain incorrect facts, repealed provisions and cases that do not exist. You must verify it independently before relying on it.",
    "**The desktop application's interface is currently available in Chinese only.** The website is bilingual, but the software you download is not. Please confirm this works for you before you buy anything — see clause 2.",
    "**You are responsible for what you send to the AI.** Content you send through the platform AI channel is transmitted to a model provider in the United States. Do not submit material you are not permitted to disclose.",
    "**An account key is equivalent to your credentials.** It is shown in full only once; the consequences of disclosure are yours. Revoke it in your account immediately if it leaks.",
    "**Credits granted by us (creator earnings, gifts, redemption codes) expire 24 months after they are credited and cannot be withdrawn.** Credits you top up yourself never expire and can be refunded when you close your account. Spending draws on the expiring balance first.",
    "**If you are a consumer in the EU, EEA or UK, buying Credits starts immediate performance and ends your 14-day right of withdrawal for that purchase.** You are asked to confirm this at checkout. We still refund a purchase whose Credits you have not spent — see clause 7.",
    "**Our liability is capped** — see clause 12. The cap does not exclude liability for our wilful misconduct or gross negligence, for death or personal injury, or for anything the law does not allow us to exclude.",
    "**Disputes go to arbitration before  under ** — see clause 16. If you are a consumer, that clause does not take away the protections of the mandatory law where you live.",
    "**This site and {__T_siteConfig_otherSite_host__} are separate.** Separate contracting entities, separate accounts, separate balances. Nothing you hold there is usable here — see clause 1."
  ],
  "tocTitle": "Contents",
  "sections": [
    {
      "id": "parties",
      "title": "1. Parties and scope",
      "blocks": [
        {
          "type": "p",
          "text": "The Service is operated by , a company incorporated in the Hong Kong Special Administrative Region under the Companies Ordinance (Cap. 622),  . Registered office: . Contact: ."
        },
        {
          "type": "p",
          "text": "These Terms cover {__T_siteConfig_host__}, the desktop application, the Office add-ins, the Skill and plugin plazas, and other related services we may offer. Parts of the desktop application released under an open-source license (see the LICENSE file in the code repository) are additionally governed by that license; where the license conflicts with these Terms, the license prevails for those parts."
        },
        {
          "type": "callout",
          "text": "**{__T_siteConfig_host__} and {__T_siteConfig_otherSite_host__} are two separate services.** They run on separate infrastructure with separate databases, and each is operated by a different contracting entity under different governing law. Accounts, passwords, Credits balances, purchased entitlements and account keys **do not carry across**. Registering here does not give you an account there, and a purchase made there cannot be redeemed here. If you already have an account on the other site and want to use this one, you have to register again."
        },
        {
          "type": "callout",
          "text": "**The desktop application ships with a Chinese-language interface.** This website is available in English and Chinese, but the software itself — menus, dialogs, settings, error messages — is currently Chinese only, and so is most of the in-app help. The AI features respond in the language you write in, and documents you edit are unaffected. We say this plainly here because it is the single thing most likely to disappoint someone who buys on the strength of an English website. If it is a problem for you, do not buy."
        },
        {
          "type": "p",
          "text": "These Terms exist in English and Chinese. In the event of any discrepancy, the English version prevails."
        }
      ]
    },
    {
      "id": "eligibility",
      "title": "2. Who may use the Service",
      "blocks": [
        {
          "type": "p",
          "text": "The Service is designed for practitioners and organizations working in law, compliance and adjacent fields, and assumes users capable of exercising professional judgement. You confirm that you have the legal capacity to enter into these Terms, or that you are duly authorised to accept them on behalf of your organization."
        },
        {
          "type": "p",
          "text": "The Service is not offered to anyone under 18. We do not knowingly provide it to, or collect information from, children."
        },
        {
          "type": "p",
          "text": "You are responsible for checking that your use of the Service is lawful where you are, including any export control, sanctions or professional-practice restriction that applies to you. We may decline or discontinue service where providing it would breach sanctions or export control rules binding on us."
        }
      ]
    },
    {
      "id": "account",
      "title": "3. Accounts and account keys",
      "blocks": [
        {
          "type": "p",
          "text": "Registration requires a username, an email address and a password. You must provide accurate information and keep your credentials secure. Losses caused by your own failure to do so are yours to bear."
        },
        {
          "type": "p",
          "text": "An account key (a string beginning with awdk_) connects the desktop application and the Office add-ins to your website account. We store only its hash, never the plaintext, so a lost key cannot be recovered — only replaced. Each account may hold at most ten active keys."
        },
        {
          "type": "callout",
          "text": "**Whoever holds your account key is treated as you.** Guard it as you would a password; do not transfer, sell or publish it. If it leaks, revoke it in your account immediately. Everything done, and every charge incurred, with that key before revocation is your responsibility."
        },
        {
          "type": "p",
          "text": "We may suspend or close an account where reasonably necessary: breach of these Terms or of the law, use of the account to attack or abuse the Service, prolonged anomalous activity, or suspected fraud. Except in urgent cases we will notify you first and give you a chance to put the matter right. If we close your account without cause, we refund unspent topped-up Credits."
        }
      ]
    },
    {
      "id": "ai",
      "title": "4. What the AI features are, and are not",
      "blocks": [
        {
          "type": "callout",
          "text": "**The Service is a tool, not a legal service.** We are not a law firm, we do not give legal advice, and no lawyer-client, agency or other professional relationship arises from your use of the Service. Everything the AI produces — drafts, review comments, risk ratings, citation-check results — is working material for your consideration and is not a substitute for your own professional judgement."
        },
        {
          "type": "p",
          "text": "You accept the inherent limits of large language models: output is generated statistically rather than retrieved, and may contain statements contrary to fact, provisions that have been repealed or amended, and cases that do not exist or do not say what is claimed (commonly called \"hallucination\"). Features such as citation checking reduce but cannot eliminate this risk."
        },
        {
          "type": "p",
          "text": "The models available through the platform AI channel are trained predominantly on materials in English and Chinese and reflect that bias. Output about any particular jurisdiction — including your own — may be wrong in ways that are not obvious. Nothing in the Service is tuned to the law of any specific country."
        },
        {
          "type": "p",
          "text": "Accordingly, you undertake to verify AI output independently before using it in any external deliverable, any advice to a client, or any filing with a court or administrative authority. Consequences of using unverified output are yours."
        },
        {
          "type": "p",
          "text": "You must also observe the professional conduct and confidentiality rules that apply to you. Before submitting client or matter materials to the AI, you are responsible for deciding whether client consent is required and whether doing so is permitted in your jurisdiction and by your firm."
        }
      ]
    },
    {
      "id": "content",
      "title": "5. İçerikleriniz ve verileriniz",
      "blocks": [
        {
          "type": "p",
          "text": "Masaüstü uygulaması yerel önceliklidir (local-first): belgeleriniz, projeleriniz ve çalışma geçmişiniz varsayılan olarak kendi cihazınızda kalır. Bunları yüklemez, saklamaz veya erişmeyiz."
        },
        {
          "type": "p",
          "text": "İstisnalar, kendinizin tetiklediği özelliklerdir. Platform AI kanalını kullandığınızda, göndermeyi seçtiğiniz içerik bir model sağlayıcı tarafından işlenir. Ağ erişimi gerektiren eklentileri (konuşma sentezi, belge ayrıştırma) kullandığınızda, ilgili içerik o sağlayıcıya gider. Ürün geri bildirimi bize gönderdiğinizde, metin ve eklediğiniz tüm ekler geri bildirim gelen kutumuza yüklenir. Gizlilik Politikası, bu akışların her birini ve sunucuların nerede olduğunu belirtir."
        },
        {
          "type": "p",
          "text": "Servise gönderdiğiniz şeyin, açıklamaya yetkili olmadığınız hiçbir bilgi içermediğini, üçüncü taraf fikri mülkiyetini veya ticari sırlarını ihlal eden hiçbir materyal bulunmadığını ve hiçbir yasa dışı içerik bulunmadığını garanti edersiniz. İçeriğinizden kaynaklanan talepler, uyuşmazlıklar veya yaptırımlar sizin sorumluluğunuzdadır."
        },
        {
          "type": "p",
          "text": "Kendi içeriğiniz üzerindeki tüm haklar sizde kalır. Belgelerinizi modelleri eğitmek için kullanmayız ve Gizlilik Politikası'nın açıkladığı durumlar dışında bunları kimseye aktarmayız."
        }
      ]
    },
    {
      "id": "marketplace",
      "title": "6. Skill plaza ve eklenti plaza",
      "blocks": [
        {
          "type": "callout",
          "text": "**Bu sitede ücretli gönderimler henüz açık değildir.** Buradaki plaza şu anda yalnızca ücretsiz ve birinci taraf girdileri listeler. Şimdi ücretsiz bir girdi gönderebilirsiniz; aşağıda açıklanan oluşturucu gelir payı, ücretli gönderimleri açtığımız andan itibaren geçerli olur ve bunu öncesinde duyuracağız."
        },
        {
          "type": "p",
          "text": "Skill veya eklenti plaza'ya girdi gönderebilirsiniz. Göndererek, içeriğin size ait olduğunu veya size tam lisanslı olduğunu, herhangi bir üçüncü tarafın fikri mülkiyetini, ticari sırrını veya diğer haklarını ihlal etmediğini ve kötü amaçlı kod içermediğini beyan ve garanti edersiniz."
        },
        {
          "type": "p",
          "text": "Plaza'yı işletebilmemiz için, gönderiminizi depolamak, çoğaltmak, görüntülemek ve dağıtmak; kurulum ve güncelleme için kullanılabilir hale getirmek; ve Servisi tanıtmak için makul ölçüde gerekli olduğu şekilde alıntılamak ve görüntülemek amacıyla bize dünya çapında, münhasır olmayan, alt lisans verebilir, telifsiz bir lisans verirsiniz. Bu lisans, içeriğiniz plaza'dan kaldırıldığında sona erer; bu durum halihazırda dağıtılmış kopyaları etkilemez."
        },
        {
          "type": "p",
          "text": "Gönderimleri inceleyebilir; ihlal görünen, kötü amaçlı kod içeren, yayınlanmaya uygun olmayan veya yasayı ya da bu Koşulları ihlal eden içerikleri yayımlamaktan kaçınabilir veya kaldırabiliriz. İnceleme, kalite, güvenlik veya yasallık konusunda bir onay veya garanti anlamına gelmez."
        },
        {
          "type": "callout",
          "text": "**Üçüncü taraf içerikleri kendiniz değerlendirin.** Topluluk tarafından katkıda bulunan Skill'ler ve eklentiler bizim tarafımızdan geliştirilmemiştir ve işlevleri, doğruluğu veya güvenlikleri konusunda hiçbir garanti vermeyiz. Kullanımlarından kaynaklanan kayıpların sorumlusu katkıda bulunan kişidir."
        },
        {
          "type": "p",
          "text": "Ücretli gönderimler açıldığında: ücretli bir girdi satıldığında, oluşturucu işlem değerinin %70'ini anında Credits olarak alır (platform %30'u alıkoyar). Kredilendirme satış anında gerçekleşir — talep gerekmez, manuel ödeme beklenmez. Kod kullanımıyla verilen haklar platform tarafından finanse edilen tanıtımlardır ve oluşturucu payı oluşturmaz."
        },
        {
          "type": "callout",
          "text": "**Oluşturucu kazançları Credits olarak ödenir. Nakde çevrilemez veya çekilemez.** Credits, plaza ürünlerinde, özellik kilitsizlemelerinde ve platform AI'da harcanabilir ve kredilendirmeden itibaren 24 ay geçerlidir. Bir gönderiyi fiyatlandırırken bunu göz önünde bulundurun; bu ödeme yöntemi size uygun değilse, lütfen ücretli girdi göndermeyin."
        },
        {
          "type": "p",
          "text": "Plaza üzerinden kazandığınız her şey için kendi vergi durumunuzdan siz sorumlusunuz. Biz vergi kesintisi yapmayız ve sizin adınıza vergi belgesi düzenlemeyiz."
        }
      ]
    },
    {
      "id": "payment",
      "title": "7. Credits: ödeme, harcama, vergi ve iptal",
      "blocks": [
        {
          "type": "p",
          "text": "Credits, Servis genelinde tek hesap birimidir. Bakiye yükleme size Credits kazandırır; bunlar doğrudan platform AI, Skill ve eklenti satın alımları ile özellik kilitsizlemeleri için kullanılır — ayrı bir \"tahsis\" adımı yoktur. Ödeme Stripe tarafından işlenir; ödeme sayfasında gösterilen tutar ve açıklama geçerlidir."
        },
        {
          "type": "p",
          "text": "Credits, farklı haklara sahip iki sınıfa ayrılır:"
        },
        {
          "type": "table",
          "head": [
            "Sınıf",
            "Kaynak",
            "Geçerlilik",
            "İade edilebilir"
          ],
          "rows": [
            [
              "Yüklenen Credits",
              "Kendi bakiye yüklemeniz",
              "Süresiz geçerli",
              "Hesap kapatmada iade edilebilir"
            ],
            [
              "Granted Credits",
              "Creator earnings, gifts, redemption codes",
              "24 months from crediting",
              "Not withdrawable or refundable"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**Spending draws on granted Credits first, and within each class the soonest to expire goes first.** This order works in your favor: the balance that would expire is used up first. Your account page shows both balances and the next expiry date."
        },
        {
          "type": "p",
          "text": "Credits are an accounting record of consideration paid. They are not a prepaid card or any form of electronic money: they bear no interest, cannot be transferred to another person, and cannot be used anywhere except within the Service on this site."
        },
        {
          "type": "callout",
          "text": "**Platform AI is charged against Credits by actual usage.** We set a usage cap with the upstream model provider based on your Credits balance and periodically deduct usage that has occurred. Any excess arising from synchronisation lag is borne by us — we will not bill you for it, and your Credits will never go negative."
        },
        {
          "type": "p",
          "text": "**Tax.** Prices are shown exclusive of tax unless the checkout page says otherwise. Where value added tax, goods and services tax, sales tax or a similar tax is due on your purchase, it is determined by your location, calculated by our payment provider and added at checkout, so you see the final amount before you pay. If you are buying as a business and hold a valid VAT or GST registration number, you may enter it at checkout; where the reverse charge applies, no tax is added and you account for it yourself. Any tax you owe on your own use of the Service, and any withholding your own jurisdiction imposes, is yours to handle."
        },
        {
          "type": "callout",
          "text": "**Right of withdrawal (EU, EEA and UK consumers).** As a consumer you normally have 14 days to withdraw from a distance contract for digital content. Credits are digital content delivered instantly: the moment your payment succeeds, they are in your balance and available to spend. At checkout you are therefore asked to expressly request that we begin performance immediately and to acknowledge that you thereby lose the right of withdrawal for that purchase. **If you do not give that confirmation, we cannot deliver the Credits immediately.** If you do give it, the right of withdrawal for that top-up ends when the Credits are credited."
        },
        {
          "type": "p",
          "text": "Whatever the position on withdrawal, we go further than the law requires in one respect: **if you have not spent any of the Credits from a top-up, you may ask us to reverse that top-up within 14 days and we will refund it in full to the original payment method.** Once part of a top-up has been spent, that top-up is no longer reversible, but any unspent balance remains refundable on account closure under the paragraph below."
        },
        {
          "type": "p",
          "text": "Digital goods (Skills, plugins, feature unlocks) are treated as performed once available for download. Within 14 days of purchase you may request a refund if the item has a material defect — it cannot be installed, or differs substantially from its description — and we fail to remedy it within a reasonable period; where you paid in Credits, the Credits are returned. Problems caused by your own device, network or manner of use are not grounds for refund. This does not affect your statutory rights as a consumer in respect of goods or digital content that are not as described or not of satisfactory quality."
        },
        {
          "type": "p",
          "text": "On closing your account you may ask for unspent topped-up Credits to be returned to the original payment method. We refund the amount you paid; where the payment provider does not return its processing fee on a refund made long after the original payment, we may deduct that fee, and we tell you the figure before proceeding. Granted Credits are not refundable."
        },
        {
          "type": "p",
          "text": "We may change prices and plans. Changes apply only to orders placed after they take effect, never to completed transactions, and never to Credits you already hold."
        }
      ]
    },
    {
      "id": "ip",
      "title": "8. Intellectual property",
      "blocks": [
        {
          "type": "p",
          "text": "Except as an open-source license provides otherwise, intellectual property in the Service and its software, interfaces, documentation, trade marks and logos belongs to us or the respective right holders. \"AI WorkDeck\" and its logo are our marks and may not be used in ways likely to cause confusion without our written permission."
        },
        {
          "type": "p",
          "text": "We grant you a non-exclusive, non-transferable, revocable license to use the Service, subject to these Terms, for your own or your organization's business purposes. You may not reverse-engineer the Service (except as an open-source license or mandatory law permits), circumvent its licensing or billing mechanisms, scrape it in bulk, or resell, rent or timeshare it to third parties."
        }
      ]
    },
    {
      "id": "thirdparty",
      "title": "9. Third-party services",
      "blocks": [
        {
          "type": "p",
          "text": "The Service depends on third parties: Stripe for payments, OpenRouter for model routing, GitHub for installer and source hosting, and cloud providers for infrastructure. Each operates under its own terms."
        },
        {
          "type": "p",
          "text": "If a third-party service is interrupted, changed or discontinued, the corresponding features may be affected. We will make reasonable efforts to find alternatives but are not responsible for the conduct of those third parties. Where a model you rely on is withdrawn by its provider, we will point you at the nearest available substitute; we cannot guarantee any particular model stays available."
        }
      ]
    },
    {
      "id": "availability",
      "title": "10. Availability and changes",
      "blocks": [
        {
          "type": "p",
          "text": "We work to keep the Service stable but do not promise it will be uninterrupted or error-free. We are not liable for interruptions caused by maintenance, upgrades, third-party failures, network attacks or force majeure. Planned maintenance will be announced in advance."
        },
        {
          "type": "p",
          "text": "We may add, change or discontinue parts of the Service. If we discontinue something you have paid for, we will refund the unperformed portion pro rata. If we discontinue this site altogether, we will give you at least 30 days' notice and refund unspent topped-up Credits."
        },
        {
          "type": "p",
          "text": "Desktop updates come as in-app patches or as full installers, per the release notes page. You may decline updates, but older versions may lose online functionality as interfaces change."
        },
        {
          "type": "p",
          "text": "The desktop application runs on your own machine and depends on it. We do not back up your local documents or work history — that is yours to arrange."
        }
      ]
    },
    {
      "id": "warranty",
      "title": "11. No warranties",
      "blocks": [
        {
          "type": "p",
          "text": "To the maximum extent permitted by law, the Service is provided \"as is\". We make no express or implied warranty of merchantability, fitness for a particular purpose, uninterrupted or error-free operation, nor any warranty as to the accuracy, completeness or suitability of AI output."
        },
        {
          "type": "p",
          "text": "This clause does not exclude any warranty, condition or guarantee that cannot be excluded by law, including the statutory rights of consumers under the law of their own country."
        }
      ]
    },
    {
      "id": "liability",
      "title": "12. Limitation of liability",
      "blocks": [
        {
          "type": "callout",
          "text": "**To the maximum extent permitted by law, our total liability to you under these Terms and in connection with the Service is capped at the fees you actually paid us for the Service in the twelve months before the loss arose; if you have never paid, the cap is USD 100.**"
        },
        {
          "type": "p",
          "text": "To the maximum extent permitted by law, we are not liable for lost profits, business interruption, loss of goodwill, data loss, or any other indirect, incidental or consequential loss — even if we were told such loss was possible."
        },
        {
          "type": "callout",
          "text": "**This clause does not apply to, and we remain fully liable for: our wilful misconduct; our gross negligence; death or personal injury caused by our negligence; fraud or fraudulent misrepresentation; and any other liability that may not be limited or excluded by the law that applies to you.**"
        },
        {
          "type": "p",
          "text": "If you are a consumer, nothing in these Terms limits the rights the mandatory law of your country of residence gives you, and this clause takes effect only so far as that law allows."
        },
        {
          "type": "p",
          "text": "You understand that this clause and clause 4 together form part of the basis on which the Service is offered: the price reflects the fact that liability is bounded in this way."
        }
      ]
    },
    {
      "id": "indemnity",
      "title": "13. Your indemnity",
      "blocks": [
        {
          "type": "p",
          "text": "If we face a third-party claim, regulatory penalty or proceeding because you breached these Terms or the law, infringed a third-party right, or because of content you submitted to the Service, you will compensate us for the losses actually incurred, including reasonable legal and arbitration costs."
        },
        {
          "type": "p",
          "text": "This clause applies only to losses actually caused by your breach, and only so far as the law that applies to you allows. If you are a consumer, it does not extend beyond the liability you would have at law in any event."
        }
      ]
    },
    {
      "id": "termination",
      "title": "14. Termination",
      "blocks": [
        {
          "type": "p",
          "text": "You may stop using the Service and close your account at any time from your account page. We will then handle your personal information as set out in the Privacy Policy, and your account keys stop working immediately. Unspent topped-up Credits can be refunded under clause 7."
        },
        {
          "type": "p",
          "text": "We may terminate the Service to you if you seriously breach these Terms. Termination does not affect rights and obligations already accrued. Clauses 5, 8, 11 to 13 and 16 survive termination."
        }
      ]
    },
    {
      "id": "changes",
      "title": "15. Changes to these Terms",
      "blocks": [
        {
          "type": "p",
          "text": "We may revise these Terms. For substantive revisions affecting your main rights and obligations, we will give at least 30 days' notice before they take effect, by website announcement and by email to the address on your account."
        },
        {
          "type": "p",
          "text": "Continuing to use the Service after a revision takes effect means you accept it. If you do not accept it, stop using the Service and close your account before the effective date; you may then request a refund of unspent topped-up Credits and a pro rata refund of anything purchased but not yet performed."
        }
      ]
    },
    {
      "id": "disputes",
      "title": "16. Governing law and disputes",
      "blocks": [
        {
          "type": "p",
          "text": "These Terms — their formation, validity, interpretation, performance and any dispute about them — are governed by ."
        },
        {
          "type": "p",
          "text": "Before starting formal proceedings, please write to  setting out the problem. Most things are resolved this way, and we undertake to reply substantively within 30 days."
        },
        {
          "type": "callout",
          "text": "**Any dispute arising out of or in connection with these Terms shall be referred to and finally resolved by arbitration administered by  under its rules in force when the notice of arbitration is submitted. The seat of arbitration is Hong Kong, the tribunal consists of one arbitrator, and the language is English. The award is final and binding on both parties.**"
        },
        {
          "type": "p",
          "text": "Note that accepting this clause means both you and we give up the right to bring covered disputes before a court, and give up the right to proceed on a class or collective basis."
        },
        {
          "type": "callout",
          "text": "**If you are a consumer, this arbitration clause does not deprive you of anything the mandatory law of your country of residence gives you.** Where that law entitles you to bring proceedings in the courts of your own country, or entitles you to the protection of its own consumer rules, you keep that entitlement and we will not argue otherwise. In particular, consumers in the EU and EEA may use the applicable online and out-of-court dispute resolution channels in their own country."
        },
        {
          "type": "p",
          "text": "Nothing above prevents either party from applying to a competent court for interim or conservatory measures."
        }
      ]
    },
    {
      "id": "misc",
      "title": "17. General",
      "blocks": [
        {
          "type": "p",
          "text": "Bu Şartlar ve Gizlilik Politikası, Hizmet ile ilgili aramızdaki tüm anlaşmayı oluşturur ve bununla ilgili önceki tüm mutabakatların yerine geçer."
        },
        {
          "type": "p",
          "text": "Herhangi bir hüküm geçersiz veya uygulanamaz bulunursa, diğer hükümler yürürlükte kalır ve söz konusu hüküm, uygulanabilir olabilecek, orijinal amacına en yakın şekilde yorumlanır."
        },
        {
          "type": "p",
          "text": "Bu Şartlar kapsamındaki bir hakkı kullanmaktan kaçınmamız veya bunu kullanmakta gecikmemiz, ilgili haktan feragat anlamına gelmez."
        },
        {
          "type": "p",
          "text": "Bu Şartlar kapsamındaki haklarınızı veya yükümlülüklerinizi, yazılı onayımız olmadan başkasına devredemezsiniz. Biz ise bu hakları ve yükümlülükleri, sizi önceden bilgilendirerek bir birleşme, bölünme veya varlık devri sonucunda hak sahibi olan tarafa devredebiliriz."
        },
        {
          "type": "p",
          "text": "Siz ve bizim dışımızda hiçbir kişi bu Şartları uygulama hakkına sahip değildir."
        },
        {
          "type": "p",
          "text": "Bu Şartlar hakkında herhangi bir sorunuz için adresine yazın."
        }
      ]
    }
  ]
});
export default legalDoc;
