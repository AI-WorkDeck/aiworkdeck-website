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
  "eyebrow": "法務",
  "title": "利用規約",
  "effectiveLabel": "Effective {__T_SITE_LEGAL_EFFECTIVE_DATE__}",
  "intro": "These Terms form an agreement between you and  (\"we\", \"us\") covering {__T_siteConfig_host__}, the AI WorkDeck desktop application, the Office add-ins, the Skill and plugin plazas and related services (together, the \"Service\"). By registering an account, generating an account key or otherwise using the Service, you confirm that you have read, understood and accepted these Terms.",
  "highlightsTitle": "The short version",
  "highlights": [
    "**AI output is not legal advice.** We do not provide legal services and no lawyer-client or agency relationship arises from your use of the Service. AI output may contain incorrect facts, repealed provisions and cases that do not exist. You must verify it independently before relying on it.",
    "**The desktop application's interface is currently available in Chinese only.** The website is bilingual, but the software you download is not. Please confirm this works for you before you buy anything — see clause 2.",
    "**You are responsible for what you send to the AI.** Content you send through the platform AI channel is transmitted to a model provider in the United States. Do not submit material you are not permitted to disclose.",
    "**An account key is equivalent to your credentials.** It is shown in full only once; the consequences of disclosure are yours. Revoke it in your account immediately if it leaks.",
    "**Credits granted by us (creator earnings, gifts, redemption codes) expire 24 months after they are credited and cannot be withdrawn.** Credits you top up yourself never expire and can be refunded when you close your account. Spending draws on the expiring balance first.",
    "**If you are a consumer in the EU, EEA or UK, buying Credits starts immediate performance and ends your 14-day right of withdrawal for that purchase.** You are asked to confirm this at checkout. We still refund a purchase whose Credits you have not spent — see clause 7.",
    "**Our liability is capped** — see clause 12. The cap does not exclude liability for our wilful misconduct or gross negligence, for death or personal injury, or for anything the law does not allow us to exclude.",
    "**Disputes go to arbitration before  under ** — see clause 16. If you are a consumer, that clause does not take away the protections of the mandatory law where you live.",
    "**This site and {__T_siteConfig_otherSite_host__} are separate.** Separate contracting entities, separate accounts, separate balances. Nothing you hold there is usable here — see clause 1."
  ],
  "tocTitle": "Contents",
  "sections": [
    {
      "id": "parties",
      "title": "1. Parties and scope",
      "blocks": [
        {
          "type": "p",
          "text": "The Service is operated by , a company incorporated in the Hong Kong Special Administrative Region under the Companies Ordinance (Cap. 622),  . Registered office: . Contact: ."
        },
        {
          "type": "p",
          "text": "These Terms cover {__T_siteConfig_host__}, the desktop application, the Office add-ins, the Skill and plugin plazas, and other related services we may offer. Parts of the desktop application released under an open-source license (see the LICENSE file in the code repository) are additionally governed by that license; where the license conflicts with these Terms, the license prevails for those parts."
        },
        {
          "type": "callout",
          "text": "**{__T_siteConfig_host__} and {__T_siteConfig_otherSite_host__} are two separate services.** They run on separate infrastructure with separate databases, and each is operated by a different contracting entity under different governing law. Accounts, passwords, Credits balances, purchased entitlements and account keys **do not carry across**. Registering here does not give you an account there, and a purchase made there cannot be redeemed here. If you already have an account on the other site and want to use this one, you have to register again."
        },
        {
          "type": "callout",
          "text": "**The desktop application ships with a Chinese-language interface.** This website is available in English and Chinese, but the software itself — menus, dialogs, settings, error messages — is currently Chinese only, and so is most of the in-app help. The AI features respond in the language you write in, and documents you edit are unaffected. We say this plainly here because it is the single thing most likely to disappoint someone who buys on the strength of an English website. If it is a problem for you, do not buy."
        },
        {
          "type": "p",
          "text": "These Terms exist in English and Chinese. In the event of any discrepancy, the English version prevails."
        }
      ]
    },
    {
      "id": "eligibility",
      "title": "2. Who may use the Service",
      "blocks": [
        {
          "type": "p",
          "text": "The Service is designed for practitioners and organizations working in law, compliance and adjacent fields, and assumes users capable of exercising professional judgement. You confirm that you have the legal capacity to enter into these Terms, or that you are duly authorised to accept them on behalf of your organization."
        },
        {
          "type": "p",
          "text": "The Service is not offered to anyone under 18. We do not knowingly provide it to, or collect information from, children."
        },
        {
          "type": "p",
          "text": "You are responsible for checking that your use of the Service is lawful where you are, including any export control, sanctions or professional-practice restriction that applies to you. We may decline or discontinue service where providing it would breach sanctions or export control rules binding on us."
        }
      ]
    },
    {
      "id": "account",
      "title": "3. Accounts and account keys",
      "blocks": [
        {
          "type": "p",
          "text": "Registration requires a username, an email address and a password. You must provide accurate information and keep your credentials secure. Losses caused by your own failure to do so are yours to bear."
        },
        {
          "type": "p",
          "text": "An account key (a string beginning with awdk_) connects the desktop application and the Office add-ins to your website account. We store only its hash, never the plaintext, so a lost key cannot be recovered — only replaced. Each account may hold at most ten active keys."
        },
        {
          "type": "callout",
          "text": "**Whoever holds your account key is treated as you.** Guard it as you would a password; do not transfer, sell or publish it. If it leaks, revoke it in your account immediately. Everything done, and every charge incurred, with that key before revocation is your responsibility."
        },
        {
          "type": "p",
          "text": "We may suspend or close an account where reasonably necessary: breach of these Terms or of the law, use of the account to attack or abuse the Service, prolonged anomalous activity, or suspected fraud. Except in urgent cases we will notify you first and give you a chance to put the matter right. If we close your account without cause, we refund unspent topped-up Credits."
        }
      ]
    },
    {
      "id": "ai",
      "title": "4. What the AI features are, and are not",
      "blocks": [
        {
          "type": "callout",
          "text": "**The Service is a tool, not a legal service.** We are not a law firm, we do not give legal advice, and no lawyer-client, agency or other professional relationship arises from your use of the Service. Everything the AI produces — drafts, review comments, risk ratings, citation-check results — is working material for your consideration and is not a substitute for your own professional judgement."
        },
        {
          "type": "p",
          "text": "You accept the inherent limits of large language models: output is generated statistically rather than retrieved, and may contain statements contrary to fact, provisions that have been repealed or amended, and cases that do not exist or do not say what is claimed (commonly called \"hallucination\"). Features such as citation checking reduce but cannot eliminate this risk."
        },
        {
          "type": "p",
          "text": "The models available through the platform AI channel are trained predominantly on materials in English and Chinese and reflect that bias. Output about any particular jurisdiction — including your own — may be wrong in ways that are not obvious. Nothing in the Service is tuned to the law of any specific country."
        },
        {
          "type": "p",
          "text": "Accordingly, you undertake to verify AI output independently before using it in any external deliverable, any advice to a client, or any filing with a court or administrative authority. Consequences of using unverified output are yours."
        },
        {
          "type": "p",
          "text": "You must also observe the professional conduct and confidentiality rules that apply to you. Before submitting client or matter materials to the AI, you are responsible for deciding whether client consent is required and whether doing so is permitted in your jurisdiction and by your firm."
        }
      ]
    },
    {
      "id": "content",
      "title": "5. Your content and data",
      "blocks": [
        {
          "type": "p",
          "text": "The desktop application is local-first: your documents, projects and work history stay on your own device by default. We do not upload, retain or access them."
        },
        {
          "type": "p",
          "text": "The exceptions are features you trigger yourself. When you use the platform AI channel, the content you choose to send is processed by a model provider. When you use plugins that require network access (speech synthesis, document parsing), the relevant content goes to that provider. When you send us product feedback, the text and any attachment you include are uploaded to our feedback inbox. The Privacy Policy sets out each of these flows and where the servers are."
        },
        {
          "type": "p",
          "text": "You warrant that what you submit to the Service contains no information you are not permitted to disclose, no material infringing third-party intellectual property or trade secrets, and nothing unlawful. Claims, disputes or penalties arising from your content are yours to bear."
        },
        {
          "type": "p",
          "text": "You keep all rights in your own content. We do not use your documents to train models, and we do not pass them to anyone except as the Privacy Policy describes."
        }
      ]
    },
    {
      "id": "marketplace",
      "title": "6. Skill plaza and plugin plaza",
      "blocks": [
        {
          "type": "callout",
          "text": "**Paid submissions are not open on this site yet.** The plaza here currently lists free and first-party entries only. You can submit a free entry now; the creator revenue share described below applies from the point at which we open paid submissions, and we will announce that before it happens."
        },
        {
          "type": "p",
          "text": "You may submit entries to the Skill or plugin plaza. By submitting, you represent and warrant that the content is your own or fully licensed to you, that it infringes no third-party intellectual property, trade secret or other right, and that it contains no malicious code."
        },
        {
          "type": "p",
          "text": "So that we can run the plaza, you grant us a worldwide, non-exclusive, sublicensable, royalty-free license to store, reproduce, display and distribute your submission, to make it available for installation and update, and to quote and display it as reasonably needed to promote the Service. The license ends when your content is removed from the plaza, without affecting copies already distributed."
        },
        {
          "type": "p",
          "text": "We may review submissions and may decline to publish, or remove, content that appears to infringe, contains malicious code, is not fit to ship, or breaches the law or these Terms. Review is not an endorsement or warranty of quality, security or legality."
        },
        {
          "type": "callout",
          "text": "**Judge third-party content for yourself.** Community-contributed Skills and plugins are not built by us and we make no warranty as to their function, accuracy or security. Losses arising from their use are for the contributor to answer for."
        },
        {
          "type": "p",
          "text": "Once paid submissions open: when a paid entry sells, the creator immediately receives 70% of the transaction value as Credits (the platform retains 30%). Crediting happens at the moment of sale — no request, no waiting for manual settlement. Entitlements granted by redemption code are platform-funded promotion and generate no creator share."
        },
        {
          "type": "callout",
          "text": "**Creator earnings are settled in Credits. They cannot be converted to cash or withdrawn.** Credits can be spent on plaza items, feature unlocks and platform AI, and are valid for 24 months from crediting. Factor this in when you price a submission; if this settlement method is not acceptable to you, please do not submit paid entries."
        },
        {
          "type": "p",
          "text": "You are responsible for your own tax position on anything you earn through the plaza. We do not withhold, and we do not issue tax documents on your behalf."
        }
      ]
    },
    {
      "id": "payment",
      "title": "7. Credits: payment, spending, tax and cancellation",
      "blocks": [
        {
          "type": "p",
          "text": "Credits are the single unit of account across the Service. Topping up gives you Credits, which are used directly for platform AI, Skill and plugin purchases and feature unlocks — there is no separate \"allocation\" step. Payment is processed by Stripe; the amount and description shown at checkout govern."
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
          "text": "Credits are an accounting record of consideration paid. They are not a prepaid card or any form of electronic money: they bear no interest, cannot be transferred to another person, and cannot be used anywhere except within the Service on this site."
        },
        {
          "type": "callout",
          "text": "**Platform AI is charged against Credits by actual usage.** We set a usage cap with the upstream model provider based on your Credits balance and periodically deduct usage that has occurred. Any excess arising from synchronisation lag is borne by us — we will not bill you for it, and your Credits will never go negative."
        },
        {
          "type": "p",
          "text": "**Tax.** Prices are shown exclusive of tax unless the checkout page says otherwise. Where value added tax, goods and services tax, sales tax or a similar tax is due on your purchase, it is determined by your location, calculated by our payment provider and added at checkout, so you see the final amount before you pay. If you are buying as a business and hold a valid VAT or GST registration number, you may enter it at checkout; where the reverse charge applies, no tax is added and you account for it yourself. Any tax you owe on your own use of the Service, and any withholding your own jurisdiction imposes, is yours to handle."
        },
        {
          "type": "callout",
          "text": "**Right of withdrawal (EU, EEA and UK consumers).** As a consumer you normally have 14 days to withdraw from a distance contract for digital content. Credits are digital content delivered instantly: the moment your payment succeeds, they are in your balance and available to spend. At checkout you are therefore asked to expressly request that we begin performance immediately and to acknowledge that you thereby lose the right of withdrawal for that purchase. **If you do not give that confirmation, we cannot deliver the Credits immediately.** If you do give it, the right of withdrawal for that top-up ends when the Credits are credited."
        },
        {
          "type": "p",
          "text": "Whatever the position on withdrawal, we go further than the law requires in one respect: **if you have not spent any of the Credits from a top-up, you may ask us to reverse that top-up within 14 days and we will refund it in full to the original payment method.** Once part of a top-up has been spent, that top-up is no longer reversible, but any unspent balance remains refundable on account closure under the paragraph below."
        },
        {
          "type": "p",
          "text": "デジタル商品(Skill、プラグイン、機能解除など)は、ダウンロード可能になった時点で提供完了とみなされます。購入日から14日以内であれば、商品に重大な欠陥がある場合(インストールできない、説明と著しく異なるなど)で、合理的な期間内に当社が是正できないときは返金を請求できます。Creditsでお支払いの場合は、Creditsで返金されます。お客様自身のデバイス、ネットワーク、使用方法に起因する問題は返金の対象になりません。本項は、説明と異なる商品・デジタルコンテンツや品質が満足できる水準に達しない商品・デジタルコンテンツに関する消費者の法定の権利に影響を与えるものではありません。"
        },
        {
          "type": "p",
          "text": "アカウント解約時、未使用のチャージ済みCreditsの返金を元のお支払い方法に請求できます。当社はお客様がお支払いした金額を返金します。ただし、元のお支払いから長期間経過後の返金について決済プロバイダーが手数料を返還しない場合、当該手数料を差し引くことがあり、その金額は手続き前にお知らせします。付与されたCreditsは返金の対象外です。"
        },
        {
          "type": "p",
          "text": "当社は価格およびプランを変更することがあります。変更は、適用後の注文にのみ適用され、完了済みの取引やお客様がすでに保有するCreditsに遡及的に適用されることはありません。"
        }
      ]
    },
    {
      "id": "ip",
      "title": "8. 知的財産権",
      "blocks": [
        {
          "type": "p",
          "text": "オープンソースライセンスで別段の定めがある場合を除き、Serviceおよびそのソフトウェア、インターフェース、ドキュメント、商標、ロゴに関する知的財産権は、当社または各権利者に帰属します。「AI WorkDeck」およびそのロゴは当社の商標であり、当社の書面による許可なく、混同を招くおそれのある形での使用はできません。"
        },
        {
          "type": "p",
          "text": "当社は、本利用規約に従い、お客様ご自身または所属組織の業務目的でServiceを使用する、非独占的で譲渡不可、かつ撤回可能なライセンスを付与します。お客様は、Serviceのリバースエンジニアリング(オープンソースライセンスまたは強行法規により認められる場合を除く)、ライセンスおよび課金メカニズムの回避、大量スクレイピング、第三者への再販売・レンタル・タイムシェアリングを行ってはなりません。"
        }
      ]
    },
    {
      "id": "thirdparty",
      "title": "9. 第三者サービス",
      "blocks": [
        {
          "type": "p",
          "text": "Serviceは第三者に依存しています。決済はStripe、モデルルーティングはOpenRouter、インストーラーおよびソースコードのホスティングはGitHub、インフラはクラウドプロバイダーによるものです。各サービスはそれぞれの規約に基づき運営されています。"
        },
        {
          "type": "p",
          "text": "第三者サービスが中断、変更または終了した場合、該当する機能に影響が生じることがあります。当社は合理的な努力をもって代替策を探しますが、これらの第三者の行為について責任を負いません。お客様が利用しているモデルが提供元によって提供終了となった場合、最も近い代替モデルをご案内しますが、特定のモデルが利用可能であり続けることは保証できません。"
        }
      ]
    },
    {
      "id": "availability",
      "title": "10. 提供状況と変更",
      "blocks": [
        {
          "type": "p",
          "text": "当社はServiceの安定稼働に努めていますが、中断やエラーが一切ないことを保証するものではありません。メンテナンス、アップグレード、第三者の障害、ネットワーク攻撃、不可抗力に起因する中断について、当社は責任を負いません。計画的なメンテナンスは事前にお知らせします。"
        },
        {
          "type": "p",
          "text": "当社はServiceの一部を追加、変更または終了することがあります。お支払い済みの機能を終了する場合、未提供部分に応じた返金を行います。本サイト全体の運営を終了する場合は、少なくとも30日前に通知し、未使用のチャージ済みCreditsを返金します。"
        },
        {
          "type": "p",
          "text": "デスクトップアプリのアップデートは、リリースノートページに記載のとおり、アプリ内パッチまたは完全なインストーラーとして提供されます。アップデートを拒否することはできますが、古いバージョンはインターフェースの変更によりオンライン機能を利用できなくなる場合があります。"
        },
        {
          "type": "p",
          "text": "デスクトップアプリケーションはお客様のマシン上で動作し、それに依存します。当社はお客様のローカルドキュメントや作業履歴のバックアップを行いません。これらの管理はお客様ご自身で行っていただく必要があります。"
        }
      ]
    },
    {
      "id": "warranty",
      "title": "11. 保証の否認",
      "blocks": [
        {
          "type": "p",
          "text": "法律で許容される最大限の範囲において、Serviceは「現状有姿」で提供されます。当社は、商品性、特定目的への適合性、中断のないまたはエラーのない動作について、明示または黙示のいかなる保証も行わず、AI出力の正確性、完全性、適合性についても一切保証しません。"
        },
        {
          "type": "p",
          "text": "本条は、消費者の自国法上の法定権利を含む、法律上除外できない保証、条件または担保を排除するものではありません。"
        }
      ]
    },
    {
      "id": "liability",
      "title": "12. 責任の制限",
      "blocks": [
        {
          "type": "callout",
          "text": "**法律で許容される最大限の範囲において、本規約およびServiceに関して当社がお客様に対して負う責任の総額は、損失が発生した時点から遡って12か月以内にお客様が当社に実際にお支払いになったServiceの利用料を上限とします。お支払いがない場合、上限は100米ドルとします。**"
        },
        {
          "type": "p",
          "text": "法律で許容される最大限の範囲において、当社は、逸失利益、事業中断、営業権の損失、データの損失、その他の間接損失・付随的損失・結果的損失について、その可能性を事前に告知されていた場合であっても、責任を負いません。"
        },
        {
          "type": "callout",
          "text": "**本条は、当社の故意による不法行為、重過失、当社の過失による死亡または人身傷害、詐欺または欺罔的な虚偽表示、およびお客様に適用される法律により責任を制限または免除できないその他の責任には適用されず、当社はこれらについて一切の責任を負います。**"
        },
        {
          "type": "p",
          "text": "お客様が消費者である場合、本規約のいずれの条項も、お客様の居住国の強行法規が認める権利を制限するものではなく、本条はその法律が許容する範囲でのみ有効です。"
        },
        {
          "type": "p",
          "text": "本条と第4条は、Serviceが提供される基盤の一部を構成することをご理解ください。すなわち、価格は責任がこのように限定されることを前提に設定されています。"
        }
      ]
    },
    {
      "id": "indemnity",
      "title": "13. 補償",
      "blocks": [
        {
          "type": "p",
          "text": "お客様が本規約または法律に違反したこと、第三者の権利を侵害したこと、またはServiceに投稿したコンテンツにより、当社が第三者からの請求、規制当局の制裁または手続きに直面した場合、お客様は、合理的な法的費用および仲裁費用を含む、当社が実際に被った損失を補償するものとします。"
        },
        {
          "type": "p",
          "text": "This clause applies only to losses actually caused by your breach, and only so far as the law that applies to you allows. If you are a consumer, it does not extend beyond the liability you would have at law in any event."
        }
      ]
    },
    {
      "id": "termination",
      "title": "14. Termination",
      "blocks": [
        {
          "type": "p",
          "text": "You may stop using the Service and close your account at any time from your account page. We will then handle your personal information as set out in the Privacy Policy, and your account keys stop working immediately. Unspent topped-up Credits can be refunded under clause 7."
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
          "text": "We may revise these Terms. For substantive revisions affecting your main rights and obligations, we will give at least 30 days' notice before they take effect, by website announcement and by email to the address on your account."
        },
        {
          "type": "p",
          "text": "Continuing to use the Service after a revision takes effect means you accept it. If you do not accept it, stop using the Service and close your account before the effective date; you may then request a refund of unspent topped-up Credits and a pro rata refund of anything purchased but not yet performed."
        }
      ]
    },
    {
      "id": "disputes",
      "title": "16. Governing law and disputes",
      "blocks": [
        {
          "type": "p",
          "text": "These Terms — their formation, validity, interpretation, performance and any dispute about them — are governed by ."
        },
        {
          "type": "p",
          "text": "Before starting formal proceedings, please write to  setting out the problem. Most things are resolved this way, and we undertake to reply substantively within 30 days."
        },
        {
          "type": "callout",
          "text": "**Any dispute arising out of or in connection with these Terms shall be referred to and finally resolved by arbitration administered by  under its rules in force when the notice of arbitration is submitted. The seat of arbitration is Hong Kong, the tribunal consists of one arbitrator, and the language is English. The award is final and binding on both parties.**"
        },
        {
          "type": "p",
          "text": "Note that accepting this clause means both you and we give up the right to bring covered disputes before a court, and give up the right to proceed on a class or collective basis."
        },
        {
          "type": "callout",
          "text": "**If you are a consumer, this arbitration clause does not deprive you of anything the mandatory law of your country of residence gives you.** Where that law entitles you to bring proceedings in the courts of your own country, or entitles you to the protection of its own consumer rules, you keep that entitlement and we will not argue otherwise. In particular, consumers in the EU and EEA may use the applicable online and out-of-court dispute resolution channels in their own country."
        },
        {
          "type": "p",
          "text": "Nothing above prevents either party from applying to a competent court for interim or conservatory measures."
        }
      ]
    },
    {
      "id": "misc",
      "title": "17. General",
      "blocks": [
        {
          "type": "p",
          "text": "These Terms and the Privacy Policy are the whole agreement between us about the Service, and replace any earlier understanding about it."
        },
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
          "text": "Nobody other than you and us has any right to enforce these Terms."
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
