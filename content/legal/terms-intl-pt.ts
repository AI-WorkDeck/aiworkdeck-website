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
  "eyebrow": "Legal",
  "title": "Termos de Serviço",
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
      "title": "1. Partes e escopo",
      "blocks": [
        {
          "type": "p",
          "text": "O Serviço é operado por , uma empresa constituída na Região Administrativa Especial de Hong Kong nos termos da Ordenança de Sociedades (Cap. 622),  . Sede registrada: . Contato: ."
        },
        {
          "type": "p",
          "text": "Estes Termos abrangem {__T_siteConfig_host__}, o aplicativo de desktop, os suplementos do Office, as praças de Skills e plugins, e outros serviços relacionados que possamos oferecer. As partes do aplicativo de desktop distribuídas sob uma licença de código aberto (consulte o arquivo LICENSE no repositório de código) são adicionalmente regidas por essa licença; em caso de conflito entre a licença e estes Termos, a licença prevalece para essas partes."
        },
        {
          "type": "callout",
          "text": "**{__T_siteConfig_host__} e {__T_siteConfig_otherSite_host__} são dois serviços separados.** Eles funcionam em infraestruturas separadas, com bancos de dados separados, e cada um é operado por uma entidade contratante diferente, sob legislação aplicável distinta. Contas, senhas, saldos de Credits, direitos adquiridos e chaves de conta **não são transferíveis entre eles**. Registrar-se aqui não lhe concede uma conta lá, e uma compra feita lá não pode ser resgatada aqui. Se você já tem uma conta no outro site e quer usar este, é necessário registrar-se novamente."
        },
        {
          "type": "callout",
          "text": "**O aplicativo de desktop é fornecido com interface em chinês.** Este site está disponível em inglês e chinês, mas o software em si — menus, caixas de diálogo, configurações, mensagens de erro — atualmente é apenas em chinês, e o mesmo vale para a maior parte da ajuda integrada. Os recursos de IA respondem no idioma em que você escreve, e os documentos que você edita não são afetados. Dizemos isso claramente aqui porque é o aspecto mais provável de frustrar quem compra com base em um site em inglês. Se isso for um problema para você, não compre."
        },
        {
          "type": "p",
          "text": "Estes Termos existem em inglês e chinês. Em caso de divergência, prevalece a versão em inglês."
        }
      ]
    },
    {
      "id": "eligibility",
      "title": "2. Quem pode usar o Serviço",
      "blocks": [
        {
          "type": "p",
          "text": "O Serviço é destinado a profissionais e organizações que atuam em direito, compliance e áreas afins, e pressupõe usuários capazes de exercer julgamento profissional. Você confirma que tem capacidade legal para aceitar estes Termos, ou que está devidamente autorizado a aceitá-los em nome de sua organização."
        },
        {
          "type": "p",
          "text": "O Serviço não é oferecido a menores de 18 anos. Não o fornecemos deliberadamente a crianças, nem coletamos informações delas."
        },
        {
          "type": "p",
          "text": "Você é responsável por verificar se seu uso do Serviço é lícito no local em que se encontra, incluindo qualquer controle de exportação, sanção ou restrição de exercício profissional aplicável a você. Podemos recusar ou descontinuar o serviço quando fornecê-lo violaria sanções ou regras de controle de exportação que nos vinculem."
        }
      ]
    },
    {
      "id": "account",
      "title": "3. Contas e chaves de conta",
      "blocks": [
        {
          "type": "p",
          "text": "O registro exige um nome de usuário, um endereço de e-mail e uma senha. Você deve fornecer informações precisas e manter suas credenciais seguras. Perdas causadas pela sua própria falha em fazê-lo são de sua responsabilidade."
        },
        {
          "type": "p",
          "text": "Uma chave de conta (uma sequência iniciada por awdk_) conecta o aplicativo de desktop e os suplementos do Office à sua conta do site. Armazenamos apenas seu hash, jamais o texto puro, portanto uma chave perdida não pode ser recuperada — apenas substituída. Cada conta pode ter no máximo dez chaves ativas."
        },
        {
          "type": "callout",
          "text": "**Quem detém sua chave de conta é tratado como você.** Guarde-a como guardaria uma senha; não a transfira, venda ou publique. Se ela vazar, revogue-a imediatamente em sua conta. Tudo o que for feito, e todo encargo incorrido, com essa chave antes da revogação é de sua responsabilidade."
        },
        {
          "type": "p",
          "text": "Podemos suspender ou encerrar uma conta quando razoavelmente necessário: violação destes Termos ou da lei, uso da conta para atacar ou abusar do Serviço, atividade anômala prolongada ou suspeita de fraude. Salvo em casos urgentes, notificaremos você primeiro e daremos a oportunidade de corrigir o problema. Se encerrarmos sua conta sem justa causa, reembolsamos os Credits recarregados não gastos."
        }
      ]
    },
    {
      "id": "ai",
      "title": "4. O que os recursos de IA são, e o que não são",
      "blocks": [
        {
          "type": "callout",
          "text": "**O Serviço é uma ferramenta, não um serviço jurídico.** Não somos um escritório de advocacia, não prestamos assessoria jurídica, e nenhuma relação advogado-cliente, de agência ou outra relação profissional decorre do seu uso do Serviço. Tudo o que a IA produz — minutas, comentários de revisão, classificações de risco, resultados de verificação de citações — é material de trabalho para sua consideração e não substitui seu próprio julgamento profissional."
        },
        {
          "type": "p",
          "text": "Você aceita os limites inerentes dos grandes modelos de linguagem: a saída é gerada estatisticamente, e não recuperada, e pode conter afirmações contrárias aos fatos, disposições revogadas ou alteradas, e casos que não existem ou não dizem o que se alega (comumente chamado de \"alucinação\"). Recursos como a verificação de citações reduzem, mas não eliminam, esse risco."
        },
        {
          "type": "p",
          "text": "Os modelos disponíveis pelo canal de IA da plataforma foram treinados predominantemente com materiais em inglês e chinês e refletem essa tendência. A saída sobre qualquer jurisdição específica — incluindo a sua — pode estar errada de formas não óbvias. Nada no Serviço é ajustado para o direito de qualquer país específico."
        },
        {
          "type": "p",
          "text": "Assim, você se compromete a verificar independentemente a saída da IA antes de usá-la em qualquer entrega externa, qualquer orientação a um cliente ou qualquer protocolo perante um tribunal ou autoridade administrativa. As consequências do uso de saídas não verificadas são suas."
        },
        {
          "type": "p",
          "text": "Você também deve observar as regras de conduta profissional e confidencialidade aplicáveis a você. Antes de enviar materiais de clientes ou de casos à IA, é sua responsabilidade decidir se o consentimento do cliente é necessário e se isso é permitido em sua jurisdição e em seu escritório."
        }
      ]
    },
    {
      "id": "content",
      "title": "5. Seu conteúdo e dados",
      "blocks": [
        {
          "type": "p",
          "text": "O aplicativo de desktop é local-first: seus documentos, projetos e histórico de trabalho permanecem, por padrão, no seu próprio dispositivo. Não os enviamos, armazenamos ou acessamos."
        },
        {
          "type": "p",
          "text": "As exceções são recursos que você mesmo aciona. Quando você usa o canal de IA da plataforma, o conteúdo que você escolhe enviar é processado por um provedor de modelos. Quando você usa plugins que exigem acesso à rede (síntese de voz, análise de documentos), o conteúdo relevante é enviado a esse provedor. Quando você nos envia feedback sobre o produto, o texto e eventuais anexos são carregados para nossa caixa de entrada de feedback. A Política de Privacidade detalha cada um desses fluxos e onde estão os servidores."
        },
        {
          "type": "p",
          "text": "Você garante que o que enviar ao Serviço não contém informações que você não tenha permissão para divulgar, material que infrinja propriedade intelectual ou segredos comerciais de terceiros, nem nada ilícito. Reivindicações, disputas ou penalidades decorrentes do seu conteúdo são de sua responsabilidade."
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
          "text": "Ninguém além de você e de nós tem o direito de exigir o cumprimento destes Termos."
        },
        {
          "type": "p",
          "text": "Para qualquer dúvida sobre estes Termos, escreva para ."
        }
      ]
    }
  ]
});
export default legalDoc;
