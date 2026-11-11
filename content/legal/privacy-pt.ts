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
  "eyebrow": "Legal",
  "title": "Política de Privacidade",
  "effectiveLabel": "Effective {__T_LEGAL_EFFECTIVE_DATE__}",
  "intro": "This policy explains how  () collects, uses, stores and discloses personal information when you use the AI WorkDeck website and desktop application, and what rights you have. We suggest reading it in full; if you only want the gist, the summary below covers it.",
  "highlightsTitle": "The short version",
  "highlights": [
    "**The Office/WPS add-in uses cloud processing.** The current document, necessary conversation history and references you select reach our hosted backend, then Alibaba Cloud Model Studio and the inference provider serving your selected model. Raw document bodies use transient memory; user messages, AI replies and reasoning remain until you delete the conversation. See clauses 6 and 8.",
    "Documentos, projetos e histórico de trabalho do desktop ficam no seu dispositivo. Ao usar a IA da plataforma, textos, trechos de arquivos, imagens e contexto necessários passam pelo gateway chinês para o Model Studio. Armazenamento local não significa que as solicitações não passem por nossos servidores.",
    "**Six platform-sourced services do pass through our servers** (text recognition, web search, company registry data, securities and financial data, statute and case law search, meeting transcription): we buy from the vendor on your behalf so you need no key of your own, and the content each call requires is relayed through us to that vendor. **All six vendors are inside mainland China, so this tier involves no cross-border transfer.** Only meeting audio is held briefly on our side, and it is deleted once transcription finishes. Any of them can be switched to your own key or turned off. See clauses 2, 6, 7 and 8.",
    "**The site sets exactly one cookie** (`awd_session`, to keep you signed in). There is no third-party analytics, advertising or tracking code, and web fonts are self-hosted, so no request goes to a third party.",
    "**Desktop telemetry is anonymous**: a random install identifier, the app version and whitelisted event names. No IP address is stored, nothing is linked to your account, no document content is included, and it can be switched off.",
    "O acesso por Pequim não significa que toda inferência ocorra na China continental. O local segue a implantação do modelo escolhido; modelos China Elastic Zone podem processar dados fora da China continental. O acesso ao site a partir do exterior continua usando um nó de cache em Singapura.",
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
              "Credenciais de acesso restritas, autorização da conta, modelos, uso e registros de liquidação",
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
            "As conversas do desktop passam pelo gateway chinês quando a IA da plataforma é usada; os registros de cobrança não armazenam seu conteúdo. A retenção e exclusão das conversas dos suplementos seguem as cláusulas 6 e 8.",
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
          "text": "O site define um único cookie:"
        },
        {
          "type": "table",
          "head": [
            "Nome",
            "Finalidade",
            "Atributos",
            "Duração"
          ],
          "rows": [
            [
              "awd_session",
              "Mantém você conectado",
              "HttpOnly, SameSite=Lax",
              "30 dias"
            ]
          ]
        },
        {
          "type": "p",
          "text": "Este cookie é estritamente necessário para iniciar sessão e não pode ser desativado se você deseja permanecer conectado. Não usamos cookies de análise, publicidade ou rastreamento entre sites. As fontes web são incorporadas ao site no momento da compilação, de modo que o carregamento de uma página não gera nenhuma solicitação de fonte a terceiros."
        },
        {
          "type": "p",
          "text": "Você pode excluir o cookie no seu navegador; o efeito é o mesmo de encerrar a sessão."
        }
      ]
    },
    {
      "id": "use",
      "title": "5. Como usamos as informações",
      "blocks": [
        {
          "type": "ul",
          "items": [
            "Operação do serviço: identificação de contas, verificação de direitos de acesso, liquidação de cobranças e entrega do que você comprou;",
            "Segurança: detecção de inícios de sessão anômalos e abusos, limitação de taxa, mitigação de ataques e diagnóstico de falhas;",
            "Melhoria do produto: estatísticas agregadas de telemetria anônima mostrando quais recursos são utilizados e em que pontos as pessoas desistem;",
            "Obrigações legais: manutenção de registros exigidos por normas fiscais, contábeis e de segurança cibernética;",
            "Comunicação com você: alterações no serviço, incidentes de segurança e mudanças nos termos."
          ]
        },
        {
          "type": "p",
          "text": "Não usamos as informações para nenhuma outra finalidade. Se algum dia for necessário, pediremos seu consentimento separadamente. Não realizamos tomada de decisão automatizada e não usamos informações pessoais para mensagens direcionadas ou precificação diferenciada."
        }
      ]
    },
    {
      "id": "third-parties",
      "title": "6. Divulgação e terceiros",
      "blocks": [
        {
          "type": "callout",
          "text": "A IA da plataforma do site chinês (conversas no desktop, suplementos Office/WPS e criação de Skills com IA) passa pelo servidor chinês do AI WorkDeck até o ponto de acesso de Pequim do Alibaba Cloud Model Studio e o fornecedor do modelo. O registro de cobrança do gateway contém conta, modelo, uso e custos, não o conteúdo encaminhado. As regras existentes de retenção das conversas dos suplementos e dos Skills permanecem inalteradas. O Model Studio e os fornecedores de inferência aplicam suas próprias políticas de retenção, treinamento e localização. As regras do gateway não garantem retenção zero por terceiros. Implantação dos modelos: https://help.aliyun.com/zh/model-studio/beijing-access-information"
        },
        {
          "type": "p",
          "text": "Não fornecemos suas informações pessoais a terceiros, exceto nos seguintes casos:"
        },
        {
          "type": "table",
          "head": [
            "Destinatário",
            "Informações",
            "Finalidade",
            "Localização"
          ],
          "rows": [
            [
              "Tenpay Payment Technology Co., Ltd. (WeChat Pay)",
              "Número do pedido, valor, descrição do item",
              "Recebimento de pagamentos, reembolsos, conciliação",
              "China Continental"
            ],
            [
              "Alibaba Cloud Model Studio e os fornecedores efetivos dos modelos",
              "Pergunta atual, histórico necessário, trechos de arquivos e imagens",
              "Inferência, medição de uso e liquidação",
              "Acesso por Pequim; processamento conforme a implantação do modelo, possivelmente fora da China continental"
            ],
            [
              "GitHub, Inc.",
              "Dados de requisições de rede ao baixar instaladores",
              "Hospedagem de instaladores e código-fonte aberto",
              "Estados Unidos"
            ],
            [
              "Alibaba Cloud Computing Ltd.",
              "Dados técnicos em nível de servidor e rede",
              "Hospedagem e aceleração de rede",
              "China Continental + nó em Singapura"
            ],
            [
              "Alibaba Cloud (Tingwu)",
              "O áudio da sua reunião e sua transcrição",
              "Transcrição de fala e separação de falantes",
              "China Continental"
            ],
            [
              "Alibaba Cloud (OCR)",
              "A imagem que você envia para reconhecimento",
              "Reconhecimento de texto em imagem",
              "China Continental"
            ],
            [
              "Bocha (busca na web)",
              "Sua consulta de busca",
              "Retorna resultados de busca na web",
              "China Continental"
            ],
            [
              "Qichacha",
              "O nome da empresa ou o código de crédito social unificado que você pesquisa",
              "Retorna dados de registro de empresas",
              "China Continental"
            ],
            [
              "Tushare",
              "O código de negociação (ticker) e os campos que você consulta",
              "Retorna dados de valores mobiliários e financeiros",
              "China Continental"
            ],
            [
              "PKULaw",
              "Seu termo de busca de legislação e jurisprudência",
              "Retorna resultados de legislação e jurisprudência",
              "China Continental"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**Como fluem os seis serviços fornecidos pela plataforma.** As últimas seis linhas correspondem aos fornecedores por trás do nível \"fornecido pela plataforma\": nós compramos deles em seu nome, portanto você não precisa de uma chave própria, e o conteúdo exigido por cada chamada é repassado ao fornecedor por meio de nossos servidores e debitado do seu saldo. **Todos os seis estão dentro da China continental**, portanto esse nível não envolve transferência transfronteiriça. Não registramos, armazenamos nem usamos para treinamento o que repassamos; a única exceção é o áudio de reuniões, que fica temporariamente em nosso armazenamento de objetos para que o serviço de transcrição possa lê-lo e é excluído assim que a transcrição termina (ver cláusula 8). Qualquer um deles pode ser trocado, em Configurações → Serviços da Plataforma no aplicativo de desktop, por uma chave própria (o aplicativo então fala diretamente com o fornecedor, sem passar por nós) ou desativado completamente."
        },
        {
          "type": "callout",
          "text": "A IA da plataforma do site chinês (conversas no desktop, suplementos Office/WPS e criação de Skills com IA) passa pelo servidor chinês do AI WorkDeck até o ponto de acesso de Pequim do Alibaba Cloud Model Studio e o fornecedor do modelo. O registro de cobrança do gateway contém conta, modelo, uso e custos, não o conteúdo encaminhado. As regras existentes de retenção das conversas dos suplementos e dos Skills permanecem inalteradas. O acesso por Pequim não significa que toda inferência ocorra na China continental. O local segue a implantação do modelo escolhido; modelos China Elastic Zone podem processar dados fora da China continental. O acesso ao site a partir do exterior continua usando um nó de cache em Singapura."
        },
        {
          "type": "p",
          "text": "Também poderemos divulgar informações quando a lei exigir: em cooperação com autoridades judiciais ou administrativas, quando necessário para proteger o interesse público ou interesses vitais de alguém, ou quando você próprio tiver tornado a informação pública. Em caso de fusão, cisão ou transferência de ativos, transferiremos as informações pessoais junto com o negócio, informando-lhe previamente o nome e os dados de contato do destinatário; o destinatário deverá continuar a honrar esta política ou obter novamente o seu consentimento."
        }
      ]
    },
    {
      "id": "cross-border",
      "title": "7. Transferências fora da China continental",
      "blocks": [
        {
          "type": "p",
          "text": "Dada a arquitetura descrita acima, suas informações são transferidas para fora da China continental nos seguintes casos:"
        },
        {
          "type": "ul",
          "items": [
            "O acesso por Pequim não significa que toda inferência ocorra na China continental. O local segue a implantação do modelo escolhido; modelos China Elastic Zone podem processar dados fora da China continental. O acesso ao site a partir do exterior continua usando um nó de cache em Singapura.",
            "O download do instalador do desktop envia sua solicitação para a GitHub, Inc., nos Estados Unidos;",
            "Visitantes fora da China continental são atendidos por um nó de cache em Cingapura, que busca do servidor de origem em Pequim."
          ]
        },
        {
          "type": "callout",
          "text": "**Os seis serviços fornecidos pela plataforma não saem do país.** Os fornecedores por trás do reconhecimento de texto, busca na web, dados de registro de empresas, dados de valores mobiliários e financeiros, busca de legislação e jurisprudência e transcrição de reuniões estão todos dentro da China continental (ver cláusula 6). O conteúdo desse nível nunca sai do território chinês, e nenhum consentimento transfronteiriço separado é exigido para ele. Os três casos listados acima constituem o conjunto completo de transferências."
        },
        {
          "type": "callout",
          "text": "Sua própria chave usa a rota e as políticas do fornecedor configurado; modelos totalmente locais processam conteúdo no dispositivo. Consulte a implantação do modelo para saber os locais de processamento. Os instaladores continuam sendo distribuídos pelo GitHub."
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
