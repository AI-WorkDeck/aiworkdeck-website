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
  "eyebrow": "Yasal",
  "title": "Gizlilik Politikası",
  "effectiveLabel": "{__T_SITE_LEGAL_EFFECTIVE_DATE__} tarihinde yürürlüktedir",
  "intro": "Bu politika, {__T_siteConfig_host__} ve AI WorkDeck masaüstü uygulamasını kullandığınızda kişisel verilerinizin nasıl toplandığını, kullanıldığını, saklandığını ve açıklandığını ve hangi haklara sahip olduğunuzu açıklar. Tamamını okumanızı öneririz; yalnızca özetini istiyorsanız aşağıdaki özet konuyu kapsamaktadır.",
  "highlightsTitle": "Kısa versiyon",
  "highlights": [
    "**Office/WPS eklentisi bulut işlemeyi kullanır.** Geçerli belge, gerekli görüşme geçmişi ve seçtiğiniz referanslar barındırılan arka ucumuza, ardından OpenRouter'a ve seçtiğiniz modeli sunan çıkarım sağlayıcısına iletilir. Ham belge gövdeleri geçici bellek kullanır; kullanıcı mesajları, AI yanıtları ve akıl yürütme, görüşmeyi silene kadar saklanır. 6. ve 8. maddelere bakın.",
    "**Masaüstü uygulaması yerel önceliklidir:** belgeleriniz, projeleriniz ve çalışma geçmişiniz kendi makinenizde kalır. Bunlar yüklenmez, saklanmaz ve asla modelleri eğitmek için kullanılmaz.",
    "**Site tam olarak bir çerez ayarlar** (`awd_session`, oturumunuzu açık tutmak için). Bu çerez kesinlikle gerekli olduğundan, tıklanacak bir onay bannersı yoktur. Üçüncü taraf analizi yok, reklam yok, izleme yok ve web yazı tipleri kendi sunucumuzda barındırılmaktadır.",
    "**Masaüstü telemetrisi anonimdir**: rastgele bir kurulum tanımlayıcısı, uygulama sürümü ve beyaz listeye alınmış olay adları. IP adresi saklanmaz, hiçbir şey hesabınızla ilişkilendirilmez, belge içeriği dahil edilmez ve ayarlardan kapatılabilir.",
    "**Üç şey bulunduğunuz ülkenin dışına çıkar.** AI'ya gönderdiğiniz içerik, ABD'deki OpenRouter'a gider. Ödemeler Stripe'a gider. **Göndermeyi seçtiğiniz ürün geri bildirimleri, ana ithinde işlettiğimiz bir sunucuya gider** — 7. madde nedenini ve bunun ne anlama geldiğini açıklar.",
    "**Hesabınızı kendiniz silebilirsiniz**, hesap sayfanızdan. Yasal olarak saklamamız gereken işlem kayıtları hariç, verilerinizi 30 gün içinde siler veya anonimleştiririz — 8. maddeye bakın.",
    "**Haklarınız** — erişim, düzeltme, silme, taşınabilirlik, kısıtlama, itiraz, onayın geri çekilmesi — 10. maddede belirtilmiştir. Adresine yazın; bir ay içinde yanıt veriyoruz. Ayrıca yaşadığınız yerdeki veri koruma makamına şikayette bulunabilirsiniz.",
    "**Bu site ve {__T_siteConfig_otherSite_host__} ayrı veriler tutar.** Farklı veri sorumlusu, farklı veritabanı, farklı ülke. Hiçbiri diğerinin hesaplarını göremez."
  ],
  "tocTitle": "İçindekiler",
  "sections": [
    {
      "id": "controller",
      "title": "1. Biz kimiz",
      "blocks": [
        {
          "type": "p",
          "text": "Veri sorumlusu, Hong Kong Özel İdari Bölgesi'nde Şirketler Yönetmeliği (Cap. 622) uyarınca kurulmuş bir şirket olan , kayıtlı adresi 'dir."
        },
        {
          "type": "p",
          "text": "Gizlilik veya veri korumayla ilgili her konuda — haklarınızı kullanmak dahil — adresine yazın. Bu adres, şirketimizdeki veri korumadan sorumlu kişiye ulaşır."
        },
        {
          "type": "p",
          "text": "Bu politika {__T_siteConfig_host__}, masaüstü uygulaması, Office eklentileri ve ilgili hizmetleri kapsar."
        },
        {
          "type": "callout",
          "text": "**{__T_siteConfig_otherSite_host__}, farklı bir veri sorumlusuna ve farklı bir veritabanına sahip, farklı bir ülkede ve farklı hukuk altında barındırılan ayrı bir hizmettir.** Buradaki hesabınız orada mevcut değildir ve bu politikadaki hiçbir şey o sitenin verileri nasıl işlediğini açıklamaz. Orada kaydolduysanız, bunun yerine o sitenin politikasını okuyun."
        },
        {
          "type": "p",
          "text": "Bu politika İngilizce ve Çince olarak mevcuttur. Herhangi bir tutarsızlık durumunda İngilizce versiyon geçerlidir."
        }
      ]
    },
    {
      "id": "collect",
      "title": "2. Hangi verileri topluyoruz, neden ve hangi yasal dayanakla",
      "blocks": [
        {
          "type": "p",
          "text": "\"Gerektiğinden fazlasını toplamama\" ilkesiyle hareket ediyoruz. Tablo, her bir kişisel veri kategorisini, hangi amaçla kullandığımızı ve GDPR ile eşdeğer mevzuatlar kapsamında dayandığımız yasal dayanağı gösterir."
        },
        {
          "type": "table",
          "head": [
            "Bağlam",
            "Veri",
            "Amaç",
            "Yasal dayanak"
          ],
          "rows": [
            [
              "Kayıt olma",
              "Kullanıcı adı, e-posta, şifre, görünen ad, bio (isteğe bağlı)",
              "Hesabınızı oluşturmak ve tanımlamak, hesap kurtarma, herkese açık profil",
              "Sözleşmenin ifası (Madde 6(1)(b))"
            ],
            [
              "Oturumun açık kalması",
              "Oturum belirteci (awd_session çerezindeki)",
              "Oturumunuzu sürdürmek",
              "Sözleşmenin ifası (Madde 6(1)(b))"
            ],
            [
              "Şifre saklama",
              "Yalnızca salted scrypt hash",
              "Şifrenizi doğrulamak",
              "Sözleşmenin ifası (Madde 6(1)(b))"
            ],
            [
              "Ödemeler",
              "Sipariş numarası, Stripe ödeme tanımlayıcısı, tutar, para birimi, vergi durumu, ülke, ödeme durumu, zaman damgaları",
              "Ödeme almak, vergi hesaplamak, mutabakat yapmak, iade ve chargeback işlemlerini yürütmek",
              "Sözleşme (Madde 6(1)(b)) + vergi ve muhasebe kayıtları için yasal yükümlülük (Madde 6(1)(c))"
            ],
            [
              "Cüzdan ve işlemler",
              "Bakiye, defter kayıtları, satın alımlar, haklar (entitlements), üretici kazançları",
              "Muhasebe, hak kontrolleri, tahsilat/ödeme",
              "Performance of a contract (Art. 6(1)(b))"
            ],
            [
              "Account keys",
              "SHA-256 hash and prefix only; no plaintext retained",
              "Authenticate the desktop application and Office add-ins",
              "Performance of a contract (Art. 6(1)(b))"
            ],
            [
              "AI credit",
              "Runtime key issued by the upstream model provider (stored encrypted), quota limit and usage totals",
              "Provision and meter your AI credit",
              "Performance of a contract (Art. 6(1)(b))"
            ],
            [
              "Plaza submissions",
              "The Skill or plugin you submit and your author identity",
              "Review, publication, distribution, settlement",
              "Performance of a contract (Art. 6(1)(b))"
            ],
            [
              "Product feedback",
              "The text you write, any file or screenshot you attach, app version, and an installation identifier",
              "Diagnose the problem, fix it, and reply to you",
              "Your consent, given by choosing to send it (Art. 6(1)(a))"
            ],
            [
              "Desktop telemetry",
              "Random install identifier (UUID), app version, whitelisted event names, a session sequence key, a small set of non-sensitive attributes",
              "Measure activity and feature use, diagnose crashes",
              "Your consent (Art. 6(1)(a)); can be switched off at any time"
            ],
            [
              "Server logs",
              "Timestamp, request path, status code, IP address, user agent",
              "Keep the service secure, mitigate attacks, diagnose faults",
              "Our legitimate interest in operating a secure service (Art. 6(1)(f))"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**About telemetry:** the IP address of a telemetry request is used in memory for rate limiting only and is **never written to the database**. Nothing records a link between the random install identifier and your account, so we cannot trace telemetry back to a person. Turning telemetry off in settings stops it entirely; nothing else about the product changes."
        },
        {
          "type": "p",
          "text": "Where we rely on legitimate interests, we have weighed that interest against your rights and concluded it does not override them; the processing is limited to security and fault diagnosis, and you may object at any time under clause 10."
        },
        {
          "type": "p",
          "text": "Providing the data marked as necessary for the contract is a condition of having an account: without it we cannot create or run one. Everything based on consent is genuinely optional."
        }
      ]
    },
    {
      "id": "not-collect",
      "title": "3. What we do not collect",
      "blocks": [
        {
          "type": "p",
          "text": "The document and AI-conversation statements below concern local desktop use. The Office/WPS add-in processes documents and conversations through our hosted backend, as explained in clauses 6 and 8. Otherwise, we do not actively collect the following:"
        },
        {
          "type": "ul",
          "items": [
            "Your documents, case files or project files and their contents — the desktop application is local-first and these stay on your device;",
            "Your desktop AI conversations — the desktop application talks to the model provider directly; hosted processing and retention for the Office/WPS add-in are covered separately in clauses 6 and 8;",
            "Special category data under Art. 9 GDPR: we neither ask for nor want data revealing health, ethnicity, political opinions, religion, trade union membership, sex life or biometric identifiers;",
            "Government identifiers, payment card numbers (Stripe handles those and we never see them), location, contacts, call logs, messages or photo libraries;",
            "Your browsing outside this service — we run no third-party analytics or advertising SDK, and we do not buy data about you from anyone."
          ]
        },
        {
          "type": "p",
          "text": "We do not use any of your content to train models, we do not sell personal data, and we do not carry out profiling or automated decision-making that produces legal or similarly significant effects for you."
        }
      ]
    },
    {
      "id": "cookies",
      "title": "4. Cookies",
      "blocks": [
        {
          "type": "p",
          "text": "The site sets one cookie:"
        },
        {
          "type": "table",
          "head": [
            "Name",
            "Purpose",
            "Attributes",
            "Lifetime"
          ],
          "rows": [
            [
              "awd_session",
              "Keeps you signed in",
              "HttpOnly, SameSite=Lax, Secure",
              "30 days"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**This is why there is no cookie banner.** Under the ePrivacy Directive, consent is required for cookies that are not strictly necessary. Ours is strictly necessary — it exists only to keep you signed in and cannot be switched off while you stay signed in. We use no analytics, advertising or cross-site tracking cookies, so there is nothing to ask you about."
        },
        {
          "type": "p",
          "text": "Web fonts are bundled into the site at build time, so loading a page makes no request to any third-party host. You can delete the cookie in your browser; the effect is the same as signing out."
        }
      ]
    },
    {
      "id": "use",
      "title": "5. How we use it",
      "blocks": [
        {
          "type": "ul",
          "items": [
            "Running the service: identifying accounts, checking entitlements, settling charges, delivering what you bought;",
            "Security: spotting anomalous sign-ins and abuse, rate limiting, mitigating attacks, diagnosing faults;",
            "Improving the product: aggregate statistics from anonymous telemetry showing which features get used and where people drop off;",
            "Handling your feedback: reading what you send, reproducing the problem, fixing it and replying to you;",
            "Legal obligations: keeping the tax and accounting records the law requires;",
            "Communicating with you: service changes, security incidents, changes to the terms."
          ]
        },
        {
          "type": "p",
          "text": "We do not use the data for anything else. If we ever need to, we will ask for your consent separately. We do not use personal data for targeted advertising or differential pricing, and we do not send marketing email unless you ask us to."
        }
      ]
    },
    {
      "id": "third-parties",
      "title": "6. Disclosure and third parties",
      "blocks": [
        {
          "type": "callout",
          "text": "**Recipients of add-in AI requests.** Official add-in requests reach the AI WorkDeck cloud backend, then **OpenRouter**, then the inference provider serving the selected model. Available model developers include DeepSeek, Z.ai, Moonshot AI, Alibaba/Qwen, Anthropic, Google, OpenAI and xAI. A model's developer and its inference host can differ depending on routing. Requests include the current question, necessary conversation history, the current document and references the user selects. OpenRouter and each inference provider have their own retention, training and processing-location policies; our transient processing rule does not promise third-party zero retention. See the OpenRouter provider list (https://openrouter.ai/providers/) and OpenRouter privacy policy (https://openrouter.ai/privacy/)."
        },
        {
          "type": "p",
          "text": "We do not provide your personal data to third parties except as follows. Each of these acts as our processor or as an independent controller for its own purposes, under its own published terms."
        },
        {
          "type": "table",
          "head": [
            "Recipient",
            "Data",
            "Purpose",
            "Location"
          ],
          "rows": [
            [
              "Stripe, Inc. and Stripe Payments Europe, Ltd.",
              "Order number, amount, currency, item description, your billing country and any tax registration number you enter; card details go to Stripe directly and never reach us",
              "Take payment, calculate and collect tax, handle refunds and chargebacks",
              "Ireland and United States"
            ],
            [
              "OpenRouter, Inc.",
              "Content you send to the AI; the quota key issued for you",
              "Route model calls, meter usage",
              "United States"
            ],
            [
              "GitHub, Inc.",
              "Network request data when downloading installers",
              "Host installers and open-source code",
              "United States"
            ],
            [
              "Alibaba Cloud (Singapore) Private Limited",
              "Server and network-level technical data for this site",
              "Hosting and network for this site",
              "Singapore"
            ],
            [
              "Our feedback inbox",
              "Only the feedback you actively choose to send, with anything you attach to it",
              "Diagnose and fix the problem you reported",
              "Mainland China — see clause 7"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**Where AI content actually goes deserves a note.** The direct desktop connection described below does not apply to the Office/WPS add-in, which uses the hosted route set out in this clause. When you use the platform AI channel in the desktop application, your content goes **directly** from your machine to OpenRouter and never passes through our servers — we only issue the quota key and cannot see your conversations. When you use the website's \"AI-assisted Skill drafting\", the brief you type is relayed to OpenRouter by our server. Either way, the content leaves the country you are in."
        },
        {
          "type": "p",
          "text": "We may also disclose data where the law requires: complying with a binding order from a court or authority with jurisdiction over us, where necessary to protect the vital interests of any person, or where you have made the information public yourself. Where we are legally permitted to tell you about such a request, we will. In a merger, division or transfer of assets we would transfer personal data along with the business, telling you the recipient's name and contact details beforehand; the recipient must continue to honour this policy."
        }
      ]
    },
    {
      "id": "cross-border",
      "title": "7. International transfers",
      "blocks": [
        {
          "type": "p",
          "text": "This service is operated from Hong Kong on infrastructure in Singapore, and it depends on providers elsewhere. If you are in the EEA, the UK, or any country with transfer rules of its own, your personal data is transferred outside that country in the following cases:"
        },
        {
          "type": "table",
          "head": [
            "Transfer",
            "Destination",
            "Safeguard we rely on"
          ],
          "rows": [
            [
              "Running your account, wallet and the website itself",
              "Hong Kong SAR (controller) and Singapore (hosting)",
              "Necessary for performance of your contract with us (Art. 49(1)(b) GDPR); contractual commitments with the hosting provider"
            ],
            [
              "Content you send through the platform AI channel, the Office/WPS add-in or AI-assisted Skill drafting",
              "United States (OpenRouter, Inc.)",
              "Standard Contractual Clauses in the provider's terms, and necessity for performance of the feature you asked for"
            ],
            [
              "Payments",
              "Ireland and United States (Stripe)",
              "Standard Contractual Clauses in Stripe's data processing agreement; EU-US Data Privacy Framework where applicable"
            ],
            [
              "Installer downloads",
              "United States (GitHub, Inc.)",
              "Necessary for performance; Standard Contractual Clauses in the provider's terms"
            ],
            [
              "Product feedback you choose to send",
              "Mainland China (our own server)",
              "Your explicit consent, given by sending the feedback (Art. 49(1)(a) GDPR)"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**Feedback you send reaches a server in mainland China. We want you to know that before you press send.** The feedback inbox is a machine we operate in Beijing, shared with our China service. Chinese law gives state authorities powers to compel access to data held there that are broader than those in the EEA, the UK or Hong Kong, and no contractual safeguard we could offer would change that. We therefore treat feedback as consent-based and entirely optional: the product works exactly the same if you never send any. **Do not paste client material, case details or anything confidential into a feedback message.** If you want to report a problem without that transfer, email us instead and say so."
        },
        {
          "type": "callout",
          "text": "**AI content can stay in your own region — or on your own machine.** The desktop application lets you configure your own model provider instead of the platform channel, including providers in your own country and models running fully locally. Once you do, AI content no longer passes through OpenRouter. Installer downloads are currently served only by GitHub, which cannot be avoided."
        },
        {
          "type": "p",
          "text": "Where a transfer rests on your consent, you can withdraw it at any time — stop sending feedback, or switch the AI channel — and we stop the corresponding transfer. Withdrawal does not affect the lawfulness of what happened before it. You can ask us for a copy of the relevant transfer safeguards by email."
        }
      ]
    },
    {
      "id": "retention",
      "title": "8. How long we keep it",
      "blocks": [
        {
          "type": "callout",
          "text": "**Add-in document and conversation retention.** Inline document bodies and raw tool arguments/results are used for the current turn and transient memory caches, not stored in the request queue or conversation history. The add-in does not automatically create durable conversation summaries. Queued input bodies expire after at most 30 minutes and may be evicted earlier or lost on restart; a new upload is then required. User messages, AI replies and reasoning remain as conversation history **until the user deletes the conversation, with no separate automatic expiry**. This includes document text pasted by the user or quoted by the AI. Conversation deletion also removes queue requests and derived summaries and clears document caches; billing usage records remain. Copies already mirrored to a desktop project follow that project's rules and are not remotely erased by deleting the cloud conversation. Earlier versions stored inline bodies in the queue and tool excerpts and summaries in conversation storage. This update removes historical inline bodies from the live request queue. It also removes raw tool excerpts and derived summaries from conversations still identifiable as Office/WPS add-in conversations through their request-source records. Historical conversations without those source records cannot be reliably classified and are not covered by this Office-specific cleanup. Operational backups and material already sent to third parties are separate; this is not a promise of retrospective erasure of every copy."
        },
        {
          "type": "table",
          "head": [
            "Category",
            "Retention"
          ],
          "rows": [
            [
              "Account information",
              "While the account exists; deleted or anonymised within 30 days of you closing it"
            ],
            [
              "Session tokens",
              "30 days, then expire automatically"
            ],
            [
              "Account key hashes",
              "Deleted on revocation or account closure"
            ],
            [
              "Orders, ledger, tax and invoicing records",
              "At least 7 years from the end of the relevant financial year (Hong Kong Inland Revenue Ordinance s.51C and Companies Ordinance s.373; longer where the tax law of your own country requires it). **Closing your account does not shorten this** — these records are kept in a restricted form for accounting only."
            ],
            [
              "Plaza submissions",
              "Deleted within 90 days of removal; copies already distributed are unaffected"
            ],
            [
              "Product feedback",
              "24 months, or until the reported issue is closed and any reply to you is sent, whichever is later; deleted on request at any time"
            ],
            [
              "Anonymous telemetry",
              "24 months, then deleted on a rolling basis"
            ],
            [
              "Server logs",
              "90 days"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**On deletion.** You can close your account yourself from your account page. Within 30 days we delete your profile, credentials, account key hashes and session data, and we anonymise everything else that is not covered by the retention rule above. What survives is the financial record: order and ledger rows, stripped down to the transaction identifier, amount, tax data and dates needed to satisfy tax and company law. That subset is not something we are allowed to delete on request, and no provider in this position can honestly promise otherwise."
        },
        {
          "type": "p",
          "text": "Beyond these periods we delete or anonymise. Where the law requires longer, the law governs."
        }
      ]
    },
    {
      "id": "security",
      "title": "9. How we protect it",
      "blocks": [
        {
          "type": "ul",
          "items": [
            "In transit: HTTPS is enforced site-wide;",
            "Passwords: stored as salted scrypt hashes — we cannot recover your original password;",
            "Account keys: only the hash and prefix are stored; the plaintext is shown to you once at generation and then exists nowhere in our systems;",
            "Payment card data: never touches our servers — it goes from your browser to Stripe;",
            "Model keys: stored encrypted;",
            "Access control: production access is limited to those who need it;",
            "Durability: financial data is written transactionally and backed up regularly."
          ]
        },
        {
          "type": "p",
          "text": "No system is perfectly secure. If a personal data breach occurs that is likely to result in a risk to your rights and freedoms, we will notify the competent supervisory authority without undue delay and, where the risk is high, tell you directly."
        }
      ]
    },
    {
      "id": "rights",
      "title": "10. Your rights",
      "blocks": [
        {
          "type": "p",
          "text": "If the GDPR, the UK GDPR or a comparable law applies to you, you have the following rights over the personal data we hold about you. We honour them for everyone, wherever you are."
        },
        {
          "type": "ul",
          "items": [
            "**Access** — find out whether we process data about you, what and why, and obtain a copy (Art. 15);",
            "**Rectification** — have inaccurate or incomplete data corrected; you can also edit your account details yourself (Art. 16);",
            "**Erasure** — have your data deleted where the purpose is fulfilled, you withdraw consent, you successfully object, or we have processed unlawfully. You can trigger this yourself by closing your account; the limits are in clause 8 (Art. 17);",
            "**Portability** — receive the data you gave us in a structured, commonly used, machine-readable format, and have it sent to another controller where technically feasible (Art. 20);",
            "**Restriction** — have processing paused while a dispute about accuracy or lawfulness is resolved (Art. 18);",
            "**Objection** — object to processing based on our legitimate interests, including the security logging described in clause 2 (Art. 21);",
            "**Withdraw consent** — for anything based on consent, such as telemetry and feedback, at any time and without giving a reason (Art. 7(3));",
            "**Not be subject to automated decision-making** — we do not carry out any that produces legal or similarly significant effects (Art. 22);",
            "**Complain to a supervisory authority** — see clause 13."
          ]
        },
        {
          "type": "p",
          "text": "How to exercise them: edit your details, revoke account keys, switch telemetry off, and close your account yourself from your account page. For anything else, write to  saying which account you mean and what you want. We may ask you to verify your identity, and we will not ask for more identifying data than necessary to do so."
        },
        {
          "type": "callout",
          "text": "**We respond within one month.** If a request is complex or you have made several, we may extend by up to two further months, and we will tell you within the first month why. Exercising these rights is free; we only charge, or decline, where a request is manifestly unfounded or excessive, and we explain our reasoning if that ever happens."
        }
      ]
    },
    {
      "id": "minors",
      "title": "11. Children",
      "blocks": [
        {
          "type": "p",
          "text": "The Service is aimed at professionals and is not offered to anyone under 18. We do not knowingly collect personal data from children. If we learn that we hold data about a child, we delete it promptly."
        },
        {
          "type": "p",
          "text": "A parent or guardian who becomes aware of such a case can reach us at  and we will act on it without delay."
        }
      ]
    },
    {
      "id": "changes",
      "title": "12. Changes to this policy",
      "blocks": [
        {
          "type": "p",
          "text": "We may revise this policy. For substantive changes — new purposes, new categories of data, new recipients or new transfer destinations — we will notify you by website announcement and by email at least 30 days before they take effect, and we will seek fresh consent where the law requires it."
        },
        {
          "type": "p",
          "text": "The effective date at the top of this page always reflects the current version. Earlier versions are available on request by email."
        }
      ]
    },
    {
      "id": "contact",
      "title": "13. Contact and complaints",
      "blocks": [
        {
          "type": "p",
          "text": "For any question, request or complaint about this policy or our handling of your personal data, write to . We reply within one month."
        },
        {
          "type": "p",
          "text": "Please raise it with us first — most things are quicker to fix directly. But you do not have to, and you never lose the right to go elsewhere:"
        },
        {
          "type": "ul",
          "items": [
            "If you are in the EEA, you may lodge a complaint with the data protection authority of the country where you live, where you work, or where the alleged infringement took place;",
            "If you are in the UK, with the Information Commissioner's Office;",
            "If you are in Hong Kong, with the Office of the Privacy Commissioner for Personal Data;",
            "Elsewhere, with whichever authority supervises data protection where you live."
          ]
        },
        {
          "type": "p",
          "text": "You may also pursue a judicial remedy, or use the dispute resolution route set out in the Terms of Service."
        }
      ]
    }
  ]
});
export default legalDoc;
