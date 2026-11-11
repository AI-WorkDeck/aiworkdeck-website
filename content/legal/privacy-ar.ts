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
  "eyebrow": "الشؤون القانونية",
  "title": "سياسة الخصوصية",
  "effectiveLabel": "يسري هذا العمل اعتبارًا من {__T_LEGAL_EFFECTIVE_DATE__}",
  "intro": "توضح هذه السياسة كيفية قيام () بجمع المعلومات الشخصية واستخدامها وتخزينها والكشف عنها عند استخدامك لموقع AI WorkDeck وتطبيق سطح المكتب، كما توضح الحقوق التي تملكها. ننصح بقراءتها كاملة؛ وإذا كنت ترغب في الاطلاع على الملخص فقط، فإن الملخص أدناه يغطي ذلك.",
  "highlightsTitle": "النسخة المختصرة",
  "highlights": [
    "**يعتمد الملحق Office/WPS على المعالجة السحابية.** يصل المستند الحالي وسجل المحادثات الضروري والمراجع التي تحددها إلى خادمنا المستضاف، ثم إلى Alibaba Cloud Model Studio ومزود خدمة الاستدلال الذي يخدم النموذج الذي اخترته. تُستخدم ذاكرة مؤقتة لنصوص المستندات الأصلية؛ أما رسائل المستخدم وردود الذكاء الاصطناعي وسلاسل الاستدلال فتبقى حتى تحذف المحادثة. راجع البندين 6 و8.",
    "تبقى مستندات سطح المكتب والمشروعات وسجل العمل على جهازك. عند استدعاء ذكاء المنصة، تمر النصوص ومقتطفات الملفات والصور والسياق الضروري عبر بوابتنا الصينية إلى Model Studio. التخزين المحلي لا يعني تجاوز خوادمنا عند إرسال الطلبات.",
    "**ست خدمات مصدرها المنصة تمر فعلاً عبر خوادمنا** (التعرف على النصوص، البحث في الويب، بيانات السجل التجاري للشركات، بيانات الأوراق المالية والبيانات المالية، البحث في القوانين والأحكام القضائية، وتفريغ الاجتماعات): نشتري من المزود نيابة عنك فلا تحتاج إلى مفتاح خاص بك، ويتم تمرير المحتوى الذي يتطلبه كل استدعاء عبرنا إلى ذلك المزود. **جميع المزودين الستة داخل البر الرئيسي للصين، لذا فإن هذه الفئة لا تنطوي على أي نقل عابر للحدود.** لا يتم الاحتفاظ إلا بملصقات صوت الاجتماعات لفترة وجيزة لدينا، وتُحذف فور انتهاء التفريغ. يمكن تحويل أي منها إلى مفتاحك الخاص أو إيقافه. راجع البنود 2 و6 و7 و8.",
    "**يضع الموقع ملف تعريف ارتباط واحدًا فقط** (`awd_session`، للحفاظ على تسجيل دخولك). لا توجد أكواد تحليلات أو إعلانات أو تتبع من أطراف خارجية، والخطوط الويب مستضافة ذاتيًا، وبالتالي لا يصل أي طلب إلى طرف ثالث.",
    "**بيانات القياس عن بُعد لسطح المكتب مجهولة الهوية**: معرف تثبيت عشوائي، وإصدار التطبيق، وأسماء أحداث مدرجة في قائمة بيضاء. لا يتم تخزين عنوان IP، ولا يرتبط شيء بحسابك، ولا يتضمن أي محتوى للمستندات، ويمكن إيقافه.",
    "الوصول عبر بكين لا يعني إجراء كل الاستدلال داخل بر الصين الرئيسي. يتحدد مكان المعالجة وفق نشر النموذج المختار؛ وقد تعالج نماذج China Elastic Zone البيانات خارج بر الصين الرئيسي. لا يزال الوصول الخارجي إلى الموقع يمر بعقدة تخزين مؤقت في سنغافورة.",
    "**لممارسة حقوقك** (الوصول، التصحيح، الحذف، إغلاق الحساب، سحب الموافقة)، راسلنا على . نرد خلال خمسة عشر يوم عمل."
  ],
  "tocTitle": "المحتويات",
  "sections": [
    {
      "id": "controller",
      "title": "1. من نحن",
      "blocks": [
        {
          "type": "p",
          "text": "الجهة المسؤولة عن معالجة المعلومات الشخصية: ()، رمز الائتمان الاجتماعي الموحد ."
        },
        {
          "type": "p",
          "text": "لأي مسألة تتعلق بحماية المعلومات الشخصية، تواصل مع . ويصل العنوان نفسه إلى الشخص المسؤول عن حماية المعلومات الشخصية."
        },
        {
          "type": "p",
          "text": "تغطي هذه السياسة موقع AI WorkDesk وسطح المكتب الإضافيات Office والخدمات ذات الصلة. وهي متوفرة بالصينية والإنجليزية؛ وفي حال وجود أي تعارض، تكون النسخة الصينية هي المعتمدة."
        }
      ]
    },
    {
      "id": "collect",
      "title": "2. ما نجمعه",
      "blocks": [
        {
          "type": "p",
          "text": "نجمع على أساس \"الحد اللازم فقط دون زيادة\". يوضح الجدول ما نجمعه، ولماذا، وعلى أي أساس."
        },
        {
          "type": "table",
          "head": [
            "السياق",
            "المعلومات",
            "الغرض",
            "الأساس"
          ],
          "rows": [
            [
              "التسجيل",
              "اسم المستخدم، البريد الإلكتروني، كلمة المرور، الاسم المعروض، نبذة تعريفية (اختياري)",
              "إنشاء حسابك والتحقق من هويتك، واستعادة الحساب، والملف الشخصي العام",
              "ضروري لإبرام العقد وتنفيذه"
            ],
            [
              "البقاء في تسجيل الدخول",
              "رمز الجلسة (في ملف تعريف الارتباط awd_session)",
              "الحفاظ على جلستك",
              "ضروري لتنفيذ العقد"
            ],
            [
              "تخزين كلمة المرور",
              "تجزئة scrypt المملحة فقط",
              "التحقق من كلمة المرور الخاصة بك",
              "ضروري لتنفيذ العقد"
            ],
            [
              "عمليات الشحن والمدفوعات",
              "رقم الطلب، ومعرّف معاملة WeChat Pay، ومعرّف payer WeChat openid، والمبلغ، والحالة، والطوابع الزمنية",
              "استلام المدفوعات، والتسوية، ومعالجة الاستردادات والنزاعات",
              "العقد + الالتزام القانوني (الضرائب والمحاسبة)"
            ],
            [
              "المحفظة والمعاملات",
              "الرصيد، وقيود دفتر الأستاذ، والمشتريات، والاستحقاقات، وأرباح المنشئين",
              "المحاسبة، والتحقق من الاستحقاقات، والتسوية",
              "ضروري لتنفيذ العقد"
            ],
            [
              "مفاتيح الحساب",
              "تجزئة SHA-256 والبادئة فقط؛ لا يتم الاحتفاظ بأي نص صريح",
              "مصادقة تطبيق سطح المكتب",
              "ضروري لتنفيذ العقد"
            ],
            [
              "رصيد AI",
              "بيانات اعتماد استدعاء محدودة وتفويض الحساب والنماذج والاستخدام وسجلات التسوية",
              "توفير رصيد AI وقياس استخدامه",
              "ضروري لتنفيذ العقد"
            ],
            [
              "طلبات التقديم في البلازا",
              "الـ Skill أو الإضافة التي تقدمها وهويتك كمؤلف",
              "المراجعة والنشر والتوزيع والتسوية",
              "ضرورية لتنفيذ العقد"
            ],
            [
              "القياس عن بُعد لسطح المكتب",
              "معرّف تثبيت عشوائي (UUID)، وإصدار التطبيق، وأسماء الأحداث المدرجة في القائمة البيضاء، ومفتاح تسلسل المحادثة، ومجموعة صغيرة من السمات غير الحساسة",
              "قياس النشاط واستخدام الميزات، وتشخيص الأعطال",
              "موافقتك (يمكن إيقافها)"
            ],
            [
              "خدمات خارجية مصدرها المنصة",
              "المحتوى الذي يتطلبه كل استدعاء (الصورة المراد التعرف عليها، أو استعلام بحث، أو اسم شركة، أو رمز سهم، أو مصطلح بحث، أو صوت اجتماع)، بالإضافة إلى قيد دفتر واحد لا يحتوي على محتوى (الخدمة، والكمية، والمبلغ، والطابع الزمني)",
              "استدعاء المزود نيابةً عنك وقياس الاستخدام",
              "ضرورية لتنفيذ العقد (استدعاؤك هو الطلب)"
            ],
            [
              "سجلات الخادم",
              "الطابع الزمني، ومسار الطلب، ورمز الحالة، وعنوان IP",
              "الأمان، واستكشاف الأخطاء وإصلاحها، وصد الهجمات",
              "صيانة أمنية ضرورية بشكل معقول + التزام قانوني"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**بخصوص القياس عن بُعد:** يتم استخدام عنوان IP لطلب القياس عن بُعد في الذاكرة لغرض تحديد المعدل فقط ولا يتم **كتابته إلى قاعدة البيانات أبدًا**. لا يسجل أي شيء رابطًا بين معرّف التثبيت العشوائي وحسابك، لذا لا يمكننا تتبع بيانات القياس عن بُعد للوصول إلى شخص محدد."
        }
      ]
    },
    {
      "id": "not-collect",
      "title": "3. ما لا نقوم بجمعه",
      "blocks": [
        {
          "type": "p",
          "text": "تتعلق العبارات أدناه حول المستندات ومحادثات الـ AI بالاستخدام المحلي لسطح المكتب. تعالج إضافة Office/WPS المستندات والمحادثات عبر الخلفية المستضافة لدينا، كما هو موضح في البندين 6 و8. بخلاف ذلك، لا نقوم بجمع ما يلي بشكل نشط:"
        },
        {
          "type": "ul",
          "items": [
            "مستنداتك أو ملفات قضاياك أو ملفات مشاريعك ومحتوياتها — تطبيق سطح المكتب يعمل محليًا أولاً وتبقى هذه على جهازك. **عندما تسلّم محتوى محددًا لخدمة خارجية محددة** (صورة للتعرف على النص، أو تسجيل لتحويله إلى نص مكتوب): نقوم عندئذٍ بتمرير الجزء الذي يتطلبه الاستدعاء إلى المزود. وباستثناء صوت الاجتماعات المحتفظ به لفترة وجيزة، لا نحتفظ بأي شيء منه (انظر البندين 6 و8)؛",
            "تمر محادثات سطح المكتب عبر البوابة الصينية عند استدعاء ذكاء المنصة، ولا تحفظ سجلات ودفاتر الفوترة محتواها. يخضع حفظ محادثات الإضافات وحذفها للبندين 6 و8.",
            "معلومات شخصية حساسة مثل أرقام الهواتف أو أرقام الهويات أو صور الوجوه أو البصمات؛",
            "الموقع أو جهات الاتصال أو سجلات المكالمات أو الرسائل أو مكتبات الصور؛",
            "تصفحك خارج هذه الخدمة — لا نقوم بتشغيل أي أدوات تحليلات أو إعلانات من جهات خارجية."
          ]
        },
        {
          "type": "p",
          "text": "لا نستخدم أيًا من محتواك لتدريب النماذج، ولا نبيع المعلومات الشخصية."
        }
      ]
    },
    {
      "id": "cookies",
      "title": "4. ملفات تعريف الارتباط (Cookies)",
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
          "text": "يمر الذكاء الاصطناعي لمنصة الموقع الصيني (دردشة سطح المكتب وإضافات Office/WPS وصياغة Skill بالذكاء الاصطناعي) عبر خادم AI WorkDeck في الصين إلى نقطة وصول بكين في Alibaba Cloud Model Studio ثم مزود النموذج الفعلي. يسجل دفتر فوترة البوابة الحساب والنموذج والاستخدام والتكلفة، ولا يسجل المحتوى المُمرر. تبقى قواعد حفظ محادثات الإضافات وSkill الحالية دون تغيير. تطبق Model Studio ومزودو الاستدلال سياساتهم الخاصة للاحتفاظ والتدريب ومواقع المعالجة. لا تضمن قواعد بوابتنا عدم احتفاظ الأطراف الثالثة بالبيانات. نشر النماذج: https://help.aliyun.com/zh/model-studio/beijing-access-information"
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
              "Alibaba Cloud Model Studio ومزودو النماذج الفعليون",
              "السؤال الحالي وسجل المحادثة الضروري ومقتطفات الملفات والصور",
              "استدلال النماذج وقياس الاستخدام والتسوية",
              "وصول عبر بكين؛ تتبع المعالجة نشر النموذج وقد تتم خارج بر الصين الرئيسي"
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
          "text": "يمر الذكاء الاصطناعي لمنصة الموقع الصيني (دردشة سطح المكتب وإضافات Office/WPS وصياغة Skill بالذكاء الاصطناعي) عبر خادم AI WorkDeck في الصين إلى نقطة وصول بكين في Alibaba Cloud Model Studio ثم مزود النموذج الفعلي. يسجل دفتر فوترة البوابة الحساب والنموذج والاستخدام والتكلفة، ولا يسجل المحتوى المُمرر. تبقى قواعد حفظ محادثات الإضافات وSkill الحالية دون تغيير. الوصول عبر بكين لا يعني إجراء كل الاستدلال داخل بر الصين الرئيسي. يتحدد مكان المعالجة وفق نشر النموذج المختار؛ وقد تعالج نماذج China Elastic Zone البيانات خارج بر الصين الرئيسي. لا يزال الوصول الخارجي إلى الموقع يمر بعقدة تخزين مؤقت في سنغافورة."
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
            "الوصول عبر بكين لا يعني إجراء كل الاستدلال داخل بر الصين الرئيسي. يتحدد مكان المعالجة وفق نشر النموذج المختار؛ وقد تعالج نماذج China Elastic Zone البيانات خارج بر الصين الرئيسي. لا يزال الوصول الخارجي إلى الموقع يمر بعقدة تخزين مؤقت في سنغافورة.",
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
          "text": "يستخدم مفتاحك الخاص مسار وسياسات المزود المُعدّ؛ وتعالج النماذج المحلية بالكامل المحتوى على جهازك. راجع معلومات نشر النموذج لمعرفة مواقع المعالجة. تظل ملفات التثبيت موزعة عبر GitHub."
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
            "Model keys: stored encrypted;",
            "Access control: production access is limited to those who need it;",
            "Durability: financial data is written transactionally and backed up regularly."
          ]
        },
        {
          "type": "p",
          "text": "No system is perfectly secure. If personal information is leaked, altered or lost in a way that may harm you, we will take remedial action immediately and notify you and the competent authorities as the law requires."
        }
      ]
    },
    {
      "id": "rights",
      "title": "10. Your rights",
      "blocks": [
        {
          "type": "p",
          "text": "Under the Personal Information Protection Law you have the following rights over the personal information we handle:"
        },
        {
          "type": "ul",
          "items": [
            "**Access and copy** — find out what we hold about you and obtain a copy;",
            "**Correct and supplement** — have inaccurate or incomplete information fixed; account details can also be edited yourself;",
            "**Delete** — where the purpose is fulfilled, you withdraw consent, or we have processed unlawfully;",
            "**Portability** — have your information transferred to another handler you designate, where it meets the conditions set by the national cyberspace authority;",
            "**Withdraw consent** — for anything processed on the basis of consent, such as telemetry and cross-border transfers;",
            "**Restrict or object** — ask us to limit or refuse particular processing;",
            "**Explanation** — ask us to explain this policy and our processing rules;",
            "**Close your account** — at any time, after which we handle your information as set out in clause 8."
          ]
        },
        {
          "type": "p",
          "text": "How to exercise them: edit your details and revoke account keys yourself in your account; for anything else, write to  identifying your account and what you want. We may ask you to verify your identity first. We respond within fifteen working days, and will explain if a complex request needs longer."
        },
        {
          "type": "p",
          "text": "A close relative of a deceased user may exercise rights of access, copying, correction and deletion over that user's relevant personal information, unless the user arranged otherwise during their lifetime."
        }
      ]
    },
    {
      "id": "minors",
      "title": "11. Minors",
      "blocks": [
        {
          "type": "p",
          "text": "The Service is aimed at professionals and is not offered to children under 14. We do not knowingly collect children's personal information. If we find we have collected it without prior guardian consent, we will delete it promptly."
        },
        {
          "type": "p",
          "text": "Guardians who become aware of such a case can reach us at ."
        }
      ]
    },
    {
      "id": "changes",
      "title": "12. Changes to this policy",
      "blocks": [
        {
          "type": "p",
          "text": "We may revise this policy. For substantive changes to purposes, methods or categories of information, we will notify you by website announcement or email before they take effect, and will seek fresh consent where the law requires it."
        },
        {
          "type": "p",
          "text": "Earlier versions are available on request by email."
        }
      ]
    },
    {
      "id": "contact",
      "title": "13. Contact and complaints",
      "blocks": [
        {
          "type": "p",
          "text": "For any question, comment or complaint about this policy or our handling of personal information, write to . We reply within fifteen working days."
        },
        {
          "type": "p",
          "text": "If you believe our processing has harmed your rights and our reply does not resolve it, you may also complain to the local cyberspace, telecommunications, public security or market regulation authorities, or pursue the dispute resolution route set out in the Terms of Service."
        }
      ]
    }
  ]
});
export default legalDoc;
