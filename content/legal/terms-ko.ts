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
  "eyebrow": "법적 고지",
  "title": "서비스 이용약관",
  "effectiveLabel": "{__T_LEGAL_EFFECTIVE_DATE__}부로 시행",
  "intro": "본 약관은 이용자와  () (\"당사\", \"회사\") 간의 계약으로서, AI WorkDeck 웹사이트 (), 데스크톱 애플리케이션, 플러그인, Skill 광장 및 관련 서비스(이하 통칭하여 \"서비스\")에 적용됩니다. 계정을 등록하거나 계정 키를 생성하거나 기타 방법으로 서비스를 이용함으로써, 귀하는 본 약관을 읽고 이해했으며 이에 동의했음을 확인합니다.",
  "highlightsTitle": "먼저 읽어주세요",
  "highlights": [
    "**AI 출력물은 법률 자문이 아닙니다.** 당사는 법률 서비스를 제공하지 않으며, 서비스 이용으로 변호사-고객 또는 대리 관계가 성립되지 않습니다. AI 출력물에는 사실과 다른 내용, 폐지된 조항, 존재하지 않는 판례가 포함될 수 있습니다. 이를 활용하기 전에 반드시 독립적으로 검증하셔야 합니다.",
    "**AI에 전송하는 내용에 대한 책임은 이용자에게 있습니다.** 플랫폼 AI 채널을 이용하면 입력 내용이 중국 본토 외부의 모델 제공업체로 전송됩니다. 국가 기밀, 민감한 개인정보 또는 공개가 허용되지 않는 자료를 제출하지 마십시오.",
    "**계정 키는 귀하의 자격 증명과 동일합니다.** 계정 키는 전체가 한 번만 표시되며, 유출에 따른 결과는 귀하의 책임입니다. 유출된 경우 계정에서 즉시 폐기하십시오.",
    "**당사가 지급한 Credits(크리에이터 수익, 선물, 코드 교환)는 지급일로부터 24개월 후 만료되며 출금할 수 없습니다.** 직접 충전한 Credits는 만료되지 않으며 계정을 해지할 때 환불받을 수 있습니다. 사용 시 먼저 만료 예정 잔액부터 차감됩니다.",
    "**당사의 책임은 제한됩니다** — 제12조를 참조하십시오. 이 한도는 당사의 고의 또는 중대한 과실에 대한 책임이나 법률상 배제할 수 없는 책임을 배제하지 않습니다.",
    "**분쟁은 베이징중재위원회의 중재로 해결되며 그 판정은 최종적입니다** — 제16조를 참조하십시오. 본 약관에 동의하면 귀하와 당사 모두 해당 분쟁에 대해 법원에 소송을 제기할 권리를 포기하는 것입니다."
  ],
  "tocTitle": "목차",
  "sections": [
    {
      "id": "parties",
      "title": "1. 당사자 및 적용 범위",
      "blocks": [
        {
          "type": "p",
          "text": "본 서비스는  ()가 운영하며, 통일사회신용코드는  입니다. 연락처: ."
        },
        {
          "type": "p",
          "text": "본 약관은 웹사이트, 데스크톱 애플리케이션, Office 애드인, Skill 및 플러그인 광장, 그리고 당사가 제공할 수 있는 기타 관련 서비스에 적용됩니다. 오픈소스 라이선스로 배포되는 데스크톱 애플리케이션의 일부(코드 저장소의 LICENSE 파일 참조)는 해당 라이선스에도 따르며, 해당 라이선스가 본 약관과 충돌하는 경우 해당 부분에 대해서는 라이선스가 우선합니다."
        },
        {
          "type": "p",
          "text": "본 약관은 중국어판과 영어판으로 제공됩니다. 내용에 차이가 있는 경우 중국어판이 우선합니다."
        }
      ]
    },
    {
      "id": "eligibility",
      "title": "14세 미만 아동에게는 서비스를 제공하지 않습니다. 18세 미만인 경우 서비스를 이용하기 전에 보호자와 함께 본 약관을 읽고 동의를 받아 주십시오.",
      "blocks": [
        {
          "type": "p",
          "text": "본 서비스는 법률, 컴플라이언스 및 인접 분야 종사자와 조직을 위해 설계되었으며, 전문적 판단 능력을 갖춘 이용자를 전제로 합니다. 귀하는 완전한 민사행위 능력을 보유하고 있거나, 귀속 조직을 대신하여 서비스를 이용할 적법한 권한을 보유하고 있음을 확인합니다."
        },
        {
          "type": "p",
          "text": "We do not offer the Service to children under 14. If you are under 18, please read these Terms with your guardian and obtain their consent before using the Service."
        }
      ]
    },
    {
      "id": "account",
      "title": "3. 계정 및 계정 키",
      "blocks": [
        {
          "type": "p",
          "text": "회원가입에는 사용자 이름, 이메일 주소 및 비밀번호가 필요합니다. 정확한 정보를 제공하고 자격 증명을 안전하게 관리해야 합니다. 이를 소홀히 하여 발생한 손실은 귀하가 부담합니다."
        },
        {
          "type": "p",
          "text": "계정 키(awdk_로 시작하는 문자열)는 데스크톱 애플리케이션을 웹사이트 계정과 연결합니다. 당사는 해시만 저장하며 평문은 저장하지 않으므로, 분실한 키는 복구할 수 없고 재발급만 가능합니다. 계정당 활성 키는 최대 3개까지 보유할 수 있습니다."
        },
        {
          "type": "callout",
          "text": "**귀하의 계정 키를 보유한 자는 귀하로 간주됩니다.** 비밀번호처럼 보관하시고 양도, 판매 또는 공개하지 마십시오. 유출된 경우 계정에서 즉시 폐기하십시오. 폐기 전 해당 키로 수행된 모든 작업과 발생한 모든 요금의 책임은 귀하에게 있습니다."
        },
        {
          "type": "p",
          "text": "당사는 본 약관 또는 법률 위반, 서비스 공격·악용 목적의 계정 사용, 장기간의 비정상 활동, 사기 혐의 등 합리적으로 필요한 경우 계정을 정지하거나 폐쇄할 수 있습니다. 긴급한 경우를 제외하고 사전에 통지합니다."
        }
      ]
    },
    {
      "id": "ai",
      "title": "4. AI 기능의 성격과 한계",
      "blocks": [
        {
          "type": "callout",
          "text": "**본 서비스는 도구이지 법률 서비스가 아닙니다.** 당사는 로펌이 아니며 법률 자문을 제공하지 않고, 서비스 이용으로 변호사-고객, 대리 또는 기타 전문 관계가 성립되지 않습니다. AI가 생성하는 모든 결과물 — 초안, 검토 의견, 위험도 평가, 인용 검증 결과 — 은 참고용 작업 자료일 뿐이며, 귀하의 전문적 판단을 대체할 수 없습니다."
        },
        {
          "type": "p",
          "text": "귀하는 대규모 언어 모델의 고유한 한계를 인정합니다. 출력은 검색이 아닌 통계적 방식으로 생성되며, 사실과 반대되는 진술, 폐지되었거나 개정된 조항, 존재하지 않거나 주장된 내용과 다른 판례(일명 \"환각\" 현상)가 포함될 수 있습니다. 인용 검증과 같은 기능은 이러한 위험을 줄일 수 있지만 완전히 제거할 수는 없습니다."
        },
        {
          "type": "p",
          "text": "Accordingly, you undertake to verify AI output independently before using it in any external deliverable, any advice to a client, or any filing with a judicial or administrative authority. Consequences of using unverified output are yours."
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
          "text": "The exceptions are features you trigger yourself. When you use the platform AI channel, the content you choose to send is processed by a model provider. When you use plugins that require network access (speech synthesis, document parsing), the relevant content goes to that provider. The Privacy Policy sets out these flows."
        },
        {
          "type": "p",
          "text": "You warrant that what you submit to the Service contains no state secrets, no information you are not permitted to disclose, no material infringing third-party intellectual property or trade secrets, and nothing unlawful. Disputes, claims or penalties arising from your content are yours to bear, and you will compensate us for losses we suffer as a result."
        },
        {
          "type": "p",
          "text": "You keep all rights in your own content. We do not use your documents to train models."
        }
      ]
    },
    {
      "id": "marketplace",
      "title": "6. Skill plaza and plugin plaza",
      "blocks": [
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
          "text": "When a paid entry sells, the creator immediately receives 70% of the transaction value as Credits (the platform retains 30%). Crediting happens at the moment of sale — no request, no waiting for manual settlement. Entitlements granted by redemption code are platform-funded promotion and generate no creator share."
        },
        {
          "type": "callout",
          "text": "**Creator earnings are settled in Credits. They cannot be converted to cash or withdrawn.** Credits can be spent on plaza items, feature unlocks and platform AI, and are valid for 24 months from crediting. Factor this in when you price a submission; if this settlement method is not acceptable to you, please do not submit paid entries."
        }
      ]
    },
    {
      "id": "payment",
      "title": "7. Credits: top-ups, spending and expiry",
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
