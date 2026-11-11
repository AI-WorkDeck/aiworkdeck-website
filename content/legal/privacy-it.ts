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
  "eyebrow": "Note legali",
  "title": "Informativa sulla privacy",
  "effectiveLabel": "Con effetto dal {__T_LEGAL_EFFECTIVE_DATE__}",
  "intro": "La presente informativa spiega come  () raccoglie, utilizza, archivia e divulghe le informazioni personali quando utilizzi il sito web e l'applicazione desktop di AI WorkDeck, e quali diritti ti spettano. Ti consigliamo di leggerla per intero; se desideri solo i punti essenziali, il riepilogo riportato di seguito li copre.",
  "highlightsTitle": "La versione breve",
  "highlights": [
    "**Il componente aggiuntivo per Office/WPS utilizza l'elaborazione nel cloud.** Il documento corrente, la cronologia delle conversazioni necessaria e i riferimenti selezionati arrivano al nostro backend ospitato, quindi a Alibaba Cloud Model Studio e al fornitore di inferenza che serve il modello da te selezionato. I corpi grezzi dei documenti utilizzano memoria temporanea; i messaggi degli utenti, le risposte dell'AI e il ragionamento restano memorizzati finché non elimini la conversazione. Vedi le clausole 6 e 8.",
    "Documenti, progetti e cronologia di lavoro desktop restano sul dispositivo. Quando si usa l’IA della piattaforma, testi, estratti, immagini e contesto necessari passano dal gateway cinese a Model Studio. La conservazione locale non significa che le richieste evitino i nostri server.",
    "**Sei servizi provenienti dalla piattaforma transitano per i nostri server** (riconoscimento del testo, ricerca sul web, dati del registro delle imprese, dati su titoli e finanza, ricerca di normative e giurisprudenza, trascrizione di riunioni): li acquistiamo dal fornitore per tuo conto, così non ti serve una chiave propria, e il contenuto richiesto da ciascuna chiamata viene inoltrato tramite noi a quel fornitore. **Tutti e sei i fornitori si trovano nella Cina continentale, quindi questa fascia non comporta trasferimenti transfrontalieri.** Solo l'audio delle riunioni viene conservato brevemente da noi ed eliminato al termine della trascrizione. Ciascuno di essi può essere impostato con la tua chiave o disattivato. Vedi le clausole 2, 6, 7 e 8.",
    "**Il sito imposta esattamente un cookie** (`awd_session`, per mantenerti connesso). Non è presente codice di terze parti per analisi, pubblicità o tracciamento, e i font web sono auto-ospitati, quindi nessuna richiesta viene inviata a terzi.",
    "**La telemetria desktop è anonima**: un identificativo di installazione casuale, la versione dell'app e i nomi degli eventi consentiti. Nessun indirizzo IP viene memorizzato, nulla viene collegato al tuo account, nessun contenuto di documenti è incluso e può essere disattivata.",
    "L’accesso da Pechino non significa che ogni inferenza avvenga nella Cina continentale. Vale il luogo di distribuzione del modello scelto; i modelli China Elastic Zone possono trattare dati fuori dalla Cina continentale. Gli accessi al sito dall’estero usano ancora un nodo cache a Singapore.",
    "**Per esercitare i tuoi diritti** (accesso, rettifica, cancellazione, chiusura dell'account, revoca del consenso), scrivi a . Rispondiamo entro quindici giorni lavorativi."
  ],
  "tocTitle": "Indice dei contenuti",
  "sections": [
    {
      "id": "controller",
      "title": "1. Chi siamo",
      "blocks": [
        {
          "type": "p",
          "text": "Titolare del trattamento delle informazioni personali:  (), codice identificativo unificato di impresa ."
        },
        {
          "type": "p",
          "text": "Per qualsiasi questione relativa alla protezione delle informazioni personali, contatta . Lo stesso indirizzo raggiunge la persona responsabile della protezione delle informazioni personali."
        },
        {
          "type": "p",
          "text": "La presente informativa copre il sito web AI WorkDeck, l'applicazione desktop, i componenti aggiuntivi per Office e i servizi correlati. È redatta in cinese e in inglese; in caso di discrepanza, prevale la versione cinese."
        }
      ]
    },
    {
      "id": "collect",
      "title": "2. Cosa raccogliamo",
      "blocks": [
        {
          "type": "p",
          "text": "Raccogliamo dati secondo un criterio di \"non più del necessario\". La tabella illustra cosa raccogliamo, perché e su quale base."
        },
        {
          "type": "table",
          "head": [
            "Contesto",
            "Informazioni",
            "Finalità",
            "Base giuridica"
          ],
          "rows": [
            [
              "Registrazione",
              "Nome utente, email, password, nome visualizzato, biografia (facoltativa)",
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
              "Credenziali limitate e autorizzazioni dell’account, modelli, utilizzo e registrazioni contabili",
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
            "Le conversazioni desktop passano dal gateway cinese durante l’uso dell’IA della piattaforma; i registri di fatturazione non ne conservano il contenuto. Conservazione e cancellazione delle conversazioni dei componenti seguono le clausole 6 e 8.",
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
          "text": "L’IA della piattaforma del sito cinese (chat desktop, componenti Office/WPS e creazione di Skill con IA) passa dal server cinese di AI WorkDeck al punto di accesso di Pechino di Alibaba Cloud Model Studio e al fornitore del modello. Il registro contabile del gateway conserva account, modello, utilizzo e costi, non i contenuti inoltrati. Restano invariate le regole di conservazione delle conversazioni dei componenti e delle Skill. Model Studio e i fornitori d’inferenza applicano le proprie politiche di conservazione, addestramento e localizzazione. Le regole del gateway non garantiscono conservazione zero presso terzi. Distribuzione dei modelli: https://help.aliyun.com/zh/model-studio/beijing-access-information"
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
              "Alibaba Cloud Model Studio e gli effettivi fornitori dei modelli",
              "Domanda attuale, cronologia necessaria, estratti di file e immagini",
              "Inferenza, misurazione dell’utilizzo e regolamento",
              "Accesso da Pechino; trattamento secondo la distribuzione del modello, anche fuori dalla Cina continentale"
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
              "Cina continentale"
            ],
            [
              "Bocha (ricerca web)",
              "La tua query di ricerca",
              "Restituisce i risultati della ricerca web",
              "Cina continentale"
            ],
            [
              "Qichacha",
              "Il nome dell'azienda o il codice di credito sociale unificato che cerchi",
              "Restituisce i dati del registro delle imprese",
              "Cina continentale"
            ],
            [
              "Tushare",
              "Il ticker e i campi che interroghi",
              "Restituisce dati di borsa e finanziari",
              "Cina continentale"
            ],
            [
              "PKULaw",
              "Il termine di ricerca per normative e giurisprudenza",
              "Restituisce i risultati relativi a normative e giurisprudenza",
              "Cina continentale"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**Come fluiscono i sei servizi forniti tramite piattaforma.** Le ultime sei righe sono i fornitori behind del livello \"fornito tramite piattaforma\": acquistiamo da loro per conto tuo, quindi non ti serve una chiave propria, e il contenuto richiesto da ciascuna chiamata viene inoltrato al fornitore attraverso i nostri server e addebitato sul tuo saldo. **Tutti e sei si trovano nella Cina continentale**, quindi questo livello non comporta alcun trasferimento transfrontaliero. Non registriamo, archiviamo né usiamo per addestramento ciò che inoltriamo; l'unica eccezione è l'audio delle riunioni, che viene conservato brevemente nel nostro object storage affinché il servizio di trascrizione possa leggerlo, e viene eliminato una volta completata l'elaborazione (vedi clausola 8). Ciascuno di essi può essere sostituito, in Impostazioni → Servizi Piattaforma nell'app desktop, con la tua chiave (l'app comunicherà quindi direttamente con quel fornitore, bypassandoci) o disattivato del tutto."
        },
        {
          "type": "callout",
          "text": "L’IA della piattaforma del sito cinese (chat desktop, componenti Office/WPS e creazione di Skill con IA) passa dal server cinese di AI WorkDeck al punto di accesso di Pechino di Alibaba Cloud Model Studio e al fornitore del modello. Il registro contabile del gateway conserva account, modello, utilizzo e costi, non i contenuti inoltrati. Restano invariate le regole di conservazione delle conversazioni dei componenti e delle Skill. L’accesso da Pechino non significa che ogni inferenza avvenga nella Cina continentale. Vale il luogo di distribuzione del modello scelto; i modelli China Elastic Zone possono trattare dati fuori dalla Cina continentale. Gli accessi al sito dall’estero usano ancora un nodo cache a Singapore."
        },
        {
          "type": "p",
          "text": "Potremmo inoltre divulgare informazioni quando la legge lo richiede: collaborando con autorità giudiziarie o amministrative, quando necessario per proteggere l'interesse pubblico o interessi vitali di una persona, o quando tu stesso abbia reso pubbliche le informazioni. In caso di fusione, scissione o trasferimento di asset, trasferiremo le informazioni personali insieme all'attività, comunicandoti in anticipo nome e recapiti del destinatario; il destinatario dovrà continuare a rispettare questa informativa o richiedere nuovamente il tuo consenso."
        }
      ]
    },
    {
      "id": "cross-border",
      "title": "7. Trasferimenti al di fuori della Cina continentale",
      "blocks": [
        {
          "type": "p",
          "text": "Data l'architettura descritta sopra, le tue informazioni vengono trasferite al di fuori della Cina continentale nei seguenti casi:"
        },
        {
          "type": "ul",
          "items": [
            "L’accesso da Pechino non significa che ogni inferenza avvenga nella Cina continentale. Vale il luogo di distribuzione del modello scelto; i modelli China Elastic Zone possono trattare dati fuori dalla Cina continentale. Gli accessi al sito dall’estero usano ancora un nodo cache a Singapore.",
            "Il download del programma di installazione desktop invia la tua richiesta a GitHub, Inc. negli Stati Uniti;",
            "I visitatori al di fuori della Cina continentale sono serviti da un nodo cache a Singapore, che recupera i dati dal server di origine a Pechino."
          ]
        },
        {
          "type": "callout",
          "text": "**The six platform-sourced services do not leave the country.** The vendors behind text recognition, web search, company registry data, securities and financial data, statute and case law search and meeting transcription are all inside mainland China (see clause 6). Content in that tier never leaves the mainland, and no separate cross-border consent is required for it. The three cases listed above are the complete set of transfers."
        },
        {
          "type": "callout",
          "text": "La propria chiave usa il percorso e le politiche del fornitore configurato; i modelli interamente locali trattano i contenuti sul dispositivo. Consultare le informazioni di distribuzione del modello per i luoghi di trattamento. I programmi di installazione restano distribuiti tramite GitHub."
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
