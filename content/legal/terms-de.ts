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
  "title": "Allgemeinen Geschäftsbedingungen",
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
          "text": "The Service is designed for practitioners and organizations working in law, compliance and adjacent fields, and assumes users capable of exercising professional judgement. You confirm that you have full capacity for civil conduct, or that you are duly authorised to use the Service on behalf of your organization."
        },
        {
          "type": "p",
          "text": "We do not offer the Service to children under 14. If you are under 18, please read these Terms with your guardian and obtain their consent before using the Service."
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
          "text": "An account key (a string beginning with awdk_) connects the desktop application to your website account. We store only its hash, never the plaintext, so a lost key cannot be recovered — only replaced. Each account may hold at most three active keys."
        },
        {
          "type": "callout",
          "text": "**Whoever holds your account key is treated as you.** Guard it as you would a password; do not transfer, sell or publish it. If it leaks, revoke it in your account immediately. Everything done, and every charge incurred, with that key before revocation is your responsibility."
        },
        {
          "type": "p",
          "text": "We may suspend or close an account where reasonably necessary: breach of these Terms or of the law, use of the account to attack or abuse the Service, prolonged anomalous activity, or suspected fraud. Except in urgent cases we will notify you first."
        }
      ]
    },
    {
      "id": "ai",
      "title": "4. What the AI features are, and are not",
      "blocks": [
        {
          "type": "callout",
          "text": "**The Service is a tool, not a legal service.** We are not a law firm, we do not give legal advice, and no attorney-client, agency or other professional relationship arises from your use of the Service. Everything the AI produces — drafts, review comments, risk ratings, citation-check results — is working material for your consideration and is not a substitute for your own professional judgement."
        },
        {
          "type": "p",
          "text": "You accept the inherent limits of large language models: output is generated statistically rather than retrieved, and may contain statements contrary to fact, provisions that have been repealed or amended, and cases that do not exist or do not say what is claimed (commonly called \"hallucination\"). Features such as citation checking reduce but cannot eliminate this risk."
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
          "text": "Wir gewähren Ihnen eine nicht exklusive, nicht übertragbare, widerrufliche Lizenz zur Nutzung des Dienstes, vorbehaltlich dieser Nutzungsbedingungen, für Ihre eigenen Geschäftszwecke oder die Ihrer Organisation. Sie dürfen den Dienst nicht zurückentwickeln (es sei denn, eine Open-Source-Lizenz erlaubt dies), dessen Lizenzierungs- oder Abrechnungsmechanismen umgehen, ihn in großem Umfang automatisiert auslesen oder an Dritte weiterverkaufen, vermieten oder im Time-Sharing-Verfahren anbieten."
        }
      ]
    },
    {
      "id": "thirdparty",
      "title": "9. Dienste Dritter",
      "blocks": [
        {
          "type": "p",
          "text": "Der Dienst ist auf Dritte angewiesen: WeChat Pay für Zahlungen, OpenRouter für das Modell-Routing, GitHub für Installer und Quellcode-Hosting sowie Cloud-Anbieter für die Infrastruktur. Jeder dieser Anbieter unterliegt seinen eigenen Bedingungen."
        },
        {
          "type": "p",
          "text": "Wird ein Dienst eines Drittanbieters unterbrochen, geändert oder eingestellt, können die betroffenen Funktionen beeinträchtigt werden. Wir werden uns nach besten Kräften um Alternativen bemühen, haften jedoch nicht für das Verhalten dieser Drittanbieter."
        }
      ]
    },
    {
      "id": "availability",
      "title": "10. Verfügbarkeit und Änderungen",
      "blocks": [
        {
          "type": "p",
          "text": "Wir arbeiten daran, den Dienst stabil zu halten, versprechen jedoch weder einen unterbrechungsfreien noch einen fehlerfreien Betrieb. Wir haften nicht für Unterbrechungen, die durch Wartung, Upgrades, Ausfälle von Drittanbietern, Netzwerkangriffe oder höhere Gewalt entstehen. Geplante Wartungsarbeiten werden im Voraus angekündigt."
        },
        {
          "type": "p",
          "text": "Wir können Teile des Dienstes hinzufügen, ändern oder einstellen. Stellen wir etwas ein, für das Sie bereits bezahlt haben, erstatten wir Ihnen den nicht erbrachten anteiligen Betrag."
        },
        {
          "type": "p",
          "text": "Desktop-Updates werden als In-App-Patches oder als vollständige Installer bereitgestellt, wie auf der Seite mit den Versionshinweisen beschrieben. Sie können Updates ablehnen, ältere Versionen können jedoch an Online-Funktionen verlieren, wenn sich Schnittstellen ändern."
        }
      ]
    },
    {
      "id": "warranty",
      "title": "11. Keine Gewährleistungen",
      "blocks": [
        {
          "type": "p",
          "text": "Im maximal gesetzlich zulässigen Umfang wird der Dienst „wie besehen“ bereitgestellt. Wir übernehmen keine ausdrückliche oder stillschweigende Gewährleistung der Handelsüblichkeit, der Eignung für einen bestimmten Zweck oder des unterbrechungsfreien bzw. fehlerfreien Betriebs, noch eine Gewährleistung hinsichtlich der Genauigkeit, Vollständigkeit oder Eignung von KI-Ausgaben."
        },
        {
          "type": "p",
          "text": "Diese Klausel schließt keine Gewährleistungen aus, die gesetzlich nicht ausgeschlossen werden können."
        }
      ]
    },
    {
      "id": "liability",
      "title": "12. Haftungsbeschränkung",
      "blocks": [
        {
          "type": "callout",
          "text": "**Im maximal gesetzlich zulässigen Umfang ist unsere Gesamthaftung Ihnen gegenüber aus diesen Nutzungsbedingungen und in Verbindung mit dem Dienst auf die Gebühren begrenzt, die Sie uns tatsächlich für den Dienst in den zwölf Monaten vor Entstehen des Schadens gezahlt haben; sofern Sie noch nie gezahlt haben, liegt die Obergrenze bei CNY 100.**"
        },
        {
          "type": "p",
          "text": "Im maximal gesetzlich zulässigen Umfang haften wir nicht für entgangene Gewinne, Geschäftsunterbrechungen, Verlust des Firmenwerts, Datenverluste oder sonstige indirekte, zufällige oder Folgeschäden – selbst wenn uns die Möglichkeit solcher Schäden mitgeteilt wurde."
        },
        {
          "type": "callout",
          "text": "**Diese Klausel gilt nicht für, und wir haften gesetzlich für: unser vorsätzliches Fehlverhalten oder unsere grobe Fahrlässigkeit; Körperverletzungen; sowie jede sonstige Haftung, die gesetzlich nicht beschränkt oder ausgeschlossen werden kann.**"
        },
        {
          "type": "p",
          "text": "Sie verstehen, dass diese Klausel zusammen mit Klausel 4 einen Teil der Grundlage bildet, auf der der Dienst angeboten wird: Der Preis spiegelt die Tatsache wider, dass die Haftung auf diese Weise begrenzt ist."
        }
      ]
    },
    {
      "id": "indemnity",
      "title": "13. Ihre Freistellung",
      "blocks": [
        {
          "type": "p",
          "text": "Wenn wir aufgrund eines Verstoßes Ihrerseits gegen diese Nutzungsbedingungen oder das Gesetz, einer Verletzung von Rechten Dritter oder aufgrund von Inhalten, die Sie in den Dienst eingestellt haben, mit einer Forderung eines Dritten, einer Verwaltungsstrafe oder einem Verfahren konfrontiert werden, werden Sie uns für die tatsächlich entstandenen Verluste entschädigen, einschließlich angemessener Anwalts-, Prozess- und Schiedskosten."
        }
      ]
    },
    {
      "id": "termination",
      "title": "14. Kündigung",
      "blocks": [
        {
          "type": "p",
          "text": "Sie können die Nutzung des Dienstes jederzeit einstellen und Ihr Konto schließen. Wir werden dann Ihre personenbezogenen Daten gemäß der Datenschutzerklärung behandeln, und Ihre Kontoschlüssel verlieren sofort ihre Gültigkeit."
        },
        {
          "type": "p",
          "text": "Wir können den Dienst gegenüber Ihnen beenden, wenn Sie gegen diese Nutzungsbedingungen schwerwiegend verstoßen. Eine Kündigung berührt nicht bereits entstandene Rechte und Pflichten. Die Klauseln 5, 8, 11 bis 13 und 16 bleiben über die Kündigung hinaus wirksam."
        }
      ]
    },
    {
      "id": "changes",
      "title": "15. Änderungen dieser Nutzungsbedingungen",
      "blocks": [
        {
          "type": "p",
          "text": "Wir können diese Nutzungsbedingungen überarbeiten. Bei wesentlichen Änderungen, die Ihre Hauptrechte und -pflichten betreffen, werden wir Ihnen mindestens sieben Tage vor Inkrafttreten Ankündigung auf der Website oder per E-Mail geben."
        },
        {
          "type": "p",
          "text": "Die fortgesetzte Nutzung des Dienstes nach Inkrafttreten einer Überarbeitung bedeutet, dass Sie diese akzeptieren. Wenn Sie sie nicht akzeptieren, stellen Sie die Nutzung des Dienstes ein; Sie können Ihr Konto schließen; für bereits gekaufte, aber noch nicht erbrachte Leistungen können Sie eine anteilige Erstattung beantragen."
        }
      ]
    },
    {
      "id": "disputes",
      "title": "16. Anwendbares Recht und Streitigkeiten",
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
