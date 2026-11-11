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
  "title": "개인정보처리방침",
  "effectiveLabel": "Effective {__T_LEGAL_EFFECTIVE_DATE__}",
  "intro": "This policy explains how  () collects, uses, stores and discloses personal information when you use the AI WorkDeck website and desktop application, and what rights you have. We suggest reading it in full; if you only want the gist, the summary below covers it.",
  "highlightsTitle": "The short version",
  "highlights": [
    "**The Office/WPS add-in uses cloud processing.** The current document, necessary conversation history and references you select reach our hosted backend, then Alibaba Cloud Model Studio and the inference provider serving your selected model. Raw document bodies use transient memory; user messages, AI replies and reasoning remain until you delete the conversation. See clauses 6 and 8.",
    "데스크톱 문서, 프로젝트, 작업 기록은 기기에 저장됩니다. 플랫폼 AI를 호출하면 필요한 텍스트, 파일 발췌, 이미지, 대화 맥락이 중국 게이트웨이를 통해 Model Studio로 전송됩니다. 로컬 저장이 서버를 거치지 않는다는 뜻은 아닙니다.",
    "**Six platform-sourced services do pass through our servers** (text recognition, web search, company registry data, securities and financial data, statute and case law search, meeting transcription): we buy from the vendor on your behalf so you need no key of your own, and the content each call requires is relayed through us to that vendor. **All six vendors are inside mainland China, so this tier involves no cross-border transfer.** Only meeting audio is held briefly on our side, and it is deleted once transcription finishes. Any of them can be switched to your own key or turned off. See clauses 2, 6, 7 and 8.",
    "**The site sets exactly one cookie** (`awd_session`, to keep you signed in). There is no third-party analytics, advertising or tracking code, and web fonts are self-hosted, so no request goes to a third party.",
    "**Desktop telemetry is anonymous**: a random install identifier, the app version and whitelisted event names. No IP address is stored, nothing is linked to your account, no document content is included, and it can be switched off.",
    "베이징 접속이 모든 추론의 중국 본토 처리를 뜻하지는 않습니다. 처리 지역은 선택한 모델의 배포 정보에 따르며 China Elastic Zone 모델은 중국 본토 밖에서 처리할 수 있습니다. 해외 웹사이트 접속은 계속 싱가포르 캐시 노드를 이용합니다.",
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
              "제한된 호출 자격 증명과 계정 권한 정보, 모델, 사용량, 정산 기록",
              "Provision and meter your AI credit",
              "Necessary to perform the contract"
            ],
            [
              "Plaza submissions",
              "The Skill or plugin you submit and your author identity",
              "Review, publication, distribution, settlement",
              "Necessary to perform the contract"
            ],
            [
              "Desktop telemetry",
              "Random install identifier (UUID), app version, whitelisted event names, a conversation sequence key, a small set of non-sensitive attributes",
              "Measure activity and feature use, diagnose crashes",
              "Your consent (can be switched off)"
            ],
            [
              "Platform-sourced external services",
              "The content each call requires (the image to recognize, a search query, a company name, a ticker, a search term, meeting audio), plus one ledger entry containing no content (service, quantity, amount, timestamp)",
              "Call the vendor on your behalf and meter the usage",
              "Necessary to perform the contract (your call is the request)"
            ],
            [
              "Server logs",
              "Timestamp, request path, status code, IP address",
              "Security, troubleshooting, attack mitigation",
              "Reasonably necessary security maintenance + legal obligation"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**About telemetry:** the IP address of a telemetry request is used in memory for rate limiting only and is **never written to the database**. Nothing records a link between the random install identifier and your account, so we cannot trace telemetry back to a person."
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
            "Your documents, case files or project files and their contents — the desktop application is local-first and these stay on your device. **When you hand a specific piece of content to a specific external service** (an image to text recognition, a recording to transcription): we then relay the part of it that the call requires to the vendor. Apart from meeting audio held briefly, we retain none of it (see clauses 6 and 8);",
            "데스크톱 대화는 플랫폼 AI 호출 시 중국 게이트웨이를 거치지만 과금 로그와 원장에는 본문을 보관하지 않습니다. 추가 기능 대화의 보관과 삭제는 제6조와 제8조를 따릅니다.",
            "Sensitive personal information such as phone numbers, ID numbers, facial images or fingerprints;",
            "Location, contacts, call logs, messages or photo libraries;",
            "Your browsing outside this service — we run no third-party analytics or advertising SDK."
          ]
        },
        {
          "type": "p",
          "text": "We do not use any of your content to train models, and we do not sell personal information."
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
              "30일"
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
          "text": "중국 사이트의 플랫폼 AI(데스크톱 대화, Office/WPS 추가 기능, 웹사이트 AI Skill 작성)는 AI WorkDeck 중국 서버에서 Alibaba Cloud Model Studio의 베이징 접속 지점을 거쳐 실제 모델 제공업체로 전달됩니다. 게이트웨이 정산 원장에는 계정, 모델, 사용량, 비용만 기록하고 전달한 본문은 기록하지 않습니다. 추가 기능 대화와 Skill의 기존 보관 규칙은 유지됩니다. Model Studio와 추론 제공업체의 보관, 학습, 처리 지역 정책이 각각 적용됩니다. 당사 게이트웨이 규칙이 제3자의 무보관을 보장하지는 않습니다. 모델 배포 정보: https://help.aliyun.com/zh/model-studio/beijing-access-information"
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
              "중국 본토"
            ],
            [
              "Alibaba Cloud Model Studio 및 실제 모델 제공업체",
              "현재 질문, 필요한 대화 기록, 파일 발췌 및 이미지",
              "모델 추론, 사용량 측정 및 정산",
              "베이징 접속. 실제 처리 지역은 모델 배포에 따르며 중국 본토 밖일 수 있음"
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
              "중국 본토"
            ],
            [
              "Alibaba Cloud (OCR)",
              "The image you submit for recognition",
              "Image text recognition",
              "중국 본토"
            ],
            [
              "Bocha (web search)",
              "Your search query",
              "Return web search results",
              "중국 본토"
            ],
            [
              "Qichacha",
              "The company name or unified social credit code you look up",
              "Return company registry data",
              "중국 본토"
            ],
            [
              "Tushare",
              "The ticker and fields you query",
              "Return securities and financial data",
              "중국 본토"
            ],
            [
              "PKULaw",
              "Your statute and case law search term",
              "Return statute and case law results",
              "중국 본토"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**How the six platform-sourced services flow.** The last six rows are the vendors behind the \"platform-sourced\" tier: we buy from them on your behalf, so you need no key of your own, and the content each call requires is relayed to the vendor through our servers and metered against your balance. **All six are inside mainland China**, so this tier involves no cross-border transfer. We do not log, store or train on what we relay; the sole exception is meeting audio, which is held briefly in our object storage so the transcription service can read it and is deleted once that finishes (see clause 8). Any of them can be switched, under Settings → Platform Services in the desktop app, to your own key (the app then talks to that vendor directly, bypassing us) or turned off entirely."
        },
        {
          "type": "callout",
          "text": "중국 사이트의 플랫폼 AI(데스크톱 대화, Office/WPS 추가 기능, 웹사이트 AI Skill 작성)는 AI WorkDeck 중국 서버에서 Alibaba Cloud Model Studio의 베이징 접속 지점을 거쳐 실제 모델 제공업체로 전달됩니다. 게이트웨이 정산 원장에는 계정, 모델, 사용량, 비용만 기록하고 전달한 본문은 기록하지 않습니다. 추가 기능 대화와 Skill의 기존 보관 규칙은 유지됩니다. 베이징 접속이 모든 추론의 중국 본토 처리를 뜻하지는 않습니다. 처리 지역은 선택한 모델의 배포 정보에 따르며 China Elastic Zone 모델은 중국 본토 밖에서 처리할 수 있습니다. 해외 웹사이트 접속은 계속 싱가포르 캐시 노드를 이용합니다."
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
            "베이징 접속이 모든 추론의 중국 본토 처리를 뜻하지는 않습니다. 처리 지역은 선택한 모델의 배포 정보에 따르며 China Elastic Zone 모델은 중국 본토 밖에서 처리할 수 있습니다. 해외 웹사이트 접속은 계속 싱가포르 캐시 노드를 이용합니다.",
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
          "text": "자체 키는 설정한 제공업체의 경로와 정책을 사용하며 완전한 로컬 모델은 기기에서 처리합니다. 처리 지역은 실제 모델의 배포 정보를 확인하세요. 설치 파일은 계속 GitHub로 배포합니다."
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
              "30일 후 자동 만료"
            ],
            [
              "계정 키 해시",
              "철회 또는 계정 폐쇄 시 삭제"
            ],
            [
              "주문, 원장 및 인보이스 기록",
              "거래 완료일로부터 최소 10년(『』 제29조). 계정을 폐쇄해도 이 기간은 단축되지 않습니다"
            ],
            [
              "Plaza 게시물",
              "삭제 후 90일 이내에 삭제되며, 이미 배포된 사본에는 영향을 미치지 않습니다"
            ],
            [
              "플랫폼 발신 통화를 위해 전달되는 콘텐츠",
              "보관하지 않습니다. 해당 통화가 진행되는 동안에만 서버를 경유합니다"
            ],
            [
              "회의 오디오 파일",
              "전사가 완료되거나 작업이 실패하면 즉시 프로그램에서 삭제되며, 오브젝트 스토리지의 24시간 수명 주기 규칙이 누락된 항목을 정리합니다. 데스크톱 앱으로 반환된 후에는 당사 측에 전사본을 보관하지 않습니다"
            ],
            [
              "익명 텔레메트리",
              "24개월 후 순차적으로 삭제"
            ],
            [
              "서버 로그",
              "6개월(『사이버보안법』 제21조에 따라 6개월 이상 보관 필요)"
            ]
          ]
        },
        {
          "type": "p",
          "text": "이 기간이 지나면 삭제 또는 익명화합니다. 법률에서 더 긴 기간을 요구하는 경우 해당 법률이 우선됩니다."
        }
      ]
    },
    {
      "id": "security",
      "title": "9. 정보 보호 방식",
      "blocks": [
        {
          "type": "ul",
          "items": [
            "전송 중: 사이트 전체에 HTTPS 적용",
            "비밀번호: salted scrypt 해시로 저장 — 원래 비밀번호는 복구할 수 없습니다",
            "계정 키: 해시와 접두사만 저장되며, 평문은 생성 시 한 번만 표시되고 이후 당사 시스템 어디에도 존재하지 않습니다",
            "모델 키: 암호화되어 저장",
            "접근 통제: 프로덕션 접근은 필요한 인원으로 제한됩니다",
            "내구성: 금융 데이터는 트랜잭션 방식으로 기록되며 정기적으로 백업됩니다."
          ]
        },
        {
          "type": "p",
          "text": "어떤 시스템도 완벽하게 안전하지는 않습니다. 개인정보가 유출, 변조 또는 분실되어 사용자에게 피해가 발생할 수 있는 경우, 법이 요구하는 대로 즉시 시정 조치를 취하고 사용자와 관할 당국에 통지합니다."
        }
      ]
    },
    {
      "id": "rights",
      "title": "10. 사용자의 권리",
      "blocks": [
        {
          "type": "p",
          "text": "개인정보보호법에 따라 귀하는 당사가 처리하는 개인정보에 대해 다음과 같은 권리를 가집니다:"
        },
        {
          "type": "ul",
          "items": [
            "**열람 및 복사** — 귀하에 대해 당사가 보유한 정보를 확인하고 사본을 받을 수 있습니다;",
            "**정정 및 보완** — 부정확하거나 불완전한 정보의 수정을 요청할 수 있으며, 계정 정보는 직접 수정할 수도 있습니다;",
            "**삭제** — 처리 목적이 달성된 경우, 동의를 철회한 경우, 또는 당사가 불법적으로 처리한 경우 삭제를 요청할 수 있습니다;",
            "**이동(포터빌리티)** — 국가 사이버공간 관리 기관이 정한 요건을 충족하는 경우, 귀하가 지정한 다른 처리자에게 정보 이전을 요청할 수 있습니다;",
            "**동의 철회** — 텔레메트리 및 국경 간 이전 등 동의를 기반으로 처리되는 사항에 대해 동의를 철회할 수 있습니다;",
            "**처리 제한 또는 거부** — 특정 처리의 제한 또는 거부를 요청할 수 있습니다;",
            "**설명 요청** — 본 정책 및 당사의 처리 규칙에 대한 설명을 요청할 수 있습니다;",
            "**계정 탈퇴** — 언제든지 계정을 탈퇴할 수 있으며, 탈퇴 후 귀하의 정보는 제8조에 명시된 대로 처리됩니다."
          ]
        },
        {
          "type": "p",
          "text": "권리 행사 방법: 계정 정보 수정 및 계정 키 철회는 계정에서 직접 하실 수 있으며, 그 외의 사항은 계정과 요청 사항을 명시하여 에 문의해 주시기 바랍니다. 신원 확인을 먼저 요청드릴 수 있습니다. 당사는 15 영업일 이내에 회신하며, 복잡한 요청으로 더 오랜 시간이 필요한 경우 그 사유를 설명드립니다."
        },
        {
          "type": "p",
          "text": "이용자가 사망한 경우, 그 근칭자는 이용자가 생전에 달리 정하지 않은 한 해당 이용자의 관련 개인정보에 대해 열람, 복사, 정정 및 삭제 권리를 행사할 수 있습니다."
        }
      ]
    },
    {
      "id": "minors",
      "title": "11. 미성년자",
      "blocks": [
        {
          "type": "p",
          "text": "본 서비스는 전문가를 대상으로 하며, 14세 미만 어린이에게 제공되지 않습니다. 당사는 어린이의 개인정보를 고의로 수집하지 않습니다. 보호자의 사전 동의 없이 수집된 사실을 발견하면 즉시 삭제하겠습니다."
        },
        {
          "type": "p",
          "text": "이러한 사실을 인지한 보호자는 로 당사에 연락하실 수 있습니다."
        }
      ]
    },
    {
      "id": "changes",
      "title": "12. 정책 변경",
      "blocks": [
        {
          "type": "p",
          "text": "당사는 본 정책을 개정할 수 있습니다. 정보의 목적, 방법 또는 범주에 대한 중대한 변경의 경우, 시행 전에 웹사이트 공지 또는 이메일로 안내하며, 법에서 요구하는 경우 새로운 동의를 받겠습니다."
        },
        {
          "type": "p",
          "text": "이전 버전은 이메일로 요청 시 제공됩니다."
        }
      ]
    },
    {
      "id": "contact",
      "title": "13. 문의 및 불만",
      "blocks": [
        {
          "type": "p",
          "text": "본 정책 또는 개인정보 처리에 대한 질문, 의견, 불만이 있으시면 로 문의해 주시기 바랍니다. 당사는 15 영업일 이내에 회신합니다."
        },
        {
          "type": "p",
          "text": "당사의 처리로 권리가 침해되었다고 판단되고 당사의 회신으로 문제가 해결되지 않는 경우, 관할 사이버공간, 통신, 공안 또는 시장감독 기관에 불만을 제기하거나 서비스 이용약관에 명시된 분쟁 해결 절차를 따르실 수 있습니다."
        }
      ]
    }
  ]
});
export default legalDoc;
