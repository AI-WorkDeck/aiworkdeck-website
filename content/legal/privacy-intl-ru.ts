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
  "eyebrow": "Юридическая информация",
  "title": "Политика конфиденциальности",
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
              "Ключ среды выполнения, выданный вышестоящим провайдером модели (хранится в зашифрованном виде), лимит квоты и итоги использования",
              "Обеспечение и учёт ваших AI Credits",
              "Исполнение договора (ст. 6(1)(b))"
            ],
            [
              "Публикации в Plaza",
              "Отправленный вами Skill или плагин и ваша личность автора",
              "Проверка, публикация, распространение, расчёты",
              "Исполнение договора (ст. 6(1)(b))"
            ],
            [
              "Обратная связь по продукту",
              "Написанный вами текст, любой прикреплённый файл или скриншот, версия приложения и идентификатор установки",
              "Диагностика проблемы, её устранение и ответ вам",
              "Ваше согласие, выраженное отправкой отзыва (ст. 6(1)(a))"
            ],
            [
              "Телеметрия десктопного приложения",
              "Случайный идентификатор установки (UUID), версия приложения, имена разрешённых событий, ключ последовательности сессии и небольшой набор нечувствительных атрибутов",
              "Измерение активности и использования функций, диагностика сбоев",
              "Ваше согласие (ст. 6(1)(a)); можно отключить в любой момент"
            ],
            [
              "Журналы сервера",
              "Временная метка, путь запроса, код состояния, IP-адрес, user agent",
              "Обеспечение безопасности сервиса, отражение атак, диагностика неисправностей",
              "Наш законный интерес в обеспечении безопасной работы сервиса (ст. 6(1)(f))"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**О телеметрии:** IP-адрес запроса телеметрии используется в памяти только для ограничения частоты запросов и **никогда не записывается в базу данных**. Ничто не фиксирует связь между случайным идентификатором установки и вашей учётной записью, поэтому мы не можем отследить телеметрию до конкретного человека. Отключение телеметрии в настройках полностью её останавливает; больше ничего в продукте не меняется."
        },
        {
          "type": "p",
          "text": "Там, где мы опираемся на законные интересы, мы сопоставили этот интерес с вашими правами и заключили, что он их не отменяет; обработка ограничена вопросами безопасности и диагностики сбоев, и вы можете возразить в любой момент согласно пункту 10."
        },
        {
          "type": "p",
          "text": "Предоставление данных, помеченных как необходимые для договора, является условием наличия учётной записи: без них мы не можем создать или использовать её. Всё, что основано на согласии, является полностью добровольным."
        }
      ]
    },
    {
      "id": "not-collect",
      "title": "3. Что мы не собираем",
      "blocks": [
        {
          "type": "p",
          "text": "Приведённые ниже положения о документах и AI-разговорах касаются локального использования десктопного приложения. Надстройка для Office/WPS обрабатывает документы и разговоры через наш размещённый бэкенд, как описано в пунктах 6 и 8. В остальном мы активно не собираем следующее:"
        },
        {
          "type": "ul",
          "items": [
            "Ваши документы, материалы дел или файлы проектов и их содержимое — десктопное приложение работает локально в первую очередь, и они остаются на вашем устройстве;",
            "Ваши разговоры с ИИ на настольном компьютере — настольное приложение взаимодействует с поставщиком модели напрямую; размещённая обработка и хранение данных для надстройки Office/WPS отдельно описаны в пунктах 6 и 8;",
            "Специальные категории данных по ст. 9 GDPR: мы не запрашиваем и не хотим получать данные о здоровье, этнической принадлежности, политических взглядах, религии, членстве в профсоюзах, половой жизни или биометрических идентификаторах;",
            "Государственные идентификаторы, номера платёжных карт (ими занимается Stripe, и мы их никогда не видим), местоположение, контакты, журнал вызовов, сообщения или фотобиблиотеки;",
            "Ваше поведение вне этого сервиса — мы не используем сторонние SDK для аналитики или рекламы и не покупаем данные о вас у кого-либо."
          ]
        },
        {
          "type": "p",
          "text": "Мы не используем ваш контент для обучения моделей, не продаём персональные данные и не осуществляем профилирование или автоматизированное принятие решений, имеющее юридические или иные значимые для вас последствия."
        }
      ]
    },
    {
      "id": "cookies",
      "title": "4. Cookies",
      "blocks": [
        {
          "type": "p",
          "text": "Сайт устанавливает один cookie:"
        },
        {
          "type": "table",
          "head": [
            "Имя",
            "Назначение",
            "Атрибуты",
            "Срок действия"
          ],
          "rows": [
            [
              "awd_session",
              "Поддерживает вашу авторизацию",
              "HttpOnly, SameSite=Lax, Secure",
              "30 дней"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**Именно поэтому на сайте нет баннера о cookie.** Согласно директиве ePrivacy согласие требуется для cookie, не являющихся строго необходимыми. Наш cookie строго необходим — он существует только для поддержания вашей авторизации и не может быть отключён, пока вы авторизованы. Мы не используем cookie для аналитики, рекламы или межсайтового отслеживания, поэтому нам не о чём вас спрашивать."
        },
        {
          "type": "p",
          "text": "Веб-шрифты встроены в сайт на этапе сборки, поэтому загрузка страницы не отправляет запросы сторонним хостам. Вы можете удалить cookie в своём браузере; эффект будет таким же, как при выходе из аккаунта."
        }
      ]
    },
    {
      "id": "use",
      "title": "5. Как мы используем данные",
      "blocks": [
        {
          "type": "ul",
          "items": [
            "Работа сервиса: идентификация аккаунтов, проверка прав доступа, расчёт платежей, предоставление купленного вами;",
            "Безопасность: выявление аномальных входов и злоупотреблений, ограничение частоты запросов, защита от атак, диагностика сбоев;",
            "Улучшение продукта: агрегированная статистика анонимной телеметрии, показывающая, какие функции используются и где пользователи прекращают работу;",
            "Обработка ваших отзывов: чтение отправленного вами, воспроизведение проблемы, её исправление и ответ вам;",
            "Юридические обязательства: ведение налоговой и бухгалтерской отчётности, требуемой законом;",
            "Коммуникация с вами: изменения в сервисе, инциденты безопасности, изменения условий."
          ]
        },
        {
          "type": "p",
          "text": "Мы не используем данные ни для чего другого. Если когда-либо возникнет такая необходимость, мы отдельно запросим ваше согласие. Мы не используем персональные данные для таргетированной рекламы или дифференцированного ценообразования и не отправляем маркетинговые письма без вашего запроса."
        }
      ]
    },
    {
      "id": "third-parties",
      "title": "6. Раскрытие данных и третьи стороны",
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
            "Получатель",
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
      "title": "8. Как долго мы её храним",
      "blocks": [
        {
          "type": "callout",
          "text": "**Хранение документов и переписки в надстройке.** Встроенное содержимое документов и необработанные аргументы/результаты инструментов используются только в рамках текущего запроса и временных кэшей памяти; они не сохраняются в очереди запросов и в истории переписки. Надстройка не создаёт автоматически долговременных сводок переписки. Тела запросов в очереди удаляются не позднее чем через 30 минут и могут быть вытеснены раньше или потеряны при перезапуске; в этом случае потребуется новая загрузка документа. Сообщения пользователя, ответы AI и рассуждения остаются в истории переписки **до тех пор, пока пользователь не удалит переписку, без отдельного автоматического срока удаления**. Это касается и текста документов, вставленного пользователем или процитированного AI. Удаление переписки также удаляет запросы из очереди и производные сводки и очищает кэши документов; записи об использовании для биллинга сохраняются. Копии, уже перенесённые в настольный проект, подчиняются правилам этого проекта и не удаляются удалённо при удалении облачной переписки. В более ранних версиях встроенные тела хранились в очереди, а выдержки из инструментов и сводки — в хранилище переписок. Это обновление удаляет исторические встроенные тела из активной очереди запросов. Оно также удаляет необработанные выдержки инструментов и производные сводки из переписок, которые всё ещё можно идентифицировать как переписки надстройки Office/WPS по записям об источнике запросов. Исторические переписки без таких записей об источнике невозможно надёжно классифицировать, и они не охватываются этой очисткой, специфичной для Office. Операционные резервные копии и материалы, уже переданные третьим лицам, рассматриваются отдельно; это не обещание ретроспективного удаления каждой копии."
        },
        {
          "type": "table",
          "head": [
            "Категория",
            "Срок хранения"
          ],
          "rows": [
            [
              "Данные учётной записи",
              "Пока существует учётная запись; удаление или анонимизация в течение 30 дней после её закрытия"
            ],
            [
              "Сессионные токены",
              "30 дней, затем удаляются автоматически"
            ],
            [
              "Хэши ключей учётной записи",
              "Удаляются при отзыве или закрытии учётной записи"
            ],
            [
              "Заказы, записи реестра, налоговые и платёжные документы",
              "Не менее 7 лет с конца соответствующего финансового года (ст. 51C Закона о внутренних доходах Гонконга и ст. 373 Закона о компаниях; дольше, если этого требует налоговое законодательство вашей страны). **Закрытие учётной записи не сокращает этот срок** — эти записи хранятся в ограниченной форме исключительно для бухгалтерского учёта."
            ],
            [
              "Публикации на Plaza",
              "Удаляются в течение 90 дней после снятия с публикации; уже распространённые копии не затрагиваются"
            ],
            [
              "Отзывы о продукте",
              "24 месяца, либо до закрытия указанной проблемы и отправки вам ответа, в зависимости от того, что позже; удаляются по запросу в любое время"
            ],
            [
              "Анонимная телеметрия",
              "24 месяца, затем удаляются по мере ротации"
            ],
            [
              "Серверные журналы",
              "90 дней"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**При удалении.** Вы можете закрыть свою учётную запись самостоятельно на странице аккаунта. В течение 30 дней мы удаляем ваш профиль, учётные данные, хэши ключей учётной записи и сессионные данные, а также анонимизируем всё остальное, на что не распространяется приведённое выше правило хранения. Что остаётся — это финансовая отчётность: записи о заказах и реестре, сокращённые до идентификатора транзакции, суммы, налоговых данных и дат, необходимых для выполнения налогового и корпоративного законодательства. Эту часть мы не вправе удалять по запросу, и ни один поставщик в таком положении не может честно обещать иное."
        },
        {
          "type": "p",
          "text": "По истечении этих сроков мы удаляем или анонимизируем данные. Если закон требует более длительного хранения, действует закон."
        }
      ]
    },
    {
      "id": "security",
      "title": "9. Как мы её защищаем",
      "blocks": [
        {
          "type": "ul",
          "items": [
            "При передаче: HTTPS принудительно используется на всём сайте;",
            "Пароли: хранятся в виде хэшей scrypt с солью — мы не можем восстановить исходный пароль;",
            "Ключи учётной записи: хранятся только хэш и префикс; открытый текст показывается вам один раз при создании и после этого нигде не существует в наших системах;",
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
          "text": "По любым вопросам, запросам или жалобам, связанным с настоящей политикой или обработкой нами ваших персональных данных, пишите на . Мы отвечаем в течение одного месяца."
        },
        {
          "type": "p",
          "text": "Сначала сообщите об этом нам — в большинстве случаев решить вопрос напрямую быстрее. Однако вы не обязаны это делать и никогда не теряете право обратиться в другое место:"
        },
        {
          "type": "ul",
          "items": [
            "Если вы находитесь в ЕЭЗ, вы можете подать жалобу в орган по защите данных страны, в которой проживаете, работаете или в которой предположительно произошло нарушение;",
            "Если вы находитесь в Великобритании, в Управление комиссара по информации (Information Commissioner's Office);",
            "Если вы находитесь в Гонконге, в Управление комиссара по вопросам защиты персональных данных;",
            "В других странах — в орган, осуществляющий надзор за защитой данных в стране вашего проживания."
          ]
        },
        {
          "type": "p",
          "text": "Вы также можете обратиться за судебной защитой или использовать порядок разрешения споров, установленный в Условиях предоставления услуг."
        }
      ]
    }
  ]
});
export default legalDoc;
