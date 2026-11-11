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
  "eyebrow": "Юридическая информация",
  "title": "Политика конфиденциальности",
  "effectiveLabel": "Вступает в силу {__T_LEGAL_EFFECTIVE_DATE__}",
  "intro": "В настоящей политике разъясняется, как  () собирает, использует, хранит и раскрывает личную информацию при использовании вами сайта и настольного приложения AI WorkDeck, а также какими правами вы обладаете. Рекомендуем прочитать её полностью; если вам нужна лишь суть, краткое изложение ниже её охватывает.",
  "highlightsTitle": "Краткая версия",
  "highlights": [
    "**Надстройка для Office/WPS использует облачную обработку.** Текущий документ, необходимая история диалога и выбранные вами ссылки попадают на наш размещённый бэкенд, а затем в Alibaba Cloud Model Studio и к поставщику инференса, обслуживающему выбранную вами модель. Содержимое документов хранится во временной памяти; сообщения пользователей, ответы AI и рассуждения сохраняются, пока вы не удалите диалог. См. пункты 6 и 8.",
    "Документы, проекты и история работы настольного приложения остаются на устройстве. При вызове платформенного ИИ необходимые тексты, фрагменты файлов, изображения и контекст передаются через китайский шлюз в Model Studio. Локальное хранение не означает обход наших серверов.",
    "**Шесть сервисов платформенных поставщиков проходят через наши серверы** (распознавание текста, веб-поиск, данные корпоративных реестров, данные о ценных бумагах и финансах, поиск по законодательству и судебной практике, транскрибация встреч): мы приобретаем услуги поставщика от вашего имени, поэтому вам не нужен собственный ключ, а содержимое, необходимое для каждого запроса, передаётся через нас этому поставщику. **Все шесть поставщиков находятся в материковом Китае, поэтому этот уровень не предполагает трансграничной передачи.** Только аудио встреч кратковременно хранится на нашей стороне и удаляется по завершении транскрибации. Любой из этих сервисов можно переключить на ваш собственный ключ или отключить. См. пункты 2, 6, 7 и 8.",
    "**Сайт устанавливает ровно один файл cookie** (`awd_session`, для поддержания вашего сеанса входа). Здесь нет стороннего аналитического, рекламного или отслеживающего кода, а веб-шрифты размещаются на собственном сервере, поэтому ни один запрос не уходит третьим лицам.",
    "**Телеметрия настольного приложения анонимна**: случайный идентификатор установки, версия приложения и названия событий из белого списка. IP-адрес не сохраняется, ничего не связывается с вашей учётной записью, содержимое документов не включается, и телеметрию можно отключить.",
    "Доступ через Пекин не означает, что весь вывод выполняется в материковом Китае. Место обработки определяется развёртыванием выбранной модели; модели China Elastic Zone могут обрабатывать данные за пределами материкового Китая. Зарубежный доступ к сайту по-прежнему использует узел кеширования в Сингапуре.",
    "**Чтобы реализовать свои права** (доступ, исправление, удаление, закрытие учётной записи, отзыв согласия), напишите на . Мы отвечаем в течение пятнадцати рабочих дней."
  ],
  "tocTitle": "Содержание",
  "sections": [
    {
      "id": "controller",
      "title": "1. Кто мы",
      "blocks": [
        {
          "type": "p",
          "text": "Оператор личной информации:  (), единый код регистрации юридического лица ."
        },
        {
          "type": "p",
          "text": "По любым вопросам, касающимся защиты личной информации, обращайтесь на . По этому же адресу можно связаться с лицом, ответственным за защиту личной информации."
        },
        {
          "type": "p",
          "text": "Настоящая политика охватывает сайт AI WorkDeck, настольное приложение, надстройки Office и связанные услуги. Она существует на китайском и английском языках; в случае расхождений преимущественную силу имеет китайская версия."
        }
      ]
    },
    {
      "id": "collect",
      "title": "2. Что мы собираем",
      "blocks": [
        {
          "type": "p",
          "text": "Мы собираем данные по принципу «не больше, чем необходимо». В таблице указано, что мы собираем, зачем и на каком основании."
        },
        {
          "type": "table",
          "head": [
            "Контекст",
            "Информация",
            "Цель",
            "Основание"
          ],
          "rows": [
            [
              "Регистрация",
              "Имя пользователя, email, пароль, отображаемое имя, описание (необязательно)",
              "Создание и идентификация вашей учётной записи, восстановление доступа, публичный профиль",
              "Необходимо для заключения и исполнения договора"
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
              "Ограниченные учётные данные доступа, авторизация аккаунта, модели, использование и расчётные записи",
              "Provision and meter your AI credit",
              "Necessary to perform the contract"
            ],
            [
              "Plaza submissions",
              "Отправляемый вами Skill или плагин и ваша личность как автора",
              "Проверка, публикация, распространение, расчёты",
              "Необходимо для исполнения договора"
            ],
            [
              "Телеметрия настольного приложения",
              "Случайный идентификатор установки (UUID), версия приложения, названия событий из белого списка, ключ последовательности диалога, небольшой набор нечувствительных атрибутов",
              "Оценка активности и использования функций, диагностика сбоев",
              "Ваше согласие (можно отключить)"
            ],
            [
              "Внешние сервисы сторонних поставщиков",
              "Содержимое, необходимое для каждого вызова (изображение для распознавания, поисковый запрос, название компании, тикер, поисковый термин, аудио встречи), а также одна запись учёта без содержимого (сервис, количество, сумма, timestamp)",
              "Обращение к поставщику от вашего имени и учёт использования",
              "Необходимо для исполнения договора (ваш вызов и является запросом)"
            ],
            [
              "Серверные журналы",
              "Timestamp, путь запроса, код состояния, IP-адрес",
              "Безопасность, устранение неполадок, защита от атак",
              "Разумно необходимое обслуживание в целях безопасности + юридическое обязательство"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**О телеметрии:** IP-адрес запроса телеметрии используется в памяти только для ограничения частоты запросов и **никогда не записывается в базу данных**. Ничто не фиксирует связь между случайным идентификатором установки и вашей учётной записью, поэтому мы не можем связать телеметрию с конкретным человеком."
        }
      ]
    },
    {
      "id": "not-collect",
      "title": "3. Что мы не собираем",
      "blocks": [
        {
          "type": "p",
          "text": "Приведённые ниже положения о документах и диалогах с ИИ касаются использования настольного приложения локально. Надстройка для Office/WPS обрабатывает документы и диалоги через наш размещённый бэкенд, как описано в пунктах 6 и 8. В остальных случаях мы активно не собираем следующее:"
        },
        {
          "type": "ul",
          "items": [
            "Ваши документы, материалы дел или проектные файлы и их содержимое — настольное приложение работает по принципу local-first, и эти данные остаются на вашем устройстве. **Когда вы передаёте конкретный фрагмент содержимого конкретному внешнему сервису** (изображение для распознавания текста, запись для транскрибации): мы затем передаём поставщику ту его часть, которая необходима для вызова. За исключением аудио встреч, кратковременно хранимого, мы ничего из этого не сохраняем (см. пункты 6 и 8);",
            "Переписка настольного приложения передаётся через китайский шлюз при вызове платформенного ИИ; журналы расчётов не сохраняют её содержание. Хранение и удаление переписки надстроек регулируют разделы 6 и 8.",
            "Чувствительная персональная информация, такая как номера телефонов, номера удостоверений, снимки лица или отпечатки пальцев;",
            "Местоположение, контакты, журналы вызовов, сообщения или фототеки;",
            "Ваш просмотр веб-страниц вне этого сервиса — мы не используем сторонние SDK аналитики или рекламы."
          ]
        },
        {
          "type": "p",
          "text": "Мы не используем ваш контент для обучения моделей и не продаём персональную информацию."
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
              "30 дней"
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
          "text": "Платформенный ИИ китайского сайта (чаты настольного приложения, надстройки Office/WPS и создание Skills с ИИ) передаёт запросы через китайский сервер AI WorkDeck в пекинскую точку доступа Alibaba Cloud Model Studio и фактическому поставщику модели. Журнал расчётов шлюза содержит данные аккаунта, модели, использования и стоимости, но не передаваемый текст. Прежние правила хранения переписки надстроек и Skills не меняются. Model Studio и поставщики вывода применяют собственные правила хранения, обучения и мест обработки. Правила шлюза не гарантируют отсутствие хранения у третьих лиц. Развёртывание моделей: https://help.aliyun.com/zh/model-studio/beijing-access-information"
        },
        {
          "type": "p",
          "text": "We do not provide your personal information to third parties except as follows:"
        },
        {
          "type": "table",
          "head": [
            "Получатель",
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
              "Alibaba Cloud Model Studio и фактические поставщики моделей",
              "Текущий вопрос, необходимая история переписки, фрагменты файлов и изображения",
              "Вывод модели, учёт использования и расчёты",
              "Доступ через Пекин; обработка по условиям развёртывания модели, возможно вне материкового Китая"
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
          "text": "Платформенный ИИ китайского сайта (чаты настольного приложения, надстройки Office/WPS и создание Skills с ИИ) передаёт запросы через китайский сервер AI WorkDeck в пекинскую точку доступа Alibaba Cloud Model Studio и фактическому поставщику модели. Журнал расчётов шлюза содержит данные аккаунта, модели, использования и стоимости, но не передаваемый текст. Прежние правила хранения переписки надстроек и Skills не меняются. Доступ через Пекин не означает, что весь вывод выполняется в материковом Китае. Место обработки определяется развёртыванием выбранной модели; модели China Elastic Zone могут обрабатывать данные за пределами материкового Китая. Зарубежный доступ к сайту по-прежнему использует узел кеширования в Сингапуре."
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
            "Доступ через Пекин не означает, что весь вывод выполняется в материковом Китае. Место обработки определяется развёртыванием выбранной модели; модели China Elastic Zone могут обрабатывать данные за пределами материкового Китая. Зарубежный доступ к сайту по-прежнему использует узел кеширования в Сингапуре.",
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
          "text": "Собственный ключ использует маршрут и политики выбранного поставщика; полностью локальные модели обрабатывают содержание на устройстве. Места обработки указаны в информации о развёртывании модели. Установщики по-прежнему распространяются через GitHub."
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
