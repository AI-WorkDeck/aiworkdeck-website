// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { LEGAL_ENTITY, LEGAL_EFFECTIVE_DATE } from '@/lib/legal-entity';
import type { LegalDocument } from './types';

const E = LEGAL_ENTITY;
const TOKENS: Record<string, string> = {
  E_nameEn: E.nameEn,
  E_nameZh: E.nameZh,
  E_uscc: E.uscc,
  E_contactEmail: E.contactEmail,
  E_site: E.site,
  LEGAL_EFFECTIVE_DATE,
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
  "effectiveLabel": "Effective {__T_LEGAL_EFFECTIVE_DATE__}",
  "intro": "These Terms form an agreement between you and  () (\"we\", \"us\") covering the AI WorkDeck website (), the desktop application, plugins, the Skill plaza and related services (together, the \"Service\"). By registering an account, generating an account key or otherwise using the Service, you confirm that you have read, understood and accepted these Terms.",
  "highlightsTitle": "Read these first",
  "highlights": [
    "**AI output is not legal advice.** We do not provide legal services and no attorney-client or agency relationship arises from your use of the Service. AI output may contain incorrect facts, repealed provisions and non-existent cases. You must verify it independently before relying on it.",
    "**You are responsible for what you send to the AI.** When you use the platform AI channel, your input is transmitted to a model provider outside mainland China. Do not submit state secrets, sensitive personal information, or material you are not permitted to disclose.",
    "**An account key is equivalent to your credentials.** It is displayed in full only once; the consequences of disclosure are yours. Revoke it in your account immediately if it leaks.",
    "**Tarafımızca verilen Credits (içerik üretici kazançları, hediyeler, kullanım kodları) hesaba geçtikten 24 ay sonra sona erer ve çekilemez.** Kendiniz yüklediğiniz Credits hiçbir zaman sona ermez ve hesabınızı kapattığınızda iade edilebilir. Harcamalar öncelikle süreli bakiyeden düşülür.",
    "**Sorumluluğumuz üst sınırlıdır** — madde 12'ye bakınız. Bu üst sınır, kastımızdan veya ağır ihmalemizden doğan sorumluluğu ve yasalarla dışlanamayacak her türlü sorumluluğu kapsamaz.",
    "**Anlaşmazlıklar Pekin Tahkim Komisyonu nezdinde tahkime götürülür ve verilen karar nihaidir** — madde 16'ya bakınız. Bu Koşulları kabul etmekle hem siz hem de biz, kapsanan anlaşmazlıkları mahkemede dava etme hakkından feragat etmiş oluruz."
  ],
  "tocTitle": "Contents",
  "sections": [
    {
      "id": "parties",
      "title": "1. Taraflar ve kapsam",
      "blocks": [
        {
          "type": "p",
          "text": "Hizmet, () tarafından işletilmektedir; birleşik sosyal güvenlik kodu: . İletişim: ."
        },
        {
          "type": "p",
          "text": "Bu Koşullar, web sitesini, masaüstü uygulamasını, Office eklentilerini, Skill ve eklenti mağazalarını ve sunabileceğimiz diğer ilgili hizmetleri kapsar. Masaüstü uygulamasının açık kaynak lisansıyla yayımlanan bölümleri (kod deposundaki LICENSE dosyasına bakınız) ayrıca o lisansla düzenlenir; lisans ile bu Koşullar çeliştiğinde, o bölümler için lisans hükmü geçerlidir."
        },
        {
          "type": "p",
          "text": "Bu Koşullar Çince ve İngilizce olarak mevcuttur. Herhangi bir tutarsızlık durumunda Çince versiyon geçerlidir."
        }
      ]
    },
    {
      "id": "eligibility",
      "title": "2. Hizmeti kimler kullanabilir",
      "blocks": [
        {
          "type": "p",
          "text": "Hizmet, hukuk, uyum (compliance) ve yakın alanlarda çalışan uygulayıcılar ile kuruluşlar için tasarlanmıştır ve mesleki muhakeme yapabilen kullanıcılar varsayar. Tam fiil ehliyetine sahip olduğunuzu veya kuruluşunuz adına Hizmeti kullanmak için duly yetkili olduğunuzu teyit edersiniz."
        },
        {
          "type": "p",
          "text": "Hizmeti 14 yaşından küçük çocuklara sunmuyoruz. 18 yaşından küçükyseniz, lütfen bu Koşulları vasinizle birlikte okuyun ve Hizmeti kullanmadan önce onayını alın."
        }
      ]
    },
    {
      "id": "account",
      "title": "3. Hesaplar ve hesap anahtarları",
      "blocks": [
        {
          "type": "p",
          "text": "Kayıt için bir kullanıcı adı, bir e-posta adresi ve bir şifre gerekir. Doğru bilgiler vermelisiniz ve giriş bilgilerinizi güvenli tutmalısınız. Bunları yapmamanızdan kaynaklanan kayıplar size aittir."
        },
        {
          "type": "p",
          "text": "Bir hesap anahtarı (awdk_ ile başlayan bir dize), masaüstü uygulamasını web sitesi hesabınıza bağlar. Yalnızca karma (hash) değerini saklarız, düz metnini asla; bu nedenle kaybolan anahtar kurtarılamaz — yalnızca yenisiyle değiştirilebilir. Her hesap en fazla üç etkin anahtar tutabilir."
        },
        {
          "type": "callout",
          "text": "**Hesap anahtarınızı elinde tutan kişi siz olarak kabul edilir.** Onu bir şifre gibi koruyun; devretmeyin, satmayın veya yayımlamayın. Sızması hâlinde hemen hesabınızdan iptal edin. İptal öncesinde o anahtarla yapılan her işlem ve alınan her ücret sizin sorumluluğunuzdadır."
        },
        {
          "type": "p",
          "text": "Makul ölçüde gerekli durumlarda hesabı askıya alabilir veya kapatabiliriz: bu Koşulların veya yasaların ihlali, hesabın Hizmete saldırı veya kötüye kullanım amacıyla kullanılması, uzun süreli anormal faaliyet veya şüpheli dolandırıcılık. Acil durumlar dışında önce size bildirimde bulunuruz."
        }
      ]
    },
    {
      "id": "ai",
      "title": "4. Yapay zekâ özelliklerinin ne olduğu ve ne olmadığı",
      "blocks": [
        {
          "type": "callout",
          "text": "**Hizmet bir araçtır, hukuk hizmeti değildir.** Biz bir hukuk bürosu değiliz, hukuki tavsiye vermiyoruz ve Hizmeti kullanmanızdan avukat-müvekkil, vekâlet veya başka bir mesleki ilişki doğmaz. Yapay zekânın ürettiği her şey — taslaklar, gözden geçirme yorumları, risk derecelendirmeleri, atıf kontrolü sonuçları — değerlendirmeniz için çalışma malzemesidir ve kendi mesleki muhakemenizin yerine geçmez."
        },
        {
          "type": "p",
          "text": "Büyük dil modellerinin doğal sınırlarını kabul edersiniz: çıktı geri getirme yoluyla değil istatistiksel olarak üretilir ve gerçeğe aykırı ifadeler, yürürlükten kaldırılmış veya değiştirilmiş hükümler ile var olmayan ya da iddia edildiği gibi olmadığı iddia edilen davalar (yaygın adıyla \"halüsinasyon\") içerebilir. Atıf kontrolü gibi özellikler bu riski azaltır ama ortadan kaldıramaz."
        },
        {
          "type": "p",
          "text": "Bu nedenle, yapay zekâ çıktısını herhangi bir harici teslimatta, müvekkile verilen herhangi bir tavsiyede veya adli ya da idari bir merciye yapılan herhangi bir başvuruda kullanmadan önce bağımsız olarak doğrulamayı taahhüt edersiniz. Doğrulanmamış çıktıyı kullanmanın sonuçları size aittir."
        },
        {
          "type": "p",
          "text": "Ayrıca, size uygulanan mesleki davranış ve gizlilik kurallarına da uymalısınız. Müvekkil veya dosya materyallerini yapay zekâya göndermeden önce, müvekkil onayı gerekip gerekmediğine ve bunun yargı yetkinizde ve büronuzca izin verilip verilmediğine karar vermekten siz sorumlusunuz."
        }
      ]
    },
    {
      "id": "content",
      "title": "5. İçeriğiniz ve verileriniz",
      "blocks": [
        {
          "type": "p",
          "text": "Masaüstü uygulaması yerel-önceliklidir (local-first): belgeleriniz, projeleriniz ve çalışma geçmişiniz varsayılan olarak kendi cihazınızda kalır. Biz bunları yüklemez, saklamaz veya bunlara erişmeyiz."
        },
        {
          "type": "p",
          "text": "İstisna, kendinizin tetiklediği özelliklerdir. Platform yapay zekâ kanalını kullandığınızda, göndermeyi seçtiğiniz içerik bir model sağlayıcısı tarafından işlenir. Ağ erişimi gerektiren eklentileri (konuşma sentezi, belge ayrıştırma) kullandığınızda, ilgili içerik o sağlayıcıya gider. Bu akışlar Gizlilik Politikasında açıklanmıştır."
        },
        {
          "type": "p",
          "text": "Hizmete gönderdiğiniz içerikte devlet sırrı bulunmadığını, ifşa etmenize izin verilmeyen bilgi bulunmadığını, üçüncü tarafların fikri mülkiyetini veya ticari sırlarını ihlal eden materyal bulunmadığını ve yasa dışı hiçbir şey bulunmadığını garanti edersiniz. İçeriğinizden doğan anlaşmazlıklar, talepler veya yaptırımlar size aittir ve bu nedenle uğradığımız kayıpları bize tazmin edersiniz."
        },
        {
          "type": "p",
          "text": "Kendi içeriğinizdeki tüm haklar sizde kalır. Belgelerinizi modelleri eğitmek için kullanmıyoruz."
        }
      ]
    },
    {
      "id": "marketplace",
      "title": "6. Skill plaza and plugin plaza",
      "blocks": [
        {
          "type": "p",
          "text": "You may submit entries to the Skill or plugin plaza. By submitting, you represent and warrant that the content is your own or fully licensed to you, that it infringes no third-party intellectual property, trade secret or other right, and that it contains no malicious code."
        },
        {
          "type": "p",
          "text": "So that we can run the plaza, you grant us a worldwide, non-exclusive, sublicensable, royalty-free license to store, reproduce, display and distribute your submission, to make it available for installation and update, and to quote and display it as reasonably needed to promote the Service. The license ends when your content is removed from the plaza, without affecting copies already distributed."
        },
        {
          "type": "p",
          "text": "We may review submissions and may decline to publish, or remove, content that appears to infringe, contains malicious code, is not fit to ship, or breaches the law or these Terms. Review is not an endorsement or warranty of quality, security or legality."
        },
        {
          "type": "callout",
          "text": "**Judge third-party content for yourself.** Community-contributed Skills and plugins are not built by us and we make no warranty as to their function, accuracy or security. Losses arising from their use are for the contributor to answer for."
        },
        {
          "type": "p",
          "text": "When a paid entry sells, the creator immediately receives 70% of the transaction value as Credits (the platform retains 30%). Crediting happens at the moment of sale — no request, no waiting for manual settlement. Entitlements granted by redemption code are platform-funded promotion and generate no creator share."
        },
        {
          "type": "callout",
          "text": "**Creator earnings are settled in Credits. They cannot be converted to cash or withdrawn.** Credits can be spent on plaza items, feature unlocks and platform AI, and are valid for 24 months from crediting. Factor this in when you price a submission; if this settlement method is not acceptable to you, please do not submit paid entries."
        }
      ]
    },
    {
      "id": "payment",
      "title": "7. Credits: top-ups, spending and expiry",
      "blocks": [
        {
          "type": "p",
          "text": "Credits are the single unit of account across the Service. Topping up gives you Credits, which are used directly for platform AI, Skill and plugin purchases and feature unlocks — there is no separate \"allocation\" step. Payment is processed through WeChat Pay; the amount and description shown at checkout govern."
        },
        {
          "type": "p",
          "text": "Credits fall into two classes with different rights:"
        },
        {
          "type": "table",
          "head": [
            "Class",
            "Source",
            "Expiry",
            "Refundable"
          ],
          "rows": [
            [
              "Topped-up Credits",
              "Your own top-up",
              "Never expire",
              "Refundable on account closure"
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
          "text": "Credits are an accounting record of consideration paid. They are not a prepaid card: they bear no interest and cannot be transferred to another person."
        },
        {
          "type": "callout",
          "text": "**Platform AI is charged against Credits by actual usage.** We set a usage cap with the upstream model provider based on your Credits balance and periodically deduct usage that has occurred. Any excess arising from synchronisation lag is borne by us — we will not bill you for it, and your Credits will never go negative."
        },
        {
          "type": "p",
          "text": "Digital goods (Skills, plugins, feature unlocks) are treated as performed once available for download. Within seven days of purchase you may request a refund if the item has a material defect — it cannot be installed, or differs substantially from its description — and we fail to remedy it within a reasonable period; where you paid in Credits, the Credits are returned. Problems caused by your own device, network or manner of use are not grounds for refund."
        },
        {
          "type": "p",
          "text": "On closing your account you may ask for unspent topped-up Credits to be returned via the original payment channel, less payment-channel fees actually incurred. Granted Credits are not refundable."
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
          "text": "We grant you a non-exclusive, non-transferable, revocable license to use the Service, subject to these Terms, for your own or your organization's business purposes. You may not reverse-engineer the Service (except as an open-source license permits), circumvent its licensing or billing mechanisms, scrape it in bulk, or resell, rent or timeshare it to third parties."
        }
      ]
    },
    {
      "id": "thirdparty",
      "title": "9. Third-party services",
      "blocks": [
        {
          "type": "p",
          "text": "The Service depends on third parties: WeChat Pay for payments, OpenRouter for model routing, GitHub for installer and source hosting, and cloud providers for infrastructure. Each operates under its own terms."
        },
        {
          "type": "p",
          "text": "If a third-party service is interrupted, changed or discontinued, the corresponding features may be affected. We will make reasonable efforts to find alternatives but are not responsible for the conduct of those third parties."
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
          "text": "We may add, change or discontinue parts of the Service. If we discontinue something you have paid for, we will refund the unperformed portion pro rata."
        },
        {
          "type": "p",
          "text": "Desktop updates come as in-app patches or as full installers, per the release notes page. You may decline updates, but older versions may lose online functionality as interfaces change."
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
          "text": "This clause does not exclude warranties that cannot be excluded by law."
        }
      ]
    },
    {
      "id": "liability",
      "title": "12. Limitation of liability",
      "blocks": [
        {
          "type": "callout",
          "text": "**To the maximum extent permitted by law, our total liability to you under these Terms and in connection with the Service is capped at the fees you actually paid us for the Service in the twelve months before the loss arose; if you have never paid, the cap is CNY 100.**"
        },
        {
          "type": "p",
          "text": "To the maximum extent permitted by law, we are not liable for lost profits, business interruption, loss of goodwill, data loss, or any other indirect, incidental or consequential loss — even if we were told such loss was possible."
        },
        {
          "type": "callout",
          "text": "**This clause does not apply to, and we remain liable at law for: our wilful misconduct or gross negligence; personal injury; and any other liability that may not be limited or excluded by law.**"
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
          "text": "If we face a third-party claim, administrative penalty or proceeding because you breached these Terms or the law, infringed a third-party right, or because of content you submitted to the Service, you will compensate us for the losses actually incurred, including reasonable legal, litigation and arbitration costs."
        }
      ]
    },
    {
      "id": "termination",
      "title": "14. Termination",
      "blocks": [
        {
          "type": "p",
          "text": "You may stop using the Service and close your account at any time. We will then handle your personal information as set out in the Privacy Policy, and your account keys stop working immediately."
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
          "text": "We may revise these Terms. For substantive revisions affecting your main rights and obligations, we will give at least seven days' notice before they take effect, by website announcement or email."
        },
        {
          "type": "p",
          "text": "Continuing to use the Service after a revision takes effect means you accept it. If you do not accept it, stop using the Service and you may close your account; for anything purchased but not yet performed, you may request a pro rata refund."
        }
      ]
    },
    {
      "id": "disputes",
      "title": "16. Governing law and disputes",
      "blocks": [
        {
          "type": "p",
          "text": "These Terms — their formation, validity, interpretation, performance and any dispute about them — are governed by the laws of the People's Republic of China (for this purpose excluding the laws of Hong Kong SAR, Macao SAR and Taiwan)."
        },
        {
          "type": "callout",
          "text": "**Any dispute arising from or in connection with these Terms shall be submitted to the Beijing Arbitration Commission for arbitration under its rules in force at the time. The seat is Beijing and the language is Chinese. The award is final and binding on both parties.**"
        },
        {
          "type": "p",
          "text": "Note that accepting this clause means both you and we give up the right to bring covered disputes before a court, and give up the right to proceed collectively.  If you are not willing to arbitrate, please do not use the Service."
        },
        {
          "type": "p",
          "text": "The preceding paragraph does not prevent either party from applying to a competent court for interim measures, including preservation of assets, conduct and evidence."
        }
      ]
    },
    {
      "id": "misc",
      "title": "17. General",
      "blocks": [
        {
          "type": "p",
          "text": "If any provision is held invalid or unenforceable, the rest remain in force, and that provision is to be read in the way closest to its original intent that is enforceable."
        },
        {
          "type": "p",
          "text": "Our failure or delay in exercising a right under these Terms is not a waiver of it."
        },
        {
          "type": "p",
          "text": "You may not assign your rights or obligations under these Terms without our written consent. We may assign them to a successor in a merger, division or transfer of assets, with prior notice to you."
        },
        {
          "type": "p",
          "text": "For any question about these Terms, write to ."
        }
      ]
    }
  ]
});
export default legalDoc;
