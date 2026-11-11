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
  "title": "Privacy Policy",
  "effectiveLabel": "Effective {__T_LEGAL_EFFECTIVE_DATE__}",
  "intro": "This policy explains how  () collects, uses, stores and discloses personal information when you use the AI WorkDeck website and desktop application, and what rights you have. We suggest reading it in full; if you only want the gist, the summary below covers it.",
  "highlightsTitle": "The short version",
  "highlights": [
    "**The Office/WPS add-in uses cloud processing.** The current document, necessary conversation history and references you select reach our hosted backend, then Alibaba Cloud Model Studio and the inference provider serving your selected model. Raw document bodies use transient memory; user messages, AI replies and reasoning remain until you delete the conversation. See clauses 6 and 8.",
    "Masaüstü belgeleri, projeler ve çalışma geçmişi cihazınızda kalır. Platform yapay zekâsı çağrıldığında gerekli metin, dosya parçaları, görüntüler ve bağlam Çin ağ geçidinden Model Studio’ya gönderilir. Yerel saklama, isteklerin sunucularımızdan geçmediği anlamına gelmez.",
    "**Six platform-sourced services do pass through our servers** (text recognition, web search, company registry data, securities and financial data, statute and case law search, meeting transcription): we buy from the vendor on your behalf so you need no key of your own, and the content each call requires is relayed through us to that vendor. **All six vendors are inside mainland China, so this tier involves no cross-border transfer.** Only meeting audio is held briefly on our side, and it is deleted once transcription finishes. Any of them can be switched to your own key or turned off. See clauses 2, 6, 7 and 8.",
    "**The site sets exactly one cookie** (`awd_session`, to keep you signed in). There is no third-party analytics, advertising or tracking code, and web fonts are self-hosted, so no request goes to a third party.",
    "**Desktop telemetry is anonymous**: a random install identifier, the app version and whitelisted event names. No IP address is stored, nothing is linked to your account, no document content is included, and it can be switched off.",
    "Pekin üzerinden erişim, tüm çıkarımların Çin ana karasında yapıldığı anlamına gelmez. İşleme yeri seçilen modelin dağıtım bilgisine bağlıdır; China Elastic Zone modelleri ana kara dışında işlem yapabilir. Yurt dışından site erişimi Singapur önbellek düğümünü kullanmayı sürdürür.",
    "**To exercise your rights** (access, correction, deletion, account closure, withdrawal of consent), write to . We respond within fifteen working days."
  ],
  "tocTitle": "Contents",
  "sections": [
    {
      "id": "controller",
      "title": "1. Who we are",
      "blocks": [
        {
          "type": "p",
          "text": "Personal information handler:  (), unified social credit code ."
        },
        {
          "type": "p",
          "text": "For anything concerning personal information protection, contact . The same address reaches the person responsible for personal information protection."
        },
        {
          "type": "p",
          "text": "This policy covers the AI WorkDeck website, desktop application, Office add-ins and related services. It exists in Chinese and English; in the event of any discrepancy, the Chinese version prevails."
        }
      ]
    },
    {
      "id": "collect",
      "title": "2. What we collect",
      "blocks": [
        {
          "type": "p",
          "text": "We collect on a \"no more than needed\" basis. The table sets out what we collect, why, and on what basis."
        },
        {
          "type": "table",
          "head": [
            "Context",
            "Information",
            "Purpose",
            "Basis"
          ],
          "rows": [
            [
              "Registration",
              "Username, email, password, display name, bio (optional)",
              "Create and identify your account, account recovery, public profile",
              "Necessary to enter into and perform the contract"
            ],
            [
              "Staying signed in",
              "Session token (in the awd_session cookie)",
              "Maintain your session",
              "Necessary to perform the contract"
            ],
            [
              "Password storage",
              "Salted scrypt hash only",
              "Verify your password",
              "Necessary to perform the contract"
            ],
            [
              "Top-ups and payments",
              "Order number, WeChat Pay transaction ID, payer WeChat openid, amount, status, timestamps",
              "Take payment, reconcile, handle refunds and disputes",
              "Contract + legal obligation (tax and bookkeeping)"
            ],
            [
              "Wallet and transactions",
              "Balance, ledger entries, purchases, entitlements, creator earnings",
              "Accounting, entitlement checks, settlement",
              "Necessary to perform the contract"
            ],
            [
              "Account keys",
              "SHA-256 hash and prefix only; no plaintext retained",
              "Authenticate the desktop application",
              "Necessary to perform the contract"
            ],
            [
              "AI credit",
              "Sınırlı çağrı kimlik bilgileri, hesap yetkilendirmesi, modeller, kullanım ve hesaplaşma kayıtları",
              "Provision and meter your AI credit",
              "Necessary to perform the contract"
            ],
            [
              "Plaza submissions",
              "The Skill or plugin you submit and your author identity",
              "Review, publication, distribution, settlement",
              "Necessary to perform the contract"
            ],
            [
              "Desktop telemetry",
              "Random install identifier (UUID), app version, whitelisted event names, a conversation sequence key, a small set of non-sensitive attributes",
              "Measure activity and feature use, diagnose crashes",
              "Your consent (can be switched off)"
            ],
            [
              "Platform-sourced external services",
              "The content each call requires (the image to recognize, a search query, a company name, a ticker, a search term, meeting audio), plus one ledger entry containing no content (service, quantity, amount, timestamp)",
              "Call the vendor on your behalf and meter the usage",
              "Necessary to perform the contract (your call is the request)"
            ],
            [
              "Server logs",
              "Timestamp, request path, status code, IP address",
              "Security, troubleshooting, attack mitigation",
              "Reasonably necessary security maintenance + legal obligation"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**About telemetry:** the IP address of a telemetry request is used in memory for rate limiting only and is **never written to the database**. Nothing records a link between the random install identifier and your account, so we cannot trace telemetry back to a person."
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
            "Your documents, case files or project files and their contents — the desktop application is local-first and these stay on your device. **When you hand a specific piece of content to a specific external service** (an image to text recognition, a recording to transcription): we then relay the part of it that the call requires to the vendor. Apart from meeting audio held briefly, we retain none of it (see clauses 6 and 8);",
            "Masaüstü konuşmaları platform yapay zekâsı çağrılırken Çin ağ geçidinden geçer; faturalama kayıtları ve defterleri içeriği saklamaz. Eklenti konuşmalarının saklanması ve silinmesi 6. ve 8. maddelere tabidir.",
            "Sensitive personal information such as phone numbers, ID numbers, facial images or fingerprints;",
            "Location, contacts, call logs, messages or photo libraries;",
            "Your browsing outside this service — we run no third-party analytics or advertising SDK."
          ]
        },
        {
          "type": "p",
          "text": "We do not use any of your content to train models, and we do not sell personal information."
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
              "HttpOnly, SameSite=Lax",
              "30 days"
            ]
          ]
        },
        {
          "type": "p",
          "text": "This cookie is strictly necessary for signing in and cannot be disabled while staying signed in. We use no analytics, advertising or cross-site tracking cookies. Web fonts are bundled into the site at build time, so loading a page makes no font request to any third party."
        },
        {
          "type": "p",
          "text": "You can delete the cookie in your browser; the effect is the same as signing out."
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
            "Legal obligations: keeping records required by tax, accounting and cybersecurity rules;",
            "Communicating with you: service changes, security incidents, changes to the terms."
          ]
        },
        {
          "type": "p",
          "text": "We do not use the information for anything else. If we ever need to, we will ask for your consent separately. We do not carry out automated decision-making, and we do not use personal information for targeted messaging or differential pricing."
        }
      ]
    },
    {
      "id": "third-parties",
      "title": "6. Disclosure and third parties",
      "blocks": [
        {
          "type": "callout",
          "text": "Çin sitesinin platform yapay zekâsı (masaüstü sohbeti, Office/WPS eklentileri ve yapay zekâ ile Skill yazımı), AI WorkDeck’in Çin sunucusundan Alibaba Cloud Model Studio’nun Pekin erişim noktasına ve gerçek model sağlayıcısına iletilir. Ağ geçidinin faturalama defteri hesap, model, kullanım ve maliyeti kaydeder; iletilen içeriği kaydetmez. Eklenti konuşmaları ve Skill için mevcut saklama kuralları değişmez. Model Studio ve çıkarım sağlayıcıları kendi saklama, eğitim ve işleme yeri politikalarını uygular. Ağ geçidi kurallarımız üçüncü tarafların sıfır saklama yapacağını garanti etmez. Model dağıtımı: https://help.aliyun.com/zh/model-studio/beijing-access-information"
        },
        {
          "type": "p",
          "text": "We do not provide your personal information to third parties except as follows:"
        },
        {
          "type": "table",
          "head": [
            "Recipient",
            "Information",
            "Purpose",
            "Location"
          ],
          "rows": [
            [
              "Tenpay Payment Technology Co., Ltd. (WeChat Pay)",
              "Order number, amount, item description",
              "Collect payment, refunds, reconciliation",
              "Mainland China"
            ],
            [
              "Alibaba Cloud Model Studio ve gerçek model sağlayıcıları",
              "Güncel soru, gerekli konuşma geçmişi, dosya parçaları ve görüntüler",
              "Model çıkarımı, kullanım ölçümü ve hesaplaşma",
              "Pekin erişimi; işleme yeri model dağıtımına bağlıdır ve Çin ana karası dışında olabilir"
            ],
            [
              "GitHub, Inc.",
              "Network request data when downloading installers",
              "Host installers and open-source code",
              "United States"
            ],
            [
              "Alibaba Cloud Computing Ltd.",
              "Server and network-level technical data",
              "Hosting and network acceleration",
              "Mainland China + Singapore node"
            ],
            [
              "Alibaba Cloud (Tingwu)",
              "Your meeting audio and its transcript",
              "Speech transcription and speaker separation",
              "Mainland China"
            ],
            [
              "Alibaba Cloud (OCR)",
              "The image you submit for recognition",
              "Image text recognition",
              "Mainland China"
            ],
            [
              "Bocha (web search)",
              "Your search query",
              "Return web search results",
              "Mainland China"
            ],
            [
              "Qichacha",
              "The company name or unified social credit code you look up",
              "Return company registry data",
              "Mainland China"
            ],
            [
              "Tushare",
              "The ticker and fields you query",
              "Return securities and financial data",
              "Mainland China"
            ],
            [
              "PKULaw",
              "Your statute and case law search term",
              "Return statute and case law results",
              "Mainland China"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**How the six platform-sourced services flow.** The last six rows are the vendors behind the \"platform-sourced\" tier: we buy from them on your behalf, so you need no key of your own, and the content each call requires is relayed to the vendor through our servers and metered against your balance. **All six are inside mainland China**, so this tier involves no cross-border transfer. We do not log, store or train on what we relay; the sole exception is meeting audio, which is held briefly in our object storage so the transcription service can read it and is deleted once that finishes (see clause 8). Any of them can be switched, under Settings → Platform Services in the desktop app, to your own key (the app then talks to that vendor directly, bypassing us) or turned off entirely."
        },
        {
          "type": "callout",
          "text": "Çin sitesinin platform yapay zekâsı (masaüstü sohbeti, Office/WPS eklentileri ve yapay zekâ ile Skill yazımı), AI WorkDeck’in Çin sunucusundan Alibaba Cloud Model Studio’nun Pekin erişim noktasına ve gerçek model sağlayıcısına iletilir. Ağ geçidinin faturalama defteri hesap, model, kullanım ve maliyeti kaydeder; iletilen içeriği kaydetmez. Eklenti konuşmaları ve Skill için mevcut saklama kuralları değişmez. Pekin üzerinden erişim, tüm çıkarımların Çin ana karasında yapıldığı anlamına gelmez. İşleme yeri seçilen modelin dağıtım bilgisine bağlıdır; China Elastic Zone modelleri ana kara dışında işlem yapabilir. Yurt dışından site erişimi Singapur önbellek düğümünü kullanmayı sürdürür."
        },
        {
          "type": "p",
          "text": "We may also disclose information where the law requires: cooperating with judicial or administrative authorities, where necessary to protect the public interest or someone's vital interests, or where you have made the information public yourself. In a merger, division or transfer of assets we will transfer personal information along with the business, telling you the recipient's name and contact details beforehand; the recipient must continue to honour this policy or seek your consent afresh."
        }
      ]
    },
    {
      "id": "cross-border",
      "title": "7. Transfers outside mainland China",
      "blocks": [
        {
          "type": "p",
          "text": "Given the architecture described above, your information is transferred outside mainland China in the following cases:"
        },
        {
          "type": "ul",
          "items": [
            "Pekin üzerinden erişim, tüm çıkarımların Çin ana karasında yapıldığı anlamına gelmez. İşleme yeri seçilen modelin dağıtım bilgisine bağlıdır; China Elastic Zone modelleri ana kara dışında işlem yapabilir. Yurt dışından site erişimi Singapur önbellek düğümünü kullanmayı sürdürür.",
            "Downloading a desktop installer sends your request to GitHub, Inc. in the United States;",
            "Visitors outside mainland China are served by a cache node in Singapore, which fetches from the origin server in Beijing."
          ]
        },
        {
          "type": "callout",
          "text": "**The six platform-sourced services do not leave the country.** The vendors behind text recognition, web search, company registry data, securities and financial data, statute and case law search and meeting transcription are all inside mainland China (see clause 6). Content in that tier never leaves the mainland, and no separate cross-border consent is required for it. The three cases listed above are the complete set of transfers."
        },
        {
          "type": "callout",
          "text": "Kendi anahtarınız yapılandırılan sağlayıcının yolunu ve politikalarını kullanır; tamamen yerel modeller içeriği cihazda işler. İşleme yerleri için modelin dağıtım bilgisine bakın. Kurulum dosyaları GitHub üzerinden dağıtılmaya devam eder."
        },
        {
          "type": "p",
          "text": "As required by the Personal Information Protection Law, we tell you separately the name and contact details of each overseas recipient, the purpose and method of processing, the categories of information involved and how to exercise your rights against that recipient, and we obtain your separate consent. You may withdraw that consent at any time; we will then stop the corresponding transfer, though the related features will no longer work."
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
              "While the account exists; deleted or anonymised within 30 days of closure"
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
              "Orders, ledger and invoicing records",
              "At least 10 years from completion of the transaction (Article 29 of the Detailed Rules for the Implementation of the Tax Collection and Administration Law); closing your account does not shorten this"
            ],
            [
              "Plaza submissions",
              "Deleted within 90 days of removal; copies already distributed are unaffected"
            ],
            [
              "Content relayed for platform-sourced calls",
              "Not retained. It passes through our servers only while that call is being made"
            ],
            [
              "Meeting audio files",
              "Deleted by the program as soon as transcription finishes or the task fails; a 24-hour lifecycle rule on the object storage clears anything missed. The transcript is not kept on our side once returned to the desktop app"
            ],
            [
              "Anonymous telemetry",
              "24 months, then deleted on a rolling basis"
            ],
            [
              "Server logs",
              "6 months (Article 21 of the Cybersecurity Law requires no less than 6 months)"
            ]
          ]
        },
        {
          "type": "p",
          "text": "Bu sürelerin ötesinde verileri siler veya anonim hale getiririz. Kanunun daha uzun süre gerektirdiği durumlarda kanun hükmü geçerlidir."
        }
      ]
    },
    {
      "id": "security",
      "title": "9. Verileri nasıl koruyoruz",
      "blocks": [
        {
          "type": "ul",
          "items": [
            "Aktarım sırasında: HTTPS site genelinde zorunludur;",
            "Şifreler: tuzlanmış scrypt karma değerleri olarak saklanır — orijinal şifrenizi kurtaramayız;",
            "Hesap anahtarları: yalnızca karma değeri ve öneki saklanır; düz metin, oluşturulduğunda size bir kez gösterilir ve daha sonra sistemlerimizde hiçbir yerde bulunmaz;",
            "Model anahtarları: şifreli olarak saklanır;",
            "Erişim kontrolü: üretim ortamına erişim, ihtiyacı olanlarla sınırlıdır;",
            "Dayanıklılık: finansal veriler işlemsel olarak yazılır ve düzenli olarak yedeklenir."
          ]
        },
        {
          "type": "p",
          "text": "Hiçbir sistem mükemmel şekilde güvenli değildir. Kişisel bilgileriniz size zarar verebilecek şekilde sızılır, değiştirilir veya kaybolursa, derhal düzeltici işlem yapar ve kanunun gerektirdiği şekilde sizi ve yetkili makamları bilgilendiririz."
        }
      ]
    },
    {
      "id": "rights",
      "title": "10. Haklarınız",
      "blocks": [
        {
          "type": "p",
          "text": "Kişisel Bilgilerin Korunması Kanunu kapsamında, işlediğimiz kişisel bilgileriniz üzerinde şu haklara sahipsiniz:"
        },
        {
          "type": "ul",
          "items": [
            "**Erişim ve kopyalama** — hakkınızda hangi bilgileri tuttuğumuzu öğrenme ve bir kopyasını alma;",
            "**Düzeltme ve tamamlama** — hatalı veya eksik bilgilerin düzeltilmesini talep etme; hesap bilgilerini kendiniz de düzenleyebilirsiniz;",
            "**Silme** — amaç yerine getirildiğinde, onayınızı geri çektiğinizde veya yasa dışı işleme yaptığımızda;",
            "**Taşınabilirlik** — ulusal siber uzay otoritesinin belirlediği koşulları karşılaması halinde, bilgilerinizin belirttiğiniz başka bir işleyiciye aktarılmasını talep etme;",
            "**Onayı geri çekme** — telemetri ve sınır ötesi aktarımlar gibi onay esasına dayalı işlenen her şey için;",
            "**Kısıtlama veya itiraz** — belirli bir işlemeyi sınırlamamızı veya reddetmemizi talep etme;",
            "**Açıklama** — bu politikayı ve işleme kurallarımızı açıklamamızı talep etme;",
            "**Hesabınızı kapatma** — dilediğiniz zaman; bu durumda bilgilerinizi 8. maddede belirtilen şekilde işleriz."
          ]
        },
        {
          "type": "p",
          "text": "Haklarınızı kullanma: hesap bilgilerinizi düzenleyebilir ve hesap anahtarlarınızı kendiniz hesabınızdan iptal edebilirsiniz; diğer her şey için, hesabınızı ve isteğinizi belirterek bize yazın. Önce kimliğinizi doğrulamanızı isteyebiliriz. On beş iş günü içinde yanıt veririz ve karmaşık bir isteğin daha uzun süre gerektirmesi halinde bunu açıklarız."
        },
        {
          "type": "p",
          "text": "Vefat eden bir kullanıcının yakın akrabası, kullanıcı hayatı boyunca aksini düzenlemediği takdirde, o kullanıcının ilgili kişisel bilgileri üzerinde erişim, kopyalama, düzeltme ve silme haklarını kullanabilir."
        }
      ]
    },
    {
      "id": "minors",
      "title": "11. Küçükler",
      "blocks": [
        {
          "type": "p",
          "text": "Hizmet profesyonellere yöneliktir ve 14 yaşından küçük çocuklara sunulmaz. Çocukların kişisel bilgilerini bilerek toplamıyoruz. Veli onayı önceden alınmadan topladığımızı fark edersek, bu bilgileri derhal sileriz."
        },
        {
          "type": "p",
          "text": "Böyle bir durumdan haberdar olan veliler bize şu adresten ulaşabilir: ."
        }
      ]
    },
    {
      "id": "changes",
      "title": "12. Bu politikadaki değişiklikler",
      "blocks": [
        {
          "type": "p",
          "text": "Bu politikayı revize edebiliriz. Amaçlar, yöntemler veya bilgi kategorilerinde yapılan köklü değişiklikler için yürürlüğe girmeden önce size web sitesi duyurusu veya e-posta yoluyla bilgi verir ve yasaların gerektirdiği durumlarda yeni onay alırız."
        },
        {
          "type": "p",
          "text": "Önceki sürümler, talep üzerine e-posta yoluyla temin edilebilir."
        }
      ]
    },
    {
      "id": "contact",
      "title": "13. İletişim ve şikayetler",
      "blocks": [
        {
          "type": "p",
          "text": "Bu politika veya kişisel bilgilerin işlenmesiyle ilgili herhangi bir soru, yorum veya şikayet için adresine yazın. On beş iş günü içinde yanıt veriyoruz."
        },
        {
          "type": "p",
          "text": "İşleme faaliyetlerimizin haklarınıza zarar verdiğini düşünüyorsanız ve yanıtımız sorunu çözmiyorsa, ayrıca yerel siber uzay, telekomünikasyon, kamu güvenliği veya piyasa düzenleme makamlarına şikayette bulunabilir ya da Hizmet Şartları'nda belirtilen uyuşmazlık çözümü yolunu izleyebilirsiniz."
        }
      ]
    }
  ]
});
export default legalDoc;
