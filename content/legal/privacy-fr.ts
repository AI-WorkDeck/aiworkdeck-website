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
  "eyebrow": "Mentions légales",
  "title": "Politique de confidentialité",
  "effectiveLabel": "En vigueur à compter du {__T_LEGAL_EFFECTIVE_DATE__}",
  "intro": "La présente politique explique comment  () collecte, utilise, stocke et divulgue les informations personnelles lorsque vous utilisez le site web et l'application de bureau AI WorkDeck, ainsi que les droits dont vous disposez. Nous vous conseillons de la lire dans son intégralité ; si vous ne souhaitez que l'essentiel, le résumé ci-dessous en donne un aperçu.",
  "highlightsTitle": "L'essentiel en bref",
  "highlights": [
    "**Le complément Office/WPS utilise un traitement dans le cloud.** Le document en cours, l'historique de conversation nécessaire et les références que vous sélectionnez sont transmis à notre backend hébergé, puis à Alibaba Cloud Model Studio et au fournisseur d'inférence qui dessert le modèle que vous avez choisi. Les corps de documents bruts utilisent une mémoire transitoire ; les messages des utilisateurs, les réponses de l'IA et les raisonnements sont conservés jusqu'à ce que vous supprimiez la conversation. Voir les clauses 6 et 8.",
    "Les documents, projets et historiques de travail de bureau restent sur votre appareil. Lors d’un appel à l’IA de la plateforme, les textes, extraits, images et contextes nécessaires passent par notre passerelle chinoise vers Model Studio. Le stockage local ne signifie pas que les requêtes évitent nos serveurs.",
    "**Six services provenant de plateformes tierces transitent par nos serveurs** (reconnaissance de texte, recherche web, données du registre des entreprises, données boursières et financières, recherche de textes de loi et de jurisprudence, transcription de réunions) : nous achetons ces services au fournisseur en votre nom afin que vous n'ayez pas besoin de votre propre clé, et le contenu requis par chaque appel est relayé par nos soins à ce fournisseur. **Les six fournisseurs sont situés en Chine continentale ; ce niveau n'implique donc aucun transfert transfrontalier.** Seul l'audio des réunions est conservé brièvement de notre côté, et il est supprimé une fois la transcription terminée. Chacun de ces services peut être basculé sur votre propre clé ou désactivé. Voir les clauses 2, 6, 7 et 8.",
    "**Le site dépose exactement un cookie** (`awd_session`, pour maintenir votre session active). Il n'y a aucun code tiers d'analyse, de publicité ou de pistage, et les polices web sont auto-hébergées : aucune requête n'est envoyée à un tiers.",
    "**La télémétrie de l'application de bureau est anonyme :** un identifiant d'installation aléatoire, la version de l'application et des noms d'événements sur liste blanche. Aucune adresse IP n'est stockée, rien n'est relié à votre compte, aucun contenu de document n'est inclus, et cette télémétrie peut être désactivée.",
    "L’accès par Pékin ne signifie pas que toute inférence a lieu en Chine continentale. Le lieu dépend du déploiement du modèle choisi ; les modèles China Elastic Zone peuvent traiter les données hors de Chine continentale. Les accès au site depuis l’étranger utilisent toujours un cache à Singapour.",
    "**Pour exercer vos droits** (accès, rectification, suppression, clôture du compte, retrait du consentement), écrivez à . Nous répondons sous quinze jours ouvrés."
  ],
  "tocTitle": "Sommaire",
  "sections": [
    {
      "id": "controller",
      "title": "1. Qui sommes-nous",
      "blocks": [
        {
          "type": "p",
          "text": "Responsable du traitement des informations personnelles :  (), code d'identification sociale unifié ."
        },
        {
          "type": "p",
          "text": "Pour toute question relative à la protection des informations personnelles, contactez . La même adresse permet de joindre la personne responsable de la protection des informations personnelles."
        },
        {
          "type": "p",
          "text": "La présente politique couvre le site web AI WorkDeck, l'application de bureau, les compléments Office et les services associés. Elle existe en chinois et en anglais ; en cas de divergence, la version chinoise prévaut."
        }
      ]
    },
    {
      "id": "collect",
      "title": "2. Ce que nous collectons",
      "blocks": [
        {
          "type": "p",
          "text": "Nous collectons selon le principe du « strict nécessaire ». Le tableau précise ce que nous collectons, pourquoi, et sur quelle base."
        },
        {
          "type": "table",
          "head": [
            "Contexte",
            "Information",
            "Finalité",
            "Base"
          ],
          "rows": [
            [
              "Inscription",
              "Nom d'utilisateur, adresse e-mail, mot de passe, nom affiché, biographie (facultatif)",
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
              "Identifiants d’appel limités, autorisations du compte, modèles, utilisation et écritures de règlement",
              "Provision and meter your AI credit",
              "Nécessaire à l'exécution du contrat"
            ],
            [
              "Soumissions sur la Plaza",
              "La Skill ou le plugin que vous soumettez et votre identité d'auteur",
              "Examen, publication, distribution, règlement",
              "Nécessaire à l'exécution du contrat"
            ],
            [
              "Télémétrie de l'application de bureau",
              "Identifiant d'installation aléatoire (UUID), version de l'application, noms d'événements sur liste blanche, une clé de séquence de conversation, un petit ensemble d'attributs non sensibles",
              "Mesurer l'activité et l'utilisation des fonctionnalités, diagnostiquer les plantages",
              "Votre consentement (peut être désactivé)"
            ],
            [
              "Services externes provenant de la plateforme",
              "Le contenu requis par chaque appel (l'image à reconnaître, une requête de recherche, un nom d'entreprise, un ticker, un terme de recherche, l'audio d'une réunion), ainsi qu'une entrée de registre ne contenant aucun contenu (service, quantité, montant, horodatage)",
              "Appeler le fournisseur en votre nom et mesurer l'utilisation",
              "Nécessaire à l'exécution du contrat (votre appel constitue la demande)"
            ],
            [
              "Journaux du serveur",
              "Horodatage, chemin de la requête, code d'état, adresse IP",
              "Sécurité, dépannage, atténuation des attaques",
              "Maintenance de sécurité raisonnablement nécessaire + obligation légale"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**À propos de la télémétrie :** l'adresse IP d'une requête de télémétrie est utilisée en mémoire uniquement pour la limitation de débit et n'est **jamais écrite dans la base de données**. Rien n'enregistre de lien entre l'identifiant d'installation aléatoire et votre compte, nous ne pouvons donc pas retracer la télémétrie jusqu'à une personne."
        }
      ]
    },
    {
      "id": "not-collect",
      "title": "3. Ce que nous ne collectons pas",
      "blocks": [
        {
          "type": "p",
          "text": "Les déclarations ci-dessous concernant les documents et les conversations AI portent sur l'utilisation locale de l'application de bureau. Le module complémentaire Office/WPS traite les documents et les conversations via notre backend hébergé, comme expliqué dans les clauses 6 et 8. Hormis cela, nous ne collectons pas activement les éléments suivants :"
        },
        {
          "type": "ul",
          "items": [
            "Vos documents, dossiers ou fichiers de projet et leur contenu — l'application de bureau est d'abord locale et ceux-ci restent sur votre appareil. **Lorsque vous confiez un contenu spécifique à un service externe spécifique** (une image pour la reconnaissance de texte, un enregistrement pour la transcription) : nous transmettons alors au fournisseur la partie requise par l'appel. À l'exception de l'audio de réunion conservé brièvement, nous n'en retenons rien (voir les clauses 6 et 8) ;",
            "Les conversations de bureau transitent par la passerelle chinoise lors d’un appel à l’IA de la plateforme ; ses journaux et registres de facturation ne conservent pas leur contenu. La conservation et la suppression des conversations des compléments relèvent des clauses 6 et 8.",
            "Les informations personnelles sensibles telles que les numéros de téléphone, les numéros d'identification, les images faciales ou les empreintes digitales ;",
            "La localisation, les contacts, les journaux d'appels, les messages ou les bibliothèques photo ;",
            "Votre navigation en dehors de ce service — nous n'utilisons aucun SDK tiers d'analyse ou de publicité."
          ]
        },
        {
          "type": "p",
          "text": "Nous n'utilisons aucun de vos contenus pour entraîner des modèles et nous ne vendons pas d'informations personnelles."
        }
      ]
    },
    {
      "id": "cookies",
      "title": "4. Cookies",
      "blocks": [
        {
          "type": "p",
          "text": "Le site dépose un seul cookie :"
        },
        {
          "type": "table",
          "head": [
            "Nom",
            "Finalité",
            "Attributs",
            "Durée de vie"
          ],
          "rows": [
            [
              "awd_session",
              "Vous maintient connecté",
              "HttpOnly, SameSite=Lax",
              "30 jours"
            ]
          ]
        },
        {
          "type": "p",
          "text": "Ce cookie est strictement nécessaire à la connexion et ne peut pas être désactivé si vous souhaitez rester connecté. Nous n'utilisons aucun cookie d'analyse, de publicité ou de suivi intersites. Les polices web sont intégrées au site au moment de la compilation, de sorte que le chargement d'une page n'envoie aucune requête de police à des tiers."
        },
        {
          "type": "p",
          "text": "Vous pouvez supprimer le cookie dans votre navigateur ; l'effet est le même qu'une déconnexion."
        }
      ]
    },
    {
      "id": "use",
      "title": "5. Comment nous l'utilisons",
      "blocks": [
        {
          "type": "ul",
          "items": [
            "Exploitation du service : identification des comptes, vérification des droits, règlement des frais, livraison de ce que vous avez acheté ;",
            "Sécurité : détection des connexions anormales et des abus, limitation du débit des requêtes, atténuation des attaques, diagnostic des pannes ;",
            "Amélioration du produit : statistiques agrégées issues de la télémétrie anonyme indiquant quelles fonctionnalités sont utilisées et où les utilisateurs abandonnent ;",
            "Obligations légales : conservation des registres exigés par les règles fiscales, comptables et de cybersécurité ;",
            "Communication avec vous : changements de service, incidents de sécurité, modifications des conditions."
          ]
        },
        {
          "type": "p",
          "text": "Nous n'utilisons pas les informations à d'autres fins. Si nous avions un jour besoin de le faire, nous vous demanderions votre consentement séparément. Nous ne pratiquons pas de prise de décision automatisée et n'utilisons pas les informations personnelles à des fins de messagerie ciblée ou de tarification différenciée."
        }
      ]
    },
    {
      "id": "third-parties",
      "title": "6. Divulgation et tiers",
      "blocks": [
        {
          "type": "callout",
          "text": "L’IA de la plateforme du site chinois (chat de bureau, compléments Office/WPS et rédaction de Skills assistée par IA) transite par le serveur chinois d’AI WorkDeck vers le point d’accès de Pékin d’Alibaba Cloud Model Studio, puis le fournisseur du modèle. Le registre de facturation de la passerelle contient le compte, le modèle, l’utilisation et les coûts, sans le contenu transmis. Les règles existantes de conservation des conversations des compléments et des Skills restent inchangées. Model Studio et les fournisseurs d’inférence appliquent leurs propres politiques de conservation, d’entraînement et de localisation. Les règles de notre passerelle ne garantissent pas une absence de conservation chez les tiers. Déploiement des modèles : https://help.aliyun.com/zh/model-studio/beijing-access-information"
        },
        {
          "type": "p",
          "text": "Nous ne communiquons pas vos informations personnelles à des tiers, sauf dans les cas suivants :"
        },
        {
          "type": "table",
          "head": [
            "Destinataire",
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
              "Alibaba Cloud Model Studio et les fournisseurs effectifs des modèles",
              "Question actuelle, historique nécessaire, extraits de fichiers et images",
              "Inférence, mesure de l’utilisation et règlement",
              "Accès par Pékin ; traitement selon le déploiement du modèle, éventuellement hors de Chine continentale"
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
          "text": "L’IA de la plateforme du site chinois (chat de bureau, compléments Office/WPS et rédaction de Skills assistée par IA) transite par le serveur chinois d’AI WorkDeck vers le point d’accès de Pékin d’Alibaba Cloud Model Studio, puis le fournisseur du modèle. Le registre de facturation de la passerelle contient le compte, le modèle, l’utilisation et les coûts, sans le contenu transmis. Les règles existantes de conservation des conversations des compléments et des Skills restent inchangées. L’accès par Pékin ne signifie pas que toute inférence a lieu en Chine continentale. Le lieu dépend du déploiement du modèle choisi ; les modèles China Elastic Zone peuvent traiter les données hors de Chine continentale. Les accès au site depuis l’étranger utilisent toujours un cache à Singapour."
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
            "L’accès par Pékin ne signifie pas que toute inférence a lieu en Chine continentale. Le lieu dépend du déploiement du modèle choisi ; les modèles China Elastic Zone peuvent traiter les données hors de Chine continentale. Les accès au site depuis l’étranger utilisent toujours un cache à Singapour.",
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
          "text": "Votre propre clé utilise le circuit et les politiques du fournisseur configuré ; les modèles entièrement locaux traitent les contenus sur votre appareil. Consultez les indications de déploiement du modèle pour les lieux de traitement. Les installateurs restent distribués par GitHub."
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
