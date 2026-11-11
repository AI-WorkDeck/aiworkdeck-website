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
  "title": "서비스 이용약관",
  "effectiveLabel": "Effective {__T_SITE_LEGAL_EFFECTIVE_DATE__}",
  "intro": "These Terms form an agreement between you and  (\"we\", \"us\") covering {__T_siteConfig_host__}, the AI WorkDeck desktop application, the Office add-ins, the Skill and plugin plazas and related services (together, the \"Service\"). By registering an account, generating an account key or otherwise using the Service, you confirm that you have read, understood and accepted these Terms.",
  "highlightsTitle": "The short version",
  "highlights": [
    "**AI 출력은 법률 자문이 아닙니다.** 당사는 법률 서비스를 제공하지 않으며, 서비스 이용으로 인해 변호사-의뢰인 관계 또는 대리 관계가 성립하지 않습니다. AI 출력에는 부정확한 사실, 폐지된 조항, 실제로 존재하지 않는 판례가 포함될 수 있습니다. 이를 근거로 삼기 전에 반드시 독립적으로 검증하셔야 합니다.",
    "**데스크톱 애플리케이션의 인터페이스는 현재 중국어로만 제공됩니다.** 웹사이트는 이중 언어를 지원하지만, 다운로드한 소프트웨어는 그렇지 않습니다. 구매 전에 이 점을 반드시 확인하시기 바랍니다 — 제2조를 참조하세요.",
    "**AI에 전송하는 콘텐츠에 대한 책임은 사용자에게 있습니다.** 플랫폼 AI 채널을 통해 전송하는 콘텐츠는 미국의 모델 제공업체로 전달됩니다. 공개가 허용되지 않는 자료는 제출하지 마십시오.",
    "**계정 키는 사용자의 자격 증명과 동일하게 취급됩니다.** 계정 키는 전체가 한 번만 표시되며, 유출로 인한 결과는 사용자의 책임입니다. 유출 시 계정에서 즉시 폐기하시기 바랍니다.",
    "**당사가 지급하는 Credits(크리에이터 수익, 선물, 코드 교환)는 적립 후 24개월 내에 만료되며 인출할 수 없습니다.** 사용자가 직접 충전한 Credits는 만료되지 않으며, 계정을 해지할 때 환불받을 수 있습니다. 사용 시 먼저 만료 예정 잔액부터 차감됩니다.",
    "**EU, EEA 또는 영국의 소비자인 경우, Credits 구매는 즉시 이행이 시작되는 것으로 해당 구매에 대한 14일 청약철회권이 소멸됩니다.** 결제 시 이에 대한 확인을 요청받게 됩니다. 단, 사용하지 않은 Credits의 구매분은 여전히 환불해 드립니다 — 제7조를 참조하세요.",
    "**당사의 책임은 제한됩니다** — 제12조를 참조하세요. 이 책임 한도는 당사의 고의 또는 중대한 과실에 대한 책임, 사망이나 신체 상해에 대한 책임, 또는 법률상 배제가 허용되지 않는 사항에 대한 책임에는 적용되지 않습니다.",
    "**분쟁은 중재로 해결됩니다** — 제16조를 참조하세요. 소비자인 경우, 해당 조항은 거주지의 강행법이 보장하는 보호를 박탈하지 않습니다.",
    "**본 사이트와 {__T_siteConfig_otherSite_host__}는 별개입니다.** 계약 주체, 계정, 잔액이 모두 분리되어 있으며, 해당 사이트에 보유한 자산은 여기에서 사용할 수 없습니다 — 제1조를 참조하세요."
  ],
  "tocTitle": "Contents",
  "sections": [
    {
      "id": "parties",
      "title": "1. 당사자 및 적용 범위",
      "blocks": [
        {
          "type": "p",
          "text": "본 서비스는  이 운영하며, 해당 회사는 홍콩 특별행정구에서 회사조례(제622장)에 따라 설립되었습니다. 등록 사무소: . 연락처: ."
        },
        {
          "type": "p",
          "text": "본 약관은 {__T_siteConfig_host__}, 데스크톱 애플리케이션, Office 애드인, Skill 및 플러그인 플라자, 그리고 당사가 제공할 수 있는 기타 관련 서비스에 적용됩니다. 오픈소스 라이선스로 배포되는 데스크톱 애플리케이션의 일부(코드 저장소의 LICENSE 파일 참조)는 해당 라이선스의 추가적인 규율을 받으며, 라이선스가 본 약관과 충돌하는 경우 해당 부분에는 라이선스가 우선합니다."
        },
        {
          "type": "callout",
          "text": "**{__T_siteConfig_host__}와 {__T_siteConfig_otherSite_host__}는 서로 별개의 두 서비스입니다.** 두 서비스는 분리된 인프라와 데이터베이스에서 운영되며, 각기 다른 계약 주체가 서로 다른 준거법에 따라 운영합니다. 계정, 비밀번호, Credits 잔액, 구매한 권한 및 계정 키는 **상호 이전되지 않습니다**. 여기서 가입한다고 해당 사이트의 계정이 생기는 것이 아니며, 해당 사이트에서 구매한 것은 여기에서 사용할 수 없습니다. 반대 사이트에 이미 계정이 있고 이 사이트를 이용하려면 다시 가입해야 합니다."
        },
        {
          "type": "callout",
          "text": "**데스크톱 애플리케이션은 중국어 인터페이스를 기본 제공합니다.** 본 웹사이트는 영어와 중국어를 지원하지만, 소프트웨어 자체 — 메뉴, 대화상자, 설정, 오류 메시지 — 는 현재 중국어로만 제공되며, 앱 내 도움말 대부분도 중국어입니다. AI 기능은 작성한 언어로 응답하며, 편집하는 문서에는 영향이 없습니다. 영어 웹사이트를 보고 구매한 분들이 가장 실망할 수 있는 부분이기에 여기서 명확히 안내드립니다. 이것이 문제가 된다면 구매하지 마십시오."
        },
        {
          "type": "p",
          "text": "본 약관은 영어와 중국어로 작성되었습니다. 두 버전 간에 불일치가 있는 경우 영어 버전이 우선합니다."
        }
      ]
    },
    {
      "id": "eligibility",
      "title": "2. 서비스 이용 자격",
      "blocks": [
        {
          "type": "p",
          "text": "본 서비스는 법률, 컴플라이언스 및 인접 분야 종사자와 조직을 위해 설계되었으며, 전문적 판단 능력을 갖춘 사용자를 전제로 합니다. 사용자는 본 약관을 체결할 법적 능력이 있거나, 소속 조직을 대신하여 본 약관에 동의할 적법한 권한이 있음을 확인합니다."
        },
        {
          "type": "p",
          "text": "본 서비스는 18세 미만에게 제공되지 않습니다. 당사는 어린이에게 서비스를 제공하거나 어린이로부터 정보를 수집하는 일을 의도적으로 하지 않습니다."
        },
        {
          "type": "p",
          "text": "사용자는 자신이 속한 지역에서 서비스 이용이 합법인지, 자신에게 적용되는 수출 통제, 제재 또는 업무상 제한이 있는지 확인할 책임이 있습니다. 당사에 적용되는 제재 또는 수출 통제 규정을 위반하게 되는 경우 서비스 제공을 거절하거나 중단할 수 있습니다."
        }
      ]
    },
    {
      "id": "account",
      "title": "3. 계정 및 계정 키",
      "blocks": [
        {
          "type": "p",
          "text": "가입 시 사용자 이름, 이메일 주소, 비밀번호가 필요합니다. 정확한 정보를 제공하고 자격 증명을 안전하게 관리해야 합니다. 이를 소홀히 하여 발생한 손해는 사용자가 부담합니다."
        },
        {
          "type": "p",
          "text": "계정 키(awdk_로 시작하는 문자열)는 데스크톱 애플리케이션과 Office 애드인을 웹사이트 계정에 연결합니다. 당사는 평문이 아닌 해시만 저장하므로, 분실한 키는 복구할 수 없으며 새로 발급만 가능합니다. 계정당 활성 키는 최대 3개까지 보유할 수 있습니다."
        },
        {
          "type": "callout",
          "text": "**계정 키를 보유한 자는 사용자 본인으로 간주됩니다.** 비밀번호처럼 관리하고, 양도·판매·게시하지 마십시오. 유출 시 계정에서 즉시 폐기하시기 바랍니다. 폐기 전 해당 키로 수행된 모든 작업과 발생한 모든 비용은 사용자의 책임입니다."
        },
        {
          "type": "p",
          "text": "당사는 합리적으로 필요한 경우 계정을 정지하거나 해지할 수 있습니다. 본 약관이나 법률 위반, 서비스 공격 또는 악용 목적의 계정 사용, 장기간의 비정상 활동, 사기 혐의 등이 그 예입니다. 긴급한 경우를 제외하고 사전에 통지하고 시정할 기회를 드립니다. 정당한 사유 없이 계정을 해지하는 경우, 미사용 충전 Credits를 환불해 드립니다."
        }
      ]
    },
    {
      "id": "ai",
      "title": "4. AI 기능의 기능과 한계",
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
          "text": "Digital goods (Skills, plugins, feature unlocks) are treated as performed once available for download. Within 14 days of purchase you may request a refund if the item has a material defect — it cannot be installed, or differs substantially from its description — and we fail to remedy it within a reasonable period; where you paid in Credits, the Credits are returned. Problems caused by your own device, network or manner of use are not grounds for refund. This does not affect your statutory rights as a consumer in respect of goods or digital content that are not as described or not of satisfactory quality."
        },
        {
          "type": "p",
          "text": "On closing your account you may ask for unspent topped-up Credits to be returned to the original payment method. We refund the amount you paid; where the payment provider does not return its processing fee on a refund made long after the original payment, we may deduct that fee, and we tell you the figure before proceeding. Granted Credits are not refundable."
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
          "text": "We grant you a non-exclusive, non-transferable, revocable license to use the Service, subject to these Terms, for your own or your organization's business purposes. You may not reverse-engineer the Service (except as an open-source license or mandatory law permits), circumvent its licensing or billing mechanisms, scrape it in bulk, or resell, rent or timeshare it to third parties."
        }
      ]
    },
    {
      "id": "thirdparty",
      "title": "9. Third-party services",
      "blocks": [
        {
          "type": "p",
          "text": "The Service depends on third parties: Stripe for payments, OpenRouter for model routing, GitHub for installer and source hosting, and cloud providers for infrastructure. Each operates under its own terms."
        },
        {
          "type": "p",
          "text": "If a third-party service is interrupted, changed or discontinued, the corresponding features may be affected. We will make reasonable efforts to find alternatives but are not responsible for the conduct of those third parties. Where a model you rely on is withdrawn by its provider, we will point you at the nearest available substitute; we cannot guarantee any particular model stays available."
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
          "text": "We may add, change or discontinue parts of the Service. If we discontinue something you have paid for, we will refund the unperformed portion pro rata. If we discontinue this site altogether, we will give you at least 30 days' notice and refund unspent topped-up Credits."
        },
        {
          "type": "p",
          "text": "Desktop updates come as in-app patches or as full installers, per the release notes page. You may decline updates, but older versions may lose online functionality as interfaces change."
        },
        {
          "type": "p",
          "text": "The desktop application runs on your own machine and depends on it. We do not back up your local documents or work history — that is yours to arrange."
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
          "text": "This clause does not exclude any warranty, condition or guarantee that cannot be excluded by law, including the statutory rights of consumers under the law of their own country."
        }
      ]
    },
    {
      "id": "liability",
      "title": "12. Limitation of liability",
      "blocks": [
        {
          "type": "callout",
          "text": "**To the maximum extent permitted by law, our total liability to you under these Terms and in connection with the Service is capped at the fees you actually paid us for the Service in the twelve months before the loss arose; if you have never paid, the cap is USD 100.**"
        },
        {
          "type": "p",
          "text": "To the maximum extent permitted by law, we are not liable for lost profits, business interruption, loss of goodwill, data loss, or any other indirect, incidental or consequential loss — even if we were told such loss was possible."
        },
        {
          "type": "callout",
          "text": "**This clause does not apply to, and we remain fully liable for: our wilful misconduct; our gross negligence; death or personal injury caused by our negligence; fraud or fraudulent misrepresentation; and any other liability that may not be limited or excluded by the law that applies to you.**"
        },
        {
          "type": "p",
          "text": "If you are a consumer, nothing in these Terms limits the rights the mandatory law of your country of residence gives you, and this clause takes effect only so far as that law allows."
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
          "text": "If we face a third-party claim, regulatory penalty or proceeding because you breached these Terms or the law, infringed a third-party right, or because of content you submitted to the Service, you will compensate us for the losses actually incurred, including reasonable legal and arbitration costs."
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
