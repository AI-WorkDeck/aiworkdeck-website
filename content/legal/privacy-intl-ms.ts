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
  "title": "Dasar Privasi",
  "effectiveLabel": "Effective {__T_SITE_LEGAL_EFFECTIVE_DATE__}",
  "intro": "This policy explains how  collects, uses, stores and discloses personal data when you use {__T_siteConfig_host__} and the AI WorkDeck desktop application, and what rights you have. We suggest reading it in full; if you only want the gist, the summary below covers it.",
  "highlightsTitle": "The short version",
  "highlights": [
    "**The Office/WPS add-in uses cloud processing.** The current document, necessary conversation history and references you select reach our hosted backend, then OpenRouter and the inference provider serving your selected model. Raw document bodies use transient memory; user messages, AI replies and reasoning remain until you delete the conversation. See clauses 6 and 8.",
    "**The desktop application is local-first:** your documents, projects and work history stay on your own machine. They are not uploaded, not retained, and never used to train models.",
    "**The site sets exactly one cookie** (`awd_session`, to keep you signed in). It is strictly necessary, so there is no consent banner to click through. No third-party analytics, no advertising, no tracking, and web fonts are self-hosted.",
    "**Desktop telemetry is anonymous**: a random install identifier, the app version and whitelisted event names. No IP address is stored, nothing is linked to your account, no document content is included, and it can be switched off in settings.",
    "**Three things leave the country you are in.** Content you send to the AI goes to OpenRouter in the United States. Payments go to Stripe. **Product feedback you choose to send goes to a server we operate in mainland China** — clause 7 explains why and what that means.",
    "**You can delete your account yourself** from your account page. We delete or anonymise your data within 30 days, except transaction records we are legally required to keep — see clause 8.",
    "**Your rights** — access, rectification, erasure, portability, restriction, objection, withdrawal of consent — are set out in clause 10. Write to ; we respond within one month. You may also complain to the data protection authority where you live.",
    "**This site and {__T_siteConfig_otherSite_host__} hold separate data.** Different controller, different database, different country. Neither can see the other's accounts."
  ],
  "tocTitle": "Contents",
  "sections": [
    {
      "id": "controller",
      "title": "1. Who we are",
      "blocks": [
        {
          "type": "p",
          "text": "The data controller is , a company incorporated in the Hong Kong Special Administrative Region under the Companies Ordinance (Cap. 622),  , registered office ."
        },
        {
          "type": "p",
          "text": "For anything concerning privacy or data protection — including exercising your rights — write to . That address reaches the person responsible for data protection at our company."
        },
        {
          "type": "p",
          "text": "This policy covers {__T_siteConfig_host__}, the desktop application, the Office add-ins and related services."
        },
        {
          "type": "callout",
          "text": "**{__T_siteConfig_otherSite_host__} is a separate service with a separate controller and a separate database, hosted in a different country under different law.** Your account here does not exist there, and nothing in this policy describes how that site handles data. If you registered there, read that site's policy instead."
        },
        {
          "type": "p",
          "text": "This policy exists in English and Chinese. In the event of any discrepancy, the English version prevails."
        }
      ]
    },
    {
      "id": "collect",
      "title": "2. What we collect, why, and on what legal basis",
      "blocks": [
        {
          "type": "p",
          "text": "We collect on a \"no more than needed\" basis. The table sets out each category of personal data, what we use it for, and the legal basis we rely on under the GDPR and equivalent laws."
        },
        {
          "type": "table",
          "head": [
            "Context",
            "Data",
            "Purpose",
            "Legal basis"
          ],
          "rows": [
            [
              "Registration",
              "Username, email, password, display name, bio (optional)",
              "Create and identify your account, account recovery, public profile",
              "Performance of a contract (Art. 6(1)(b))"
            ],
            [
              "Staying signed in",
              "Session token (in the awd_session cookie)",
              "Maintain your session",
              "Performance of a contract (Art. 6(1)(b))"
            ],
            [
              "Password storage",
              "Salted scrypt hash only",
              "Verify your password",
              "Performance of a contract (Art. 6(1)(b))"
            ],
            [
              "Payments",
              "Order number, Stripe payment identifier, amount, currency, tax status, country, payment status, timestamps",
              "Take payment, calculate tax, reconcile, handle refunds and chargebacks",
              "Contract (Art. 6(1)(b)) + legal obligation for tax and accounting records (Art. 6(1)(c))"
            ],
            [
              "Wallet and transactions",
              "Balance, ledger entries, purchases, entitlements, creator earnings",
              "Accounting, entitlement checks, settlement",
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
            "Nama",
            "Purpose",
            "Attributes",
            "Lifetime"
          ],
          "rows": [
            [
              "awd_session",
              "Keeps you signed in",
              "HttpOnly, SameSite=Lax, Secure",
              "30 hari"
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
            "Penerima",
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
          "text": "**Pengekalan dokumen dan perbualan add-in.** Badan dokumen inline serta hujah/hasil alat mentah digunakan untuk giliran semasa dan cache memori sementara, tidak disimpan dalam baris gilir permintaan atau sejarah perbualan. Add-in tidak mencipta ringkasan perbualan kekal secara automatik. Badan input yang dibaris gilirkan luput selewat-lewatnya 30 minit dan mungkin disingkirkan lebih awal atau hilang semasa but semula; muat naik baharu diperlukan selepas itu. Mesej pengguna, balasan AI dan penaakalan kekal sebagai sejarah perbualan **sehingga pengguna memadamkan perbualan, tanpa luput automatik yang berasingan**. Ini termasuk teks dokumen yang ditampal oleh pengguna atau dipetik oleh AI. Pemadaman perbualan juga memadamkan permintaan dalam baris gilir dan ringkasan terbitan serta mengosongkan cache dokumen; rekod penggunaan pengebilan kekal. Salinan yang telah dimirorkan ke projek desktop tertakluk kepada peraturan projek tersebut dan tidak dipadamkan secara jauh dengan memadamkan perbualan awan. Versi terdahulu menyimpan badan inline dalam baris gilir serta petikan alat dan ringkasan dalam storan perbualan. Kemas kini ini membuang badan inline bersejarah daripada baris gilir permintaan aktif. Ia juga membuang petikan alat mentah dan ringkasan terbitan daripada perbualan yang masih boleh dikenal pasti sebagai perbualan add-in Office/WPS melalui rekod sumber permintaan mereka. Perbualan bersejarah tanpa rekod sumber tersebut tidak dapat dikelaskan secara boleh dipercayai dan tidak diliputi oleh pembersihan khusus Office ini. Sandaran operasional dan bahan yang telah dihantar kepada pihak ketiga adalah berasingan; ini bukan janji pemadaman retroaktif bagi setiap salinan."
        },
        {
          "type": "table",
          "head": [
            "Kategori",
            "Pengekalan"
          ],
          "rows": [
            [
              "Maklumat akaun",
              "Selagi akaun wujud; dipadamkan atau dianonimkan dalam tempoh 30 hari selepas anda menutupnya"
            ],
            [
              "Token sesi",
              "30 hari, kemudian luput secara automatik"
            ],
            [
              "Cincangan kunci akaun",
              "Dipadamkan apabila dibatalkan atau akaun ditutup"
            ],
            [
              "Rekod pesanan, lejar, cukai dan invois",
              "Sekurang-kurangnya 7 tahun dari akhir tahun kewangan berkaitan (Inland Revenue Ordinance Hong Kong s.51C dan Companies Ordinance s.373; lebih lama jika undang-undang cukai negara anda menghendakinya). **Menutup akaun anda tidak memendekkan tempoh ini** — rekod ini disimpan dalam bentuk terhad untuk tujuan perakaunan sahaja."
            ],
            [
              "Penghantaran Plaza",
              "Dipadamkan dalam tempoh 90 hari selepas penyingkiran; salinan yang telah diedarkan tidak terjejas"
            ],
            [
              "Maklum balas produk",
              "24 bulan, atau sehingga isu yang dilaporkan ditutup dan sebarang balasan kepada anda dihantar, yang mana lebih lewat; dipadamkan atas permintaan pada bila-bila masa"
            ],
            [
              "Telemetri tanpa nama",
              "24 bulan, kemudian dipadamkan secara bergulir"
            ],
            [
              "Log pelayan",
              "90 hari"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**Mengenai pemadaman.** Anda boleh menutup akaun anda sendiri dari halaman akaun anda. Dalam tempoh 30 hari kami memadamkan profil, kelayakan, cincangan kunci akaun dan data sesi anda, serta menganonimkan segala yang lain yang tidak diliputi oleh peraturan pengekalan di atas. Yang kekal ialah rekod kewangan: baris pesanan dan lejar, diringkaskan kepada pengecam transaksi, jumlah, data cukai dan tarikh yang diperlukan untuk memenuhi undang-undang cukai dan syarikat. Subset tersebut bukan sesuatu yang kami dibenarkan memadamkan atas permintaan, dan tiada penyedia dalam kedudukan ini boleh menjanjikan sebaliknya dengan jujur."
        },
        {
          "type": "p",
          "text": "Melangkaui tempoh ini kami memadamkan atau menganonimkan. Jika undang-undang menghendaki tempoh lebih lama, undang-undang yang berkuat kuasa."
        }
      ]
    },
    {
      "id": "security",
      "title": "9. Bagaimana kami melindunginya",
      "blocks": [
        {
          "type": "ul",
          "items": [
            "Semasa penghantaran: HTTPS dikuatkuasakan di seluruh laman;",
            "Kata laluan: disimpan sebagai cincangan scrypt bergaram — kami tidak boleh memulihkan kata laluan asal anda;",
            "Kunci akaun: hanya cincangan dan awalan disimpan; teks biasa ditunjukkan kepada anda sekali semasa penjanaan dan kemudian tidak wujud di mana-mana dalam sistem kami;",
            "Data kad pembayaran: tidak pernah menyentuh pelayan kami — ia pergi terus dari pelayar anda ke Stripe;",
            "Kunci model: disimpan dalam keadaan disulitkan;",
            "Kawalan akses: akses kepada persekitaran pengeluaran dihadkan kepada mereka yang memerlukannya;",
            "Ketahanan: data kewangan ditulis secara transaksional dan disandarkan secara berkala."
          ]
        },
        {
          "type": "p",
          "text": "Tiada sistem yang benar-benar selamat. Sekiranya berlaku pelanggaran data peribadi yang berkemungkinan menimbulkan risiko kepada hak dan kebebasan anda, kami akan memaklumkan kepada pihak berkuasa pengawasan yang berkecekapan tanpa kelewatan yang tidak wajar dan, jika risikonya tinggi, kami akan memaklumkan anda secara terus."
        }
      ]
    },
    {
      "id": "rights",
      "title": "10. Hak anda",
      "blocks": [
        {
          "type": "p",
          "text": "Jika GDPR, UK GDPR atau undang-undang yang setara terpakai kepada anda, anda mempunyai hak-hak berikut ke atas data peribadi yang kami pegang tentang anda. Kami menghormati hak tersebut untuk semua orang, di mana sahaja anda berada."
        },
        {
          "type": "ul",
          "items": [
            "**Akses** — mengetahui sama ada kami memproses data tentang anda, apa dan mengapa, serta memperoleh salinannya (Art. 15);",
            "**Pembetulan** — meminta data yang tidak tepat atau tidak lengkap diperbetulkan; anda juga boleh mengedit butiran akaun anda sendiri (Art. 16);",
            "**Pemadaman** — meminta data anda dipadamkan apabila tujuannya telah dipenuhi, anda menarik balik persetujuan, anda berjaya membantah, atau kami telah memprosesnya secara menyalahi undang-undang. Anda boleh melakukannya sendiri dengan menutup akaun anda; had-hadnya dinyatakan dalam klausa 8 (Art. 17);",
            "**Kebolehpindahan** — menerima data yang anda berikan kepada kami dalam format berstruktur, yang lazim digunakan dan boleh dibaca oleh mesin, serta meminta ia dihantar kepada pengawal lain jika boleh dilaksanakan dari segi teknikal (Art. 20);",
            "**Pembatasan** — meminta pemprosesan dihentikan sementara sementara pertikaian tentang ketepatan atau kesahan diselesaikan (Art. 18);",
            "**Bantahan** — membantah pemprosesan berdasarkan kepentingan sah kami, termasuk pengelogan keselamatan yang dinyatakan dalam klausa 2 (Art. 21);",
            "**Menarik balik persetujuan** — bagi apa-apa sahaja yang berasaskan persetujuan, seperti telemetri dan maklum balas, pada bila-bila masa dan tanpa perlu memberikan sebab (Art. 7(3));",
            "**Tidak tertakluk kepada keputusan automatik** — kami tidak melaksanakan sebarang keputusan automatik yang menghasilkan kesan undang-undang atau kesan penting yang serupa (Art. 22);",
            "**Mengadu kepada pihak berkuasa pengawasan** — lihat klausa 13."
          ]
        },
        {
          "type": "p",
          "text": "Cara melaksanakannya: edit butiran anda, batalkan kunci akaun, matikan telemetri, dan tutup akaun anda sendiri dari halaman akaun anda. Untuk perkara lain, tulislah  sambil menyatakan akaun yang dimaksudkan dan apa yang anda inginkan. Kami mungkin meminta anda mengesahkan identiti anda, dan kami tidak akan meminta data pengenalan melebihi yang diperlukan untuk tujuan tersebut."
        },
        {
          "type": "callout",
          "text": "**Kami akan membalas dalam tempoh satu bulan.** Jika permintaan adalah rumit atau anda membuat beberapa permintaan, kami boleh melanjutkan tempoh sehingga dua bulan tambahan, dan kami akan memaklumkan anda dalam bulan pertama sebabnya. Melaksanakan hak-hak ini adalah percuma; kami hanya mengenakan caj, atau menolak, jika permintaan jelas tidak berasas atau berlebihan, dan kami akan menjelaskan alasan kami jika perkara itu berlaku."
        }
      ]
    },
    {
      "id": "minors",
      "title": "11. Kanak-kanak",
      "blocks": [
        {
          "type": "p",
          "text": "Perkhidmatan ini ditujukan kepada golongan profesional dan tidak ditawarkan kepada sesiapa yang berumur bawah 18 tahun. Kami tidak mengumpulkan data peribadi daripada kanak-kanak secara sedar. Jika kami mengetahui bahawa kami memegang data tentang seorang kanak-kanak, kami akan memadamkannya dengan segera."
        },
        {
          "type": "p",
          "text": "Ibu bapa atau penjaga yang menyedari kes sedemikian boleh menghubungi kami di  dan kami akan bertindak ke atasnya tanpa kelewatan."
        }
      ]
    },
    {
      "id": "changes",
      "title": "12. Perubahan kepada polisi ini",
      "blocks": [
        {
          "type": "p",
          "text": "Kami boleh menyemak semula polisi ini. Bagi perubahan substantif — tujuan baharu, kategori data baharu, penerima baharu atau destinasi pemindahan baharu — kami akan memaklumkan anda melalui pengumuman di laman web dan melalui e-mel sekurang-kurangnya 30 hari sebelum ia berkuat kuasa, dan kami akan meminta persetujuan baharu jika dikehendaki oleh undang-undang."
        },
        {
          "type": "p",
          "text": "Tarikh berkuat kuasa di bahagian atas halaman ini sentiasa mencerminkan versi semasa. Versi terdahulu boleh didapati atas permintaan melalui e-mel."
        }
      ]
    },
    {
      "id": "contact",
      "title": "13. Hubungi dan aduan",
      "blocks": [
        {
          "type": "p",
          "text": "Untuk sebarang pertanyaan, permintaan atau aduan tentang polisi ini atau cara kami mengendalikan data peribadi anda, tulislah kepada . Kami akan membalas dalam tempoh satu bulan."
        },
        {
          "type": "p",
          "text": "Sila bawa perkara tersebut kepada kami terlebih dahulu — kebanyakan perkara lebih cepat diselesaikan secara terus. Tetapi anda tidak wajib berbuat demikian, dan anda tidak akan kehilangan hak untuk pergi ke tempat lain:"
        },
        {
          "type": "ul",
          "items": [
            "Jika anda berada di EEA, anda boleh mengemukakan aduan kepada pihak berkuasa perlindungan data di negara tempat anda tinggal, tempat anda bekerja, atau tempat berlakunya pelanggaran yang didakwa;",
            "Jika anda berada di UK, kepada Pejabat Pesuruhjaya Maklumat (Information Commissioner's Office);",
            "Jika anda berada di Hong Kong, kepada Pejabat Pesuruhjaya Privasi untuk Data Peribadi (Office of the Privacy Commissioner for Personal Data);",
            "Di tempat lain, kepada mana-mana pihak berkuasa yang menyelia perlindungan data di tempat anda tinggal."
          ]
        },
        {
          "type": "p",
          "text": "Anda juga boleh menempuh remedi kehakiman, atau menggunakan laluan penyelesaian pertikaian yang dinyatakan dalam Terma Perkhidmatan."
        }
      ]
    }
  ]
});
export default legalDoc;
