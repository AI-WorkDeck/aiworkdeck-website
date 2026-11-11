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
  "eyebrow": "법적 고지",
  "title": "개인정보처리방침",
  "effectiveLabel": "시행일: {__T_SITE_LEGAL_EFFECTIVE_DATE__}",
  "intro": "본 정책은 귀하가 {__T_siteConfig_host__} 및 AI WorkDeck 데스크톱 애플리케이션을 사용할 때 개인정보가 수집, 이용, 저장, 공개되는 방식과 귀하가 가진 권리를 설명합니다. 전문을 읽어보시기를 권장하며, 요지만 원하시는 경우 아래 요약을 참고하시기 바랍니다.",
  "highlightsTitle": "간략 요약",
  "highlights": [
    "**Office/WPS 애드인은 클라우드 처리를 사용합니다.** 현재 문서, 필요한 대화 기록 및 귀하가 선택한 참고 자료가 당사의 호스팅 백엔드로 전송되며, 이후 OpenRouter와 선택한 모델을 제공하는 추론 공급자로 전달됩니다. 문서 본문 원본은 임시 메모리를 사용하며, 사용자 메시지, AI 응답 및 추론 내용은 대화를 삭제할 때까지 보관됩니다. 자세한 내용은 제6조 및 제8조를 참조하십시오.",
    "**The desktop application is local-first:** your documents, projects and work history stay on your own machine. They are not uploaded, not retained, and never used to train models.",
    "**The site sets exactly one cookie** (`awd_session`, to keep you signed in). It is strictly necessary, so there is no consent banner to click through. No third-party analytics, no advertising, no tracking, and web fonts are self-hosted.",
    "**Desktop telemetry is anonymous**: a random install identifier, the app version and whitelisted event names. No IP address is stored, nothing is linked to your account, no document content is included, and it can be switched off in settings.",
    "**Three things leave the country you are in.** Content you send to the AI goes to OpenRouter in the United States. Payments go to Stripe. **Product feedback you choose to send goes to a server we operate in mainland China** — clause 7 explains why and what that means.",
    "**You can delete your account yourself** from your account page. We delete or anonymise your data within 30 days, except transaction records we are legally required to keep — see clause 8.",
    "**Your rights** — access, rectification, erasure, portability, restriction, objection, withdrawal of consent — are set out in clause 10. Write to ; we respond within one month. You may also complain to the data protection authority where you live.",
    "**This site and {__T_siteConfig_otherSite_host__} hold separate data.** Different controller, different database, different country. Neither can see the other's accounts."
  ],
  "tocTitle": "목차",
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
            "데이터",
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
              "30일"
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
            "데이터",
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
              "90일"
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
            "**열람** — 당사가 귀하에 대한 데이터를 처리하는지, 그 내용과 이유를 확인하고 사본을 받을 수 있습니다(제15조);",
            "**정정** — 부정확하거나 불완전한 데이터의 정정을 요청할 수 있으며, 계정 정보는 직접 수정할 수도 있습니다(제16조);",
            "**삭제** — 목적이 달성된 경우, 동의를 철회한 경우, 정당한 이의가 인정된 경우 또는 불법적으로 처리된 경우 데이터 삭제를 요청할 수 있습니다. 계정을 종료하여 직접 이를 실행할 수 있으며, 그 한도는 제8조에 규정되어 있습니다(제17조);",
            "**이동** — 귀하가 제공한 데이터를 구조화되고 일반적으로 사용되며 기계 판독이 가능한 형식으로 받을 수 있고, 기술적으로 가능한 경우 다른 관리자에게 전송하도록 요청할 수 있습니다(제20조);",
            "**처리 제한** — 정확성 또는 적법성에 관한 분쟁이 해결될 때까지 처리를 중지하도록 요청할 수 있습니다(제18조);",
            "**이의 제기** — 제2조에 설명된 보안 로깅을 포함하여 당사의 정당한 이익에 기반한 처리에 이의를 제기할 수 있습니다(제21조);",
            "**동의 철회** — 텔레메트리 및 피드백 등 동의에 기반한 모든 사항에 대해 언제든 이유 없이 철회할 수 있습니다(제7조 제3항);",
            "**자동화된 의사결정의 대상이 되지 않을 권리** — 당사는 법적 또는 이에 준하는 중대한 효과를 발생시키는 자동화된 의사결정을 수행하지 않습니다(제22조);",
            "**감독기관에 불만 제기** — 제13조를 참조하십시오."
          ]
        },
        {
          "type": "p",
          "text": "행사 방법: 계정 페이지에서 직접 정보를 수정하고, 계정 키를 폐지하고, 텔레메트리를 끄고, 계정을 종료할 수 있습니다. 그 외의 사항은 어떤 계정에 관한 것인지와 원하는 사항을 명시하여 로 연락해 주십시오. 본인 확인을 요청할 수 있으며, 이에 필요한 최소한의 식별 데이터만 요청합니다."
        },
        {
          "type": "callout",
          "text": "**당사는 1개월 이내에 답변합니다.** 요청이 복잡하거나 여러 건인 경우 최대 2개월까지 연장할 수 있으며, 연장 사유를 첫 달 안에 알려드립니다. 이러한 권리 행사는 무료이며, 요청이 명백히 근거 없거나 과도한 경우에만 비용을 청구하거나 거부하며, 그 경우 그 이유를 설명합니다."
        }
      ]
    },
    {
      "id": "minors",
      "title": "11. 아동",
      "blocks": [
        {
          "type": "p",
          "text": "본 서비스는 전문가를 대상으로 하며 18세 미만에게는 제공되지 않습니다. 당사는 아동의 개인 데이터를 고의로 수집하지 않습니다. 아동에 대한 데이터를 보유하고 있음을 알게 되면 즉시 삭제합니다."
        },
        {
          "type": "p",
          "text": "이러한 사례를 인지한 부모나 보호자는 (으)로 연락할 수 있으며, 당사는 지체 없이 조치를 취합니다."
        }
      ]
    },
    {
      "id": "changes",
      "title": "14. 본 정책의 변경",
      "blocks": [
        {
          "type": "p",
          "text": "당사는 본 정책을 개정할 수 있습니다. 새로운 목적, 새로운 데이터 범주, 새로운 수신자 또는 새로운 이전 목적지 등 실질적인 변경이 있을 경우, 시행 최소 30일 전에 웹사이트 공지 및 이메일로 알려드리며, 법률이 요구하는 경우 새로운 동의를 구합니다."
        },
        {
          "type": "p",
          "text": "이 페이지 상단의 시행일은 항상 현재 버전을 반영합니다. 이전 버전은 이메일로 요청 시 제공됩니다."
        }
      ]
    },
    {
      "id": "contact",
      "title": "13. 연락처 및 불만",
      "blocks": [
        {
          "type": "p",
          "text": "본 정책이나 귀하의 개인 데이터 처리에 관한 문의, 요청 또는 불만은 (으)로 보내주십시오. 당사는 1개월 이내에 답변합니다."
        },
        {
          "type": "p",
          "text": "먼저 당사에 알려주시기 바랍니다. 대부분의 문제는 직접 해결하는 것이 더 빠릅니다. 다만 그렇게 할 의무는 없으며, 다른 곳에 문의할 권리를 잃지 않습니다:"
        },
        {
          "type": "ul",
          "items": [
            "EEA에 거주하는 경우 거주지, 근무지 또는 침해가 발생한 것으로 추정되는 국가의 데이터 보호 기관에 불만을 제기할 수 있습니다;",
            "영국에 거주하는 경우 Information Commissioner's Office에 제기할 수 있습니다;",
            "홍콩에 거주하는 경우 Office of the Privacy Commissioner for Personal Data에 제기할 수 있습니다;",
            "그 외 지역에서는 거주지의 데이터 보호를 감독하는 기관에 제기할 수 있습니다."
          ]
        },
        {
          "type": "p",
          "text": "법적 구제를 추구하거나 서비스 약관에 명시된 분쟁 해결 절차를 이용할 수도 있습니다."
        }
      ]
    }
  ]
});
export default legalDoc;
