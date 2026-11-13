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
  "title": "Terms of Service",
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
          "text": "Nella misura massima consentita dalla legge, il Servizio è fornito \"così com'è\". Non forniamo alcuna garanzia, espressa o implicita, di commerciabilità, idoneità a uno scopo particolare, funzionamento ininterrotto o privo di errori, né alcuna garanzia regarding l'accuratezza, la completezza o l'idoneità dell'output dell'AI."
        },
        {
          "type": "p",
          "text": "Questa clausola non esclude alcuna garanzia, condizione o impegno che non possa essere escluso per legge, inclusi i diritti statutari dei consumatori secondo la legge del proprio Paese."
        }
      ]
    },
    {
      "id": "liability",
      "title": "12. Limitazione di responsabilità",
      "blocks": [
        {
          "type": "callout",
          "text": "**Nella misura massima consentita dalla legge, la nostra responsabilità totale nei vostri confronti ai sensi dei presenti Termini e in connessione con il Servizio è limitata alle somme che ci avete effettivamente pagato per il Servizio nei dodici mesi precedenti il verificarsi del danno; se non avete mai effettuato pagamenti, il limite è di 100 USD.**"
        },
        {
          "type": "p",
          "text": "Nella misura massima consentita dalla legge, non siamo responsabili per perdita di profitti, interruzione di attività, perdita di avviamento, perdita di dati o qualsiasi altra perdita indiretta, incidentale o consequenziale — anche se eravamo stati avvisati della possibilità di tale perdita."
        },
        {
          "type": "callout",
          "text": "**Questa clausola non si applica e rimaniamo pienamente responsabili per: il nostro dolo; la nostra colpa grave; il decesso o lesioni personali causati dalla nostra negligenza; frode o falsa dichiarazione fraudolenta; e qualsiasi altra responsabilità che non possa essere limitata o esclusa dalla legge applicabile al vostro caso.**"
        },
        {
          "type": "p",
          "text": "Se siete un consumatore, nulla nei presenti Termini limita i diritti che la legge imperativa del vostro Paese di residenza vi riconosce, e questa clausola ha effetto solo nei limiti consentiti da tale legge."
        },
        {
          "type": "p",
          "text": "Comprendete che questa clausola e la clausola 4 costituiscono parte della base sulla quale il Servizio è offerto: il prezzo riflette il fatto che la responsabilità è limitata in questo modo."
        }
      ]
    },
    {
      "id": "indemnity",
      "title": "13. Vs. manleva",
      "blocks": [
        {
          "type": "p",
          "text": "Se siamo oggetto di una richiesta di terzi, una sanzione regolamentare o un procedimento a causa della vostra violazione dei presenti Termini o della legge, della violazione di diritti di terzi, o a causa di contenuti da voi inviati al Servizio, ci indennizzerete per le perdite effettivamente subite, inclusi i ragionevoli costi legali e arbitrali."
        },
        {
          "type": "p",
          "text": "Questa clausola si applica solo alle perdite effettivamente causate dalla vostra violazione, e solo nei limiti consentiti dalla legge applicabile al vostro caso. Se siete un consumatore, non si estende oltre la responsabilità che avreste comunque per legge."
        }
      ]
    },
    {
      "id": "termination",
      "title": "14. Risoluzione",
      "blocks": [
        {
          "type": "p",
          "text": "Potete interrompere l'utilizzo del Servizio e chiudere il vostro account in qualsiasi momento dalla pagina del vostro account. Tratteremo quindi le vostre informazioni personali come previsto dall'Informativa sulla Privacy, e le chiavi del vostro account cessano immediatamente di funzionare. I Crediti ricaricati non utilizzati possono essere rimborsati ai sensi della clausola 7."
        },
        {
          "type": "p",
          "text": "Potiamo risolvere il Servizio nei vostri confronti in caso di grave violazione dei presenti Termini. La risoluzione non pregiudica i diritti e gli obblighi già maturati. Le clausole 5, 8, da 11 a 13 e 16 sopravvivono alla risoluzione."
        }
      ]
    },
    {
      "id": "changes",
      "title": "15. Modifiche ai presenti Termini",
      "blocks": [
        {
          "type": "p",
          "text": "Potiamo revisionare i presenti Termini. Per revisioni sostanziali che incidono sui vostri principali diritti e obblighi, forniremo un preavviso di almeno 30 giorni prima che entrino in vigore, mediante annuncio sul sito web e tramite email all'indirizzo associato al vostro account."
        },
        {
          "type": "p",
          "text": "Il continuo utilizzo del Servizio dopo l'entrata in vigore di una revisione implica che la accettate. Se non la accettate, interrompete l'utilizzo del Servizio e chiudete il vostro account prima della data di efficacia; potrete quindi richiedere il rimborso dei Crediti ricaricati non utilizzati e un rimborso pro rata di quanto acquistato ma non ancora fruito."
        }
      ]
    },
    {
      "id": "disputes",
      "title": "16. Legge applicabile e controversie",
      "blocks": [
        {
          "type": "p",
          "text": "I presenti Termini — la loro formazione, validità, interpretazione, esecuzione e qualsiasi controversia relativa agli stessi — sono regolati da ."
        },
        {
          "type": "p",
          "text": "Prima di avviare procedimenti formali, vi preghiamo di scrivere a  descrivendo il problema. La maggior parte delle questioni si risolve in questo modo e ci impegniamo a rispondere in modo sostanziale entro 30 giorni."
        },
        {
          "type": "callout",
          "text": "**Qualsiasi controversia derivante dai presenti Termini o ad essi connessa sarà deferita e definitivamente risolta tramite arbitrato amministrato da  secondo le sue regole in vigore al momento della presentazione della richiesta di arbitrato. Il sede dell'arbitrato è Hong Kong, il collegio arbitrale è composto da un solo arbitro e la lingua è l'inglese. Il lodo è definitivo e vincolante per entrambe le parti.**"
        },
        {
          "type": "p",
          "text": "Si noti che l'accettazione di questa clausola implica che sia voi che noi rinunciamo al diritto di sottoporre le controversie coperte a un tribunale e rinunciamo al diritto di agire su base collettiva o rappresentativa."
        },
        {
          "type": "callout",
          "text": "**Se siete un consumatore, questa clausola arbitrale non vi priva di nulla di ciò che la legge imperativa del vostro Paese di residenza vi riconosce.** Ove tale legge vi dia diritto di adire i tribunali del vostro Paese o vi riconosca la protezione delle proprie norme sui consumatori, mantenete tale diritto e non lo contesteremo. In particolare, i consumatori nell'UE e nello SEE possono utilizzare i canali applicabili di risoluzione delle controversie online e stragiudiziali del proprio Paese."
        },
        {
          "type": "p",
          "text": "Nulla di quanto sopra impedisce a ciascuna parte di rivolgersi a un tribunale competente per misure cautelari o provvisorie."
        }
      ]
    },
    {
      "id": "misc",
      "title": "17. Disposizioni generali",
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
