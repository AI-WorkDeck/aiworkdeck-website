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
  "title": "利用規約",
  "effectiveLabel": "Effective {__T_LEGAL_EFFECTIVE_DATE__}",
  "intro": "These Terms form an agreement between you and  () (\"we\", \"us\") covering the AI WorkDeck website (), the desktop application, plugins, the Skill plaza and related services (together, the \"Service\"). By registering an account, generating an account key or otherwise using the Service, you confirm that you have read, understood and accepted these Terms.",
  "highlightsTitle": "Read these first",
  "highlights": [
    "**AI output is not legal advice.** We do not provide legal services and no attorney-client or agency relationship arises from your use of the Service. AI output may contain incorrect facts, repealed provisions and non-existent cases. You must verify it independently before relying on it.",
    "**You are responsible for what you send to the AI.** When you use the platform AI channel, your input is transmitted to a model provider outside mainland China. Do not submit state secrets, sensitive personal information, or material you are not permitted to disclose.",
    "**An account key is equivalent to your credentials.** It is displayed in full only once; the consequences of disclosure are yours. Revoke it in your account immediately if it leaks.",
    "**Credits granted by us (creator earnings, gifts, redemption codes) expire 24 months after they are credited and cannot be withdrawn.** Credits you top up yourself never expire and can be refunded when you close your account. Spending draws on the expiring balance first.",
    "**Our liability is capped** — see clause 12. That cap does not exclude liability for our wilful misconduct or gross negligence, nor any liability that cannot be excluded by law.",
    "**Disputes go to arbitration before the Beijing Arbitration Commission and the award is final** — see clause 16. Accepting these Terms means both you and we give up the right to litigate covered disputes in court."
  ],
  "tocTitle": "Contents",
  "sections": [
    {
      "id": "parties",
      "title": "1. Parties and scope",
      "blocks": [
        {
          "type": "p",
          "text": "The Service is operated by  (), unified social credit code . Contact: ."
        },
        {
          "type": "p",
          "text": "These Terms cover the website, the desktop application, the Office add-ins, the Skill and plugin plazas, and other related services we may offer. Parts of the desktop application released under an open-source license (see the LICENSE file in the code repository) are additionally governed by that license; where the license conflicts with these Terms, the license prevails for those parts."
        },
        {
          "type": "p",
          "text": "These Terms exist in Chinese and English. In the event of any discrepancy, the Chinese version prevails."
        }
      ]
    },
    {
      "id": "eligibility",
      "title": "2. Who may use the Service",
      "blocks": [
        {
          "type": "p",
          "text": "本サービスは、法務、コンプライアンスおよびその周辺分野で活動する実務者および組織を対象として設計されており、専門的判断を行使できるユーザーを想定しています。お客様は、自己に完全な行為能力があること、または組織を代表して本サービスを利用する正当な権限を有することを確認するものとします。"
        },
        {
          "type": "p",
          "text": "本サービスは、14歳未満のお子様には提供いたしません。18歳未満の方は、保護者とともに本規約をお読みいただき、保護者の同意を得たうえで本サービスをご利用ください。"
        }
      ]
    },
    {
      "id": "account",
      "title": "3. アカウントとアカウントキー",
      "blocks": [
        {
          "type": "p",
          "text": "登録には、ユーザー名、メールアドレスおよびパスワードが必要です。正確な情報を提供し、認証情報を安全に管理してください。これらを怠ったことにより生じた損失は、お客様の負担となります。"
        },
        {
          "type": "p",
          "text": "アカウントキー(awdk_ で始まる文字列)は、デスクトップアプリケーションとウェブサイトアカウントを紐付けるものです。当社はそのハッシュのみを保存し、平文は決して保存しないため、紛失したキーは復元できず、再発行のみ可能です。各アカウントが保持できる有効なキーは最大3つです。"
        },
        {
          "type": "callout",
          "text": "**アカウントキーを保有する者は、お客様本人とみなされます。**パスワードと同様に厳重に管理し、譲渡、売買、公開をしないでください。キーが漏洩した場合は、直ちにアカウントで失効させてください。失効前にそのキーによって行われた一切の操作および発生した課金は、お客様の責任となります。"
        },
        {
          "type": "p",
          "text": "当社は、以下の場合など合理的に必要と判断される場合には、アカウントの停止または抹消を行うことがあります:本規約または法令への違反、本サービスへの攻撃または悪用を目的としたアカウント利用、長期間にわたる異常なアクティビティ、不正の疑いがある場合。緊急の場合を除き、事前にお客様に通知いたします。"
        }
      ]
    },
    {
      "id": "ai",
      "title": "4. AI機能とは何であり、何ではないのか",
      "blocks": [
        {
          "type": "callout",
          "text": "**本サービスはツールであり、法的サービスではありません。**当社は法律事務所ではなく、法的助言を提供するものではなく、本サービスのご利用によって弁護士・依頼者関係、代理関係その他の専門的関係が生じることもありません。AIが生成する一切の成果物——草案、レビューコメント、リスク評価、引用確認結果——は、お客様の検討用の作業資料であり、お客様ご自身の専門的判断の代替にはなりません。"
        },
        {
          "type": "p",
          "text": "お客様は、大規模言語モデルに固有の限界を了承するものとします。出力は検索ではなく統計的に生成されるものであり、事実に反する記述、廃止または改正された条文、存在しないまたは主張される内容とは異れる判例(いわゆる「ハルシネーション」)が含まれる可能性があります。引用確認などの機能は、このリスクを低減しますが、排除することはできません。"
        },
        {
          "type": "p",
          "text": "したがって、お客様は、AIの出力を、社外への成果物、クライアントへの助言、司法・行政機関への提出書類などに使用する前に、独自に検証する義務を負うものとします。未検証の出力を使用したことによる結果は、お客様の負担となります。"
        },
        {
          "type": "p",
          "text": "また、お客様は、自身に適用される職務規範および守秘義務に関する規則を遵守してください。AIにクライアントまたは案件の資料を提出する前に、クライアントの同意が必要かどうか、また、お客様の管轄地域および所属先においてそれが許容されるかどうかを判断する責任はお客様にあります。"
        }
      ]
    },
    {
      "id": "content",
      "title": "5. お客様のコンテンツとデータ",
      "blocks": [
        {
          "type": "p",
          "text": "デスクトップアプリケーションはローカルファーストであり、お客様のドキュメント、プロジェクトおよび作業履歴は、既定で お客様自身のデバイス上に保存されます。当社がこれらをアップロード、保有またはアクセスすることはありません。"
        },
        {
          "type": "p",
          "text": "例外は、お客様ご自身が実行する機能です。プラットフォームAIチャネルを利用すると、お客様が送信を選択したコンテンツはモデルプロバイダーによって処理されます。ネットワークアクセスを必要とするプラグイン(音声合成、ドキュメント解析)を利用すると、該当するコンテンツはそのプロバイダーに送信されます。これらの流れについては、プライバシーポリシーに定めています。"
        },
        {
          "type": "p",
          "text": "お客様は、本サービスに提出するコンテンツに、国家機密、開示が許可されていない情報、第三者の知的財産権または営業秘密を侵害する資料、および違法な内容が含まれていないことを保証するものとします。お客様のコンテンツに起因する紛争、請求または制裁はお客様の負担となり、当社が被った損失については、お客様が当社に補償するものとします。"
        },
        {
          "type": "p",
          "text": "お客様は、自己のコンテンツに関する一切の権利を保持します。当社は、お客様のドキュメントをモデルの学習に使用しません。"
        }
      ]
    },
    {
      "id": "marketplace",
      "title": "6. Skill プラザとプラグイン プラザ",
      "blocks": [
        {
          "type": "p",
          "text": "お客様は、Skill またはプラグインのプラザに作品を応募できます。応募により、お客様は、当該コンテンツが自己のものであるかまたは完全にライセンスを受けていること、第三者の知的財産権、営業秘密その他の権利を侵害していないこと、および悪意のあるコードが含まれていないことを表明しかつ保証するものとします。"
        },
        {
          "type": "p",
          "text": "当社がプラザを運営できるよう、お客様は当社に対し、応募作品を保存、複製、表示および配布し、インストールおよびアップデート可能な状態にし、本サービスの促進のため合理的に必要な範囲で引用および表示する、世界的、非独占的、サブライセンス可能、ロイヤリティフリーのライセンスを付与するものとします。コンテンツがプラザから削除された時点でライセンスは終了しますが、既に配布されたコピーには影響しません。"
        },
        {
          "type": "p",
          "text": "当社は応募作品を審査することがあり、侵害のおそれがあるもの、悪意のあるコードが含まれるもの、公開に適さないもの、法令または本規約に違反するものを掲載しない、または削除することがあります。審査は、品質、安全性または合法性に関する保証または推奨ではありません。"
        },
        {
          "type": "callout",
          "text": "**第三者のコンテンツは、ご自身で判断してください。**コミュニティ投稿の Skill およびプラグインは当社が作成したものではなく、その機能、正確性または安全性について当社は一切の保証をいたしません。これらの使用により生じた損失については、投稿者が責任を負います。"
        },
        {
          "type": "p",
          "text": "有料作品が販売されると、制作者は直ちに取引額の70%を Credits として受け取ります(プラットフォームが30%を保持)。Credits の付与は販売の瞬間に行われ、申請も手動決済の待機も不要です。引き換えコードによって付与される特典は、プラットフォーム負担によるプロモーションであり、制作者への分配は発生しません。"
        },
        {
          "type": "callout",
          "text": "**制作者の収益は Credits で決済されます。現金への換金または引き出しはできません。**Credits は、プラザのアイテム、機能のアンロック、プラットフォームAI に使用でき、付与から24か月間有効です。応募作品の価格設定の際にはこの点を考慮してください。この決済方法にご同意いただけない場合は、有料作品の応募はご遠慮ください。"
        }
      ]
    },
    {
      "id": "payment",
      "title": "7. Credits:チャージ、消費、有効期限",
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
