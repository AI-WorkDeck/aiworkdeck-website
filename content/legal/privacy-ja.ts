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
  "eyebrow": "法務",
  "title": "プライバシーポリシー",
  "effectiveLabel": "Effective {__T_LEGAL_EFFECTIVE_DATE__}",
  "intro": "This policy explains how  () collects, uses, stores and discloses personal information when you use the AI WorkDeck website and desktop application, and what rights you have. We suggest reading it in full; if you only want the gist, the summary below covers it.",
  "highlightsTitle": "The short version",
  "highlights": [
    "**The Office/WPS add-in uses cloud processing.** The current document, necessary conversation history and references you select reach our hosted backend, then Alibaba Cloud Model Studio and the inference provider serving your selected model. Raw document bodies use transient memory; user messages, AI replies and reasoning remain until you delete the conversation. See clauses 6 and 8.",
    "デスクトップの文書、プロジェクト、作業履歴は端末に保存します。プラットフォームAIを呼び出すと、必要な文章、ファイル抜粋、画像、会話の文脈が中国のゲートウェイを経てModel Studioに送信されます。ローカル保存でも、リクエストはサーバーを経由します。",
    "**Six platform-sourced services do pass through our servers** (text recognition, web search, company registry data, securities and financial data, statute and case law search, meeting transcription): we buy from the vendor on your behalf so you need no key of your own, and the content each call requires is relayed through us to that vendor. **All six vendors are inside mainland China, so this tier involves no cross-border transfer.** Only meeting audio is held briefly on our side, and it is deleted once transcription finishes. Any of them can be switched to your own key or turned off. See clauses 2, 6, 7 and 8.",
    "**The site sets exactly one cookie** (`awd_session`, to keep you signed in). There is no third-party analytics, advertising or tracking code, and web fonts are self-hosted, so no request goes to a third party.",
    "**Desktop telemetry is anonymous**: a random install identifier, the app version and whitelisted event names. No IP address is stored, nothing is linked to your account, no document content is included, and it can be switched off.",
    "北京への接続は、すべての推論が中国本土で行われることを意味しません。処理地域は選択したモデルの配置情報に従い、China Elastic Zoneのモデルは中国本土外で処理する場合があります。海外からのサイトアクセスは引き続きシンガポールのキャッシュノードを使用します。",
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
              "制限付き呼び出し資格情報、アカウント認可情報、モデル、使用量、精算記録",
              "Provision and meter your AI credit",
              "Necessary to perform the contract"
            ],
            [
              "Plaza submissions",
              "ご提出いただいたSkillまたはプラグインおよび作者の身元情報",
              "審査、公開、配布、精算",
              "契約の履行に必要なため"
            ],
            [
              "デスクトップテレメトリー",
              "ランダムなインストール識別子(UUID)、アプリのバージョン、ホワイトリストに登録されたイベント名、会話シーケンスキー、および少数の非機密属性",
              "利用状況と機能の使用状況の計測、クラッシュの診断",
              "お客様の同意(オフに切り替えることが可能)"
            ],
            [
              "プラットフォーム由来の外部サービス",
              "各呼び出しに必要なコンテンツ(認識対象の画像、検索クエリ、会社名、ティッカー、検索語、会議の音声)に加え、内容を含まない台帳エントリ1件(サービス、数量、金額、タイムスタンプ)",
              "お客様に代わってベンダーを呼び出し、使用量を計測するため",
              "契約の履行に必要なため(お客様の呼び出しがリクエストとなります)"
            ],
            [
              "サーバーログ",
              "タイムスタンプ、リクエストパス、ステータスコード、IPアドレス",
              "セキュリティ、トラブルシューティング、攻撃の緩和",
              "合理的に必要なセキュリティ保守+法的義務"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**テレメトリーについて:**テレメトリーリクエストのIPアドレスは、レート制限のためにメモリ内でのみ使用され、**データベースに書き込まれることは決してありません**。ランダムなインストール識別子とお客様のアカウントを紐付ける記録は一切存在しないため、テレメトリーを個人まで遡って追跡することはできません。"
        }
      ]
    },
    {
      "id": "not-collect",
      "title": "3. 収集しない情報",
      "blocks": [
        {
          "type": "p",
          "text": "以下のドキュメントおよびAI会話に関する記述は、ローカルでのデスクトップ利用に関するものです。Office/WPSアドインは、第6条および第8条で説明する通り、当社がホストするバックエンドを通じてドキュメントと会話を処理します。それ以外の場合、当社は以下の情報を能動的に収集しません:"
        },
        {
          "type": "ul",
          "items": [
            "お客様のドキュメント、案件ファイルまたはプロジェクトファイルおよびその内容 — デスクトップアプリケーションはローカルファーストであり、これらはお客様のデバイス上に保存されます。**特定のコンテンツを特定の外部サービスに渡す場合**(画像をテキスト認識に、録音を文字起こしに渡す場合など)は、その呼び出しに必要な部分のみをベンダーに中継します。一時的に保持される会議音声を除き、当社はこれらを一切保持しません(第6条および第8条を参照);",
            "デスクトップの会話はプラットフォームAIの呼び出し時に中国のゲートウェイを経由しますが、課金ログと台帳に本文は保存しません。アドインの会話の保存と削除は第6条、第8条に従います。",
            "電話番号、ID番号、顔画像、指紋などの要配慮個人情報;",
            "位置情報、連絡先、通話履歴、メッセージ、フォトライブラリ;",
            "本サービス以外での閲覧履歴 — 当社はサードパーティのアナリティクスや広告SDKを使用していません。"
          ]
        },
        {
          "type": "p",
          "text": "当社はお客様のコンテンツをモデルの学習に使用せず、個人情報を販売することもありません。"
        }
      ]
    },
    {
      "id": "cookies",
      "title": "4. Cookie",
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
          "text": "中国サイトのプラットフォームAI（デスクトップ対話、Office/WPSアドイン、サイトのAIによるSkill作成）は、AI WorkDeckの中国サーバーからAlibaba Cloud Model Studio（百錬）の北京接続先を経由し、実際のモデル提供者が処理します。ゲートウェイの課金台帳にはアカウント、モデル、使用量、費用を記録し、転送する本文は記録しません。アドインの会話とSkillの既存の保存規則は変わりません。 Model Studioと推論提供者は、それぞれの保存、学習、処理地域に関する方針に従います。当社ゲートウェイの規則は第三者の保存ゼロを保証しません。モデルの配置情報：https://help.aliyun.com/zh/model-studio/beijing-access-information"
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
              "Alibaba Cloud Model Studioと実際のモデル提供者",
              "今回の質問、必要な会話履歴、ファイル抜粋、画像",
              "モデル推論、使用量計測、精算",
              "北京接続。処理地域はモデルの配置によって異なり、中国本土外の場合があります"
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
          "text": "中国サイトのプラットフォームAI（デスクトップ対話、Office/WPSアドイン、サイトのAIによるSkill作成）は、AI WorkDeckの中国サーバーからAlibaba Cloud Model Studio（百錬）の北京接続先を経由し、実際のモデル提供者が処理します。ゲートウェイの課金台帳にはアカウント、モデル、使用量、費用を記録し、転送する本文は記録しません。アドインの会話とSkillの既存の保存規則は変わりません。 北京への接続は、すべての推論が中国本土で行われることを意味しません。処理地域は選択したモデルの配置情報に従い、China Elastic Zoneのモデルは中国本土外で処理する場合があります。海外からのサイトアクセスは引き続きシンガポールのキャッシュノードを使用します。"
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
            "北京への接続は、すべての推論が中国本土で行われることを意味しません。処理地域は選択したモデルの配置情報に従い、China Elastic Zoneのモデルは中国本土外で処理する場合があります。海外からのサイトアクセスは引き続きシンガポールのキャッシュノードを使用します。",
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
          "text": "独自キーは設定した提供者の経路と方針に従います。完全なローカルモデルは端末で内容を処理します。処理地域は実際のモデルの配置情報をご確認ください。インストーラーは引き続きGitHubで配布します。"
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
