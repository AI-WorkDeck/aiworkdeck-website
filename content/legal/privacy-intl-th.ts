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
  "title": "Privacy Policy",
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
            "ข้อมูล",
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
            "ชื่อ",
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
            "ข้อผูกพันตามกฎหมาย: การเก็บรักษาบันทึกภาษีและบัญชีที่กฎหมายกำหนด;",
            "การสื่อสารกับคุณ: การเปลี่ยนแปลงบริการ เหตุการณ์ด้านความปลอดภัย และการเปลี่ยนแปลงข้อกำหนด"
          ]
        },
        {
          "type": "p",
          "text": "เราไม่ใช้ข้อมูลนี้เพื่อวัตถุประสงค์อื่นใด หากมีความจำเป็นในอนาคต เราจะขอความยินยอมจากคุณแยกต่างหาก เราไม่ใช้ข้อมูลส่วนบุคคลเพื่อการโฆษณาตามเป้าหมายหรือการกำหนดราคาแตกต่างกัน และไม่ส่งอีเมลการตลาดเว้นแต่คุณจะร้องขอ"
        }
      ]
    },
    {
      "id": "third-parties",
      "title": "6. การเปิดเผยข้อมูลและบุคคลที่สาม",
      "blocks": [
        {
          "type": "callout",
          "text": "**ผู้รับคำขอ AI จากส่วนเสริม** คำขอจากส่วนเสริมอย่างเป็นทางการจะไปยังแบ็กเอนด์คลาวด์ของ AI WorkDeck จากนั้นไปยัง **OpenRouter** แล้วจึงไปยังผู้ให้บริการ inference ที่ให้บริการโมเดลที่เลือก ผู้พัฒนาโมเดลที่มีให้ใช้งาน ได้แก่ DeepSeek, Z.ai, Moonshot AI, Alibaba/Qwen, Anthropic, Google, OpenAI และ xAI ผู้พัฒนาโมเดลและผู้ให้บริการ inference อาจแตกต่างกันไปขึ้นอยู่กับเส้นทางการส่งข้อมูล คำขอประกอบด้วยคำถามปัจจุบัน ประวัติบทสนทนาที่จำเป็น เอกสารปัจจุบัน และข้อมูลอ้างอิงที่ผู้ใช้เลือก OpenRouter และผู้ให้บริการ inference แต่ละรายมีนโยบายการเก็บรักษา การฝึกโมเดล และสถานที่ประมวลผลของตนเอง กฎการประมวลผลชั่วคราวของเราไม่รับประกันว่าบุคคลที่สามจะไม่เก็บรักษาข้อมูลเลย ดูรายชื่อผู้ให้บริการของ OpenRouter (https://openrouter.ai/providers/) และนโยบายความเป็นส่วนตัวของ OpenRouter (https://openrouter.ai/privacy/)"
        },
        {
          "type": "p",
          "text": "เราไม่มอบข้อมูลส่วนบุคคลของคุณให้แก่บุคคลที่สาม ยกเว้นกรณีดังต่อไปนี้ โดยแต่ละรายทำหน้าที่เป็นผู้ประมวลผลข้อมูลของเรา หรือเป็นผู้ควบคุมข้อมูลอิสระเพื่อวัตถุประสงค์ของตนเอง ภายใต้เงื่อนไขที่ตนเองเผยแพร่"
        },
        {
          "type": "table",
          "head": [
            "ผู้รับข้อมูล",
            "ข้อมูล",
            "วัตถุประสงค์",
            "สถานที่ตั้ง"
          ],
          "rows": [
            [
              "Stripe, Inc. และ Stripe Payments Europe, Ltd.",
              "หมายเลขคำสั่งซื้อ จำนวนเงิน สกุลเงิน คำอธิบายรายการ ประเทศที่ใช้ในการออกบิลของคุณ และหมายเลขทะเบียนภาษีที่คุณกรอก รายละเอียดบัตรจะถูกส่งไปยัง Stripe โดยตรงและไม่ถึงเราเลย",
              "รับชำระเงิน คำนวณและเก็บภาษี ดำเนินการคืนเงินและ chargeback",
              "ไอร์แลนด์และสหรัฐอเมริกา"
            ],
            [
              "OpenRouter, Inc.",
              "เนื้อหาที่คุณส่งไปยัง AI และคีย์โควตาที่ออกให้แก่คุณ",
              "กำหนดเส้นทางการเรียกใช้โมเดล และวัดปริมาณการใช้งาน",
              "สหรัฐอเมริกา"
            ],
            [
              "GitHub, Inc.",
              "ข้อมูลคำขอเครือข่ายขณะดาวน์โหลดตัวติดตั้ง",
              "ให้บริการโฮสต์ตัวติดตั้งและโค้ดโอเพนซอร์ส",
              "สหรัฐอเมริกา"
            ],
            [
              "Alibaba Cloud (Singapore) Private Limited",
              "ข้อมูลทางเทคนิคระดับเซิร์ฟเวอร์และเครือข่ายสำหรับเว็บไซต์นี้",
              "การโฮสต์และเครือข่ายสำหรับเว็บไซต์นี้",
              "สิงคโปร์"
            ],
            [
              "กล่องรับข้อเสนอแนะของเรา",
              "เฉพาะข้อเสนอแนะที่คุณเลือกส่งด้วยตัวเอง พร้อมสิ่งที่คุณแนบมาด้วยเท่านั้น",
              "วินิจฉัยและแก้ไขปัญหาที่คุณรายงาน",
              "จีนแผ่นดินใหญ่ — ดูข้อ 7"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**สิ่งที่ควรทราบเกี่ยวกับการไหลของเนื้อหา AI** การเชื่อมต่อโดยตรงจากเดสก์ท็อปที่อธิบายด้านล่างนี้ไม่มีผลกับส่วนเสริม Office/WPS ซึ่งใช้เส้นทางแบบโฮสต์ตามที่ระบุในข้อนี้ เมื่อคุณใช้ช่องทาง AI ของแพลตฟอร์มในแอปพลิเคชันเดสก์ท็อป เนื้อหาของคุณจะถูกส่ง**โดยตรง**จากเครื่องของคุณไปยัง OpenRouter และไม่ผ่านเซิร์ฟเวอร์ของเราเลย — เราเพียงออกคีย์โควตาให้และไม่สามารถเห็นบทสนทนาของคุณได้ เมื่อคุณใช้ฟีเจอร์ \"ร่าง Skill ด้วย AI\" บนเว็บไซต์ คำสั่งที่คุณพิมพ์จะถูกส่งต่อไปยัง OpenRouter ผ่านเซิร์ฟเวอร์ของเรา ไม่ว่ากรณีใด เนื้อหาจะถูกส่งออกจากประเทศที่คุณอยู่"
        },
        {
          "type": "p",
          "text": "เราอาจเปิดเผยข้อมูลเมื่อกฎหมายกำหนด: เพื่อปฏิบัติตามคำสั่งที่มีผลผูกพันจากศาลหรือหน่วยงานที่มีอำนาจเหนือเรา เมื่อจำเป็นเพื่อคุ้มครองผลประโยชน์อันสำคัญยิ่งของบุคคลใดๆ หรือเมื่อคุณได้เปิดเผยข้อมูลต่อสาธารณะด้วยตนเอง หากกฎหมายอนุญาตให้เราแจ้งคุณเกี่ยวกับคำขอดังกล่าว เราจะแจ้งให้ทราบ ในกรณีควบรวมกิจการ แบ่งแยก หรือโอนย้ายสินทรัพย์ เราจะโอนข้อมูลส่วนบุคคลไปพร้อมกับธุรกิจ โดยจะแจ้งชื่อและช่องทางติดต่อของผู้รับให้คุณทราบล่วงหน้า และผู้รับต้องปฏิบัติตามนโยบายนี้ต่อไป"
        }
      ]
    },
    {
      "id": "cross-border",
      "title": "7. การโอนข้อมูลระหว่างประเทศ",
      "blocks": [
        {
          "type": "p",
          "text": "บริการนี้ดำเนินการจากฮ่องกงบนโครงสร้างพื้นฐานในสิงคโปร์ และขึ้นอยู่กับผู้ให้บริการในต่างประเทศ หากคุณอยู่ในเขต EEA สหราชอาณาจักร หรือประเทศใดๆ ที่มีกฎเกณฑ์การโอนข้อมูลของตนเอง ข้อมูลส่วนบุคคลของคุณจะถูกโอนออกนอกประเทศนั้นในกรณีดังต่อไปนี้:"
        },
        {
          "type": "table",
          "head": [
            "รายการที่โอน",
            "ปลายทาง",
            "มาตรการคุ้มครองที่เราอาศัย"
          ],
          "rows": [
            [
              "การดำเนินงานเกี่ยวกับบัญชี กระเป๋าเงิน และเว็บไซต์ของเราเอง",
              "เขตบริหารพิเศษฮ่องกง (ผู้ควบคุมข้อมูล) และสิงคโปร์ (ผู้ให้บริการโฮสติ้ง)",
              "จำเป็นเพื่อการปฏิบัติตามสัญญาของคุณกับเรา (มาตรา 49(1)(b) GDPR); ข้อผูกพันตามสัญญากับผู้ให้บริการโฮสติ้ง"
            ],
            [
              "เนื้อหาที่คุณส่งผ่านช่องทาง AI ของแพลตฟอร์ม ส่วนเสริม Office/WPS หรือฟีเจอร์ร่าง Skill ด้วย AI",
              "สหรัฐอเมริกา (OpenRouter, Inc.)",
              "Standard Contractual Clauses ในข้อกำหนดของผู้ให้บริการ และความจำเป็นเพื่อการให้บริการฟีเจอร์ที่คุณร้องขอ"
            ],
            [
              "การชำระเงิน",
              "ไอร์แลนด์และสหรัฐอเมริกา (Stripe)",
              "Standard Contractual Clauses ในข้อตกลงการประมวลผลข้อมูลของ Stripe; EU-US Data Privacy Framework เมื่อมีผลใช้บังคับ"
            ],
            [
              "การดาวน์โหลดตัวติดตั้ง",
              "สหรัฐอเมริกา (GitHub, Inc.)",
              "จำเป็นเพื่อการให้บริการ; Standard Contractual Clauses ในข้อกำหนดของผู้ให้บริการ"
            ],
            [
              "ข้อเสนอแนะเกี่ยวกับผลิตภัณฑ์ที่คุณเลือกส่ง",
              "จีนแผ่นดินใหญ่ (เซิร์ฟเวอร์ของเราเอง)",
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
