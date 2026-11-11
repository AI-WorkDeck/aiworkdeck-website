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
  "eyebrow": "Juridisch",
  "title": "Privacybeleid",
  "effectiveLabel": "Van kracht per {__T_LEGAL_EFFECTIVE_DATE__}",
  "intro": "Dit beleid legt uit hoe  () persoonlijke informatie verzamelt, gebruikt, opslaat en openbaarmaakt wanneer u de AI WorkDeck-website en desktoptoepassing gebruikt, en welke rechten u heeft. Wij raden aan het volledig te lezen; als u alleen de kern wilt weten, dekt de samenvatting hieronder dat af.",
  "highlightsTitle": "De korte versie",
  "highlights": [
    "**De Office/WPS-add-in maakt gebruik van cloudverwerking.** Het huidige document, de nodige gespreksgeschiedenis en de referenties die u selecteert, bereiken onze gehoste backend, en daarna Alibaba Cloud Model Studio en de inferentieprovider die uw geselecteerde model verzorgt. De ruwe documentinhoud maakt gebruik van tijdelijk geheugen; gebruikersberichten, AI-antwoorden en redeneringen blijven bewaard totdat u het gesprek verwijdert. Zie clausules 6 en 8.",
    "Desktopdocumenten, projecten en werkgeschiedenis blijven op uw apparaat. Bij gebruik van platform-AI gaan noodzakelijke teksten, bestandsfragmenten, afbeeldingen en gesprekscontext via onze Chinese gateway naar Model Studio. Lokale opslag betekent niet dat verzoeken onze servers omzeilen.",
    "**Zes door het platform geleverde diensten passeren onze servers** (tekstherkenning, webzoeken, bedrijfsregistergegevens, effecten- en financiële gegevens, zoekopdrachten naar wet- en rechtspraak, vergadertranscriptie): wij kopen namens u bij de leverancier in, zodat u geen eigen sleutel nodig heeft, en de inhoud die elke aanroep vereist, wordt via ons naar die leverancier doorgestuurd. **Alle zes leveranciers bevinden zich op het Chinese vasteland, dus deze categorie omvat geen grensoverschrijde overdracht.** Alleen vergaderaudio wordt kort aan onze kant bewaard en wordt verwijderd zodra de transcriptie is voltooid. Elk van deze diensten kan worden omgeschakeld naar uw eigen sleutel of worden uitgeschakeld. Zie clausules 2, 6, 7 en 8.",
    "**De website plaatst precies één cookie** (`awd_session`, om u ingelogd te houden). Er is geen analytische code, advertentiecode of trackingcode van derden, en webfonts worden zelf gehost, zodat er geen verzoek naar een derde partij gaat.",
    "**Desktop-telemetrie is anoniem**: een willekeurige installatie-identificatie, de app-versie en namen van toegestane gebeurtenissen. Er wordt geen IP-adres opgeslagen, niets wordt gekoppeld aan uw account, er is geen documentinhoud inbegrepen, en het kan worden uitgeschakeld.",
    "Toegang via Peking betekent niet dat alle inferentie in het Chinese vasteland plaatsvindt. De implementatiegegevens van het gekozen model zijn bepalend; China Elastic Zone-modellen kunnen gegevens buiten het Chinese vasteland verwerken. Buitenlandse websitebezoeken gebruiken nog steeds een cacheknooppunt in Singapore.",
    "**Om uw rechten uit te oefenen** (inzage, correctie, verwijdering, accountsluiting, intrekking van toestemming), schrijft u naar . Wij reageren binnen vijftien werkdagen."
  ],
  "tocTitle": "Inhoud",
  "sections": [
    {
      "id": "controller",
      "title": "1. Wie wij zijn",
      "blocks": [
        {
          "type": "p",
          "text": "Verwerker van persoonlijke informatie:  (), unified social credit code ."
        },
        {
          "type": "p",
          "text": "Voor alles wat betreft de bescherming van persoonlijke informatie, neemt u contact op met . Hetzelfde adres bereikt de persoon die verantwoordelijk is voor de bescherming van persoonlijke informatie."
        },
        {
          "type": "p",
          "text": "Dit beleid heeft betrekking op de AI WorkDeck-website, de desktoptoepassing, Office-add-ins en gerelateerde diensten. Het bestaat in het Chinees en Engels; bij discrepantie is de Chinese versie leidend."
        }
      ]
    },
    {
      "id": "collect",
      "title": "2. Wat wij verzamelen",
      "blocks": [
        {
          "type": "p",
          "text": "Wij verzamelen op basis van \"niet meer dan nodig\". De tabel uiteenzet wat wij verzamelen, waarom, en op welke grondslag."
        },
        {
          "type": "table",
          "head": [
            "Context",
            "Informatie",
            "Doel",
            "Grondslag"
          ],
          "rows": [
            [
              "Registratie",
              "Gebruikersnaam, e-mailadres, wachtwoord, weergavenaam, bio (optioneel)",
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
              "Beperkte toegangsgegevens, accountmachtigingen, modellen, gebruik en afrekengegevens",
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
            "Desktopgesprekken gaan bij gebruik van platform-AI via de Chinese gateway; facturatielogboeken en registers slaan de inhoud niet op. Voor bewaren en verwijderen van invoegtoepassingsgesprekken gelden artikelen 6 en 8.",
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
              "30 days"
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
          "text": "De platform-AI van de Chinese site (desktopchat, Office/WPS-invoegtoepassingen en AI-ondersteunde Skill-creatie) gaat via de Chinese server van AI WorkDeck naar het toegangspunt in Peking van Alibaba Cloud Model Studio en de modelaanbieder. Het facturatieregister van de gateway bevat account, model, gebruik en kosten, niet de doorgestuurde inhoud. Bestaande bewaartermijnen voor invoegtoepassingsgesprekken en Skills blijven ongewijzigd. Model Studio en inferentieaanbieders hanteren hun eigen regels voor bewaren, training en verwerkingslocaties. Onze gatewayregels garanderen geen nulretentie bij derden. Modelimplementatie: https://help.aliyun.com/zh/model-studio/beijing-access-information"
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
              "Mainland China"
            ],
            [
              "Alibaba Cloud Model Studio en de daadwerkelijke modelaanbieders",
              "Huidige vraag, noodzakelijke gespreksgeschiedenis, bestandsfragmenten en afbeeldingen",
              "Modelinferentie, gebruiksmeting en afrekening",
              "Toegang via Peking; verwerking volgens modelimplementatie, mogelijk buiten het Chinese vasteland"
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
          "text": "De platform-AI van de Chinese site (desktopchat, Office/WPS-invoegtoepassingen en AI-ondersteunde Skill-creatie) gaat via de Chinese server van AI WorkDeck naar het toegangspunt in Peking van Alibaba Cloud Model Studio en de modelaanbieder. Het facturatieregister van de gateway bevat account, model, gebruik en kosten, niet de doorgestuurde inhoud. Bestaande bewaartermijnen voor invoegtoepassingsgesprekken en Skills blijven ongewijzigd. Toegang via Peking betekent niet dat alle inferentie in het Chinese vasteland plaatsvindt. De implementatiegegevens van het gekozen model zijn bepalend; China Elastic Zone-modellen kunnen gegevens buiten het Chinese vasteland verwerken. Buitenlandse websitebezoeken gebruiken nog steeds een cacheknooppunt in Singapore."
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
            "Toegang via Peking betekent niet dat alle inferentie in het Chinese vasteland plaatsvindt. De implementatiegegevens van het gekozen model zijn bepalend; China Elastic Zone-modellen kunnen gegevens buiten het Chinese vasteland verwerken. Buitenlandse websitebezoeken gebruiken nog steeds een cacheknooppunt in Singapore.",
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
          "text": "Uw eigen sleutel gebruikt de route en het beleid van de ingestelde aanbieder; volledig lokale modellen verwerken inhoud op uw apparaat. Raadpleeg de implementatiegegevens voor verwerkingslocaties. Installatiebestanden worden nog steeds via GitHub verspreid."
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
