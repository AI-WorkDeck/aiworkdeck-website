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
  "eyebrow": "Rechtliches",
  "title": "Datenschutzerklärung",
  "effectiveLabel": "Wirksam ab {__T_LEGAL_EFFECTIVE_DATE__}",
  "intro": "Diese Richtlinie erläutert, wie  () personenbezogene Daten erhebt, verwendet, speichert und offenlegt, wenn Sie die AI WorkDeck-Website und Desktop-Anwendung nutzen, und welche Rechte Sie haben. Wir empfehlen, sie vollständig zu lesen; wenn Sie nur die Kurzfassung möchten, deckt die folgende Zusammenfassung das Wesentliche ab.",
  "highlightsTitle": "Die Kurzfassung",
  "highlights": [
    "**Das Office/WPS-Add-in nutzt Cloud-Verarbeitung.** Das aktuelle Dokument, der erforderliche Unterhaltungsverlauf und die von Ihnen ausgewählten Referenzen gelangen zu unserem gehosteten Backend und von dort zu Alibaba Cloud Model Studio sowie zum Inferenz-Anbieter des von Ihnen gewählten Modells. Rohdaten von Dokumenten werden nur flüchtig im Arbeitsspeicher vorgehalten; Nutzernachrichten, KI-Antworten und Begründungen bleiben gespeichert, bis Sie die Unterhaltung löschen. Siehe Ziffern 6 und 8.",
    "Desktop-Dokumente, Projekte und Arbeitsverlauf bleiben auf Ihrem Gerät. Beim Aufruf der Plattform-KI werden erforderliche Texte, Dateiauszüge, Bilder und Gesprächskontexte über unser chinesisches Gateway an Model Studio gesendet. Lokale Speicherung bedeutet nicht, dass Anfragen unsere Server umgehen.",
    "**Sechs plattformseitig bereitgestellte Dienste laufen über unsere Server** (Texterkennung, Websuche, Daten aus Handelsregistern, Wertpapier- und Finanzdaten, Suche nach Gesetzen und Rechtsprechung, Meeting-Transkription): Wir kaufen diese Dienste im Namen des Nutzers beim Anbieter ein, sodass Sie keinen eigenen Schlüssel benötigen, und die Inhalte, die jeder Aufruf erfordert, werden über uns an den Anbieter weitergeleitet. **Alle sechs Anbieter befinden sich auf dem chinesischen Festland, daher ist bei dieser Stufe keine grenzüberschreitende Übermittlung beteiligt.** Nur das Meeting-Audio wird vorübergehend auf unserer Seite gespeichert und nach Abschluss der Transkription gelöscht. Jeder dieser Dienste kann auf Ihren eigenen Schlüssel umgestellt oder deaktiviert werden. Siehe Ziffern 2, 6, 7 und 8.",
    "**Die Website setzt genau ein Cookie** (`awd_session`, um Sie angemeldet zu halten). Es gibt keinen Analyse-, Werbe- oder Tracking-Code von Drittanbietern, und Web-Fonts werden selbst gehostet, sodass keine Anfrage an Dritte geht.",
    "**Desktop-Telemetrie ist anonym:** eine zufällige Installationskennung, die App-Version und auf einer Whitelist stehende Ereignisnamen. Es wird keine IP-Adresse gespeichert, nichts mit Ihrem Konto verknüpft, keine Dokumenteninhalte sind enthalten, und es lässt sich deaktivieren.",
    "Der Zugang über Peking bedeutet nicht, dass jede Inferenz in Festlandchina erfolgt. Maßgeblich sind die Bereitstellungsangaben des gewählten Modells; Modelle der China Elastic Zone können Daten außerhalb Festlandchinas verarbeiten. Website-Zugriffe aus dem Ausland verwenden weiterhin einen Cache-Knoten in Singapur.",
    "**Um Ihre Rechte auszuüben** (Einsicht, Berichtigung, Löschung, Kontoschließung, Widerruf der Einwilligung), schreiben Sie an . Wir antworten innerhalb von fünfzehn Arbeitstagen."
  ],
  "tocTitle": "Inhalt",
  "sections": [
    {
      "id": "controller",
      "title": "1. Wer wir sind",
      "blocks": [
        {
          "type": "p",
          "text": "Verarbeiter personenbezogener Daten:  (), einheitliche Gesellschaftskennnummer ."
        },
        {
          "type": "p",
          "text": "Für alles, was den Schutz personenbezogener Daten betrifft, wenden Sie sich an . Dasselbe Postfach erreicht die für den Schutz personenbezogener Daten verantwortliche Person."
        },
        {
          "type": "p",
          "text": "Diese Richtlinie umfasst die AI WorkDeck-Website, die Desktop-Anwendung, die Office-Add-ins und zugehörige Dienste. Sie liegt in chinesischer und englischer Fassung vor; im Falle von Abweichungen gilt die chinesische Fassung."
        }
      ]
    },
    {
      "id": "collect",
      "title": "2. Was wir erheben",
      "blocks": [
        {
          "type": "p",
          "text": "Wir erheben Daten nach dem Prinzip „nicht mehr als nötig\". Die Tabelle zeigt, was wir erheben, warum und auf welcher Grundlage."
        },
        {
          "type": "table",
          "head": [
            "Kontext",
            "Information",
            "Zweck",
            "Grundlage"
          ],
          "rows": [
            [
              "Registrierung",
              "Benutzername, E-Mail, Passwort, Anzeigename, Bio (optional)",
              "Erstellen und Identifizieren Ihres Kontos, Kontowiederherstellung, öffentliches Profil",
              "Erforderlich für den Abschluss und die Durchführung des Vertrags"
            ],
            [
              "Angemeldet bleiben",
              "Sitzungstoken (im awd_session-Cookie)",
              "Aufrechterhaltung Ihrer Sitzung",
              "Erforderlich für die Durchführung des Vertrags"
            ],
            [
              "Passwortspeicherung",
              "Nur gesalzener Scrypt-Hash",
              "Überprüfung Ihres Passworts",
              "Erforderlich für die Durchführung des Vertrags"
            ],
            [
              "Aufladungen und Zahlungen",
              "Bestellnummer, WeChat Pay-Transaktions-ID, WeChat-openid des Zahlers, Betrag, Status, Zeitstempel",
              "Zahlungen abwickeln, abstimmen sowie Rückerstattungen und Streitfälle bearbeiten",
              "Vertrag + rechtliche Verpflichtung (Steuer und Buchführung)"
            ],
            [
              "Wallet und Transaktionen",
              "Guthaben, Kontobuchungen, Käufe, Berechtigungen, Creator-Einnahmen",
              "Buchhaltung, Berechtigungsprüfungen, Abrechnung",
              "Erforderlich für die Durchführung des Vertrags"
            ],
            [
              "Kontoschlüssel",
              "Nur SHA-256-Hash und Präfix; keine Klartextspeicherung",
              "Authentifizierung der Desktop-Anwendung",
              "Erforderlich für die Durchführung des Vertrags"
            ],
            [
              "AI-Credit",
              "Beschränkte Aufrufberechtigungen und Kontoautorisierungsdaten, Modelle, Nutzung und Abrechnungsdaten",
              "Bereitstellung und Abrechnung Ihres AI-Credits",
              "Erforderlich für die Durchführung des Vertrags"
            ],
            [
              "Plaza-Einreichungen",
              "Der Skill oder das Plugin, das bzw. das Sie einreichen, und Ihre Autorenidentität",
              "Prüfung, Veröffentlichung, Vertrieb, Abrechnung",
              "Zur Erfüllung des Vertrags erforderlich"
            ],
            [
              "Desktop-Telemetrie",
              "Zufällige Installationskennung (UUID), App-Version, zugelassene Ereignisnamen, ein Konversations-Sequenzschlüssel, eine kleine Menge nicht sensibler Attribute",
              "Aktivitäten und Feature-Nutzung messen, Abstürze diagnostizieren",
              "Ihre Einwilligung (kann deaktiviert werden)"
            ],
            [
              "Externe Dienste von Plattformanbietern",
              "Der Inhalt, den jeder Aufruf erfordert (das zu erkennende Bild, eine Suchanfrage, ein Firmenname, ein Ticker, ein Suchbegriff, Besprechungsaudio), plus ein Kontoeintrag ohne Inhalt (Dienst, Menge, Betrag, Zeitstempel)",
              "Den Anbieter in Ihrem Namen aufrufen und die Nutzung erfassen",
              "Zur Erfüllung des Vertrags erforderlich (Ihr Aufruf ist die Anfrage)"
            ],
            [
              "Serverprotokolle",
              "Zeitstempel, Anforderungspfad, Statuscode, IP-Adresse",
              "Sicherheit, Fehlerbehebung, Angriffsabwehr",
              "Angemessen erforderliche Sicherheitswartung + gesetzliche Verpflichtung"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**Zur Telemetrie:** die IP-Adresse einer Telemetrie-Anfrage wird nur im Arbeitsspeicher zur Ratenbegrenzung verwendet und **niemals in die Datenbank geschrieben**. Es wird keine Verbindung zwischen der zufälligen Installationskennung und Ihrem Konto gespeichert, daher können wir die Telemetrie nicht auf eine Person zurückverfolgen."
        }
      ]
    },
    {
      "id": "not-collect",
      "title": "3. Was wir nicht erfassen",
      "blocks": [
        {
          "type": "p",
          "text": "Die folgenden Ausführungen zu Dokumenten und AI-Konversationen betreffen die lokale Desktop-Nutzung. Das Office-/WPS-Add-in verarbeitet Dokumente und Konversationen über unser gehostetes Backend, wie in den Klauseln 6 und 8 erläutert. Ansonsten erfassen wir Folgendes nicht aktiv:"
        },
        {
          "type": "ul",
          "items": [
            "Ihre Dokumente, Akten oder Projektdateien und deren Inhalte — die Desktop-Anwendung ist lokal-first und diese bleiben auf Ihrem Gerät. **Wenn Sie einen bestimmten Inhalt an einen bestimmten externen Dienst übergeben** (ein Bild zur Texterkennung, eine Aufnahme zur Transkription): dann leiten wir den Teil davon, den der Aufruf erfordert, an den Anbieter weiter. Abgesehen von Besprechungsaudio, das nur kurz vorgehalten wird, behalten wir nichts davon (siehe Klauseln 6 und 8);",
            "Desktop-Unterhaltungen werden beim Aufruf der Plattform-KI über das chinesische Gateway weitergeleitet; Abrechnungsprotokolle und -bücher speichern keine Gesprächsinhalte. Für Speicherung und Löschung von Add-in-Unterhaltungen gelten die Abschnitte 6 und 8.",
            "Sensible personenbezogene Informationen wie Telefonnummern, Ausweisnummern, Gesichtsbilder oder Fingerabdrücke;",
            "Standort, Kontakte, Anruflisten, Nachrichten oder Fotobibliotheken;",
            "Ihre Aktivitäten außerhalb dieses Dienstes — wir betreiben keine Analyse- oder Werbe-SDKs von Drittanbietern."
          ]
        },
        {
          "type": "p",
          "text": "Wir verwenden keine Ihrer Inhalte zum Trainieren von Modellen und verkaufen keine personenbezogenen Informationen."
        }
      ]
    },
    {
      "id": "cookies",
      "title": "4. Cookies",
      "blocks": [
        {
          "type": "p",
          "text": "Die Website setzt ein Cookie:"
        },
        {
          "type": "table",
          "head": [
            "Name",
            "Zweck",
            "Attribute",
            "Lebensdauer"
          ],
          "rows": [
            [
              "awd_session",
              "Hält Sie angemeldet",
              "HttpOnly, SameSite=Lax",
              "30 Tage"
            ]
          ]
        },
        {
          "type": "p",
          "text": "Dieses Cookie ist unbedingt erforderlich für die Anmeldung und kann nicht deaktiviert werden, solange Sie angemeldet bleiben bleiben. Wir verwenden keine Analyse-, Werbe- oder Cross-Site-Tracking-Cookies. Web-Schriftarten werden beim Build in die Website eingebunden, sodass beim Laden einer Seite keine Schriftanfrage an Dritte gestellt wird."
        },
        {
          "type": "p",
          "text": "Sie können das Cookie in Ihrem Browser löschen; die Wirkung ist dieselbe wie beim Abmelden."
        }
      ]
    },
    {
      "id": "use",
      "title": "5. Wie wir die Daten verwenden",
      "blocks": [
        {
          "type": "ul",
          "items": [
            "Betrieb des Dienstes: Identifizierung von Konten, Prüfung von Ansprüchen, Abrechnung von Gebühren, Bereitstellung dessen, was Sie gekauft haben;",
            "Sicherheit: Erkennung anomalouser Anmeldungen und Missbrauchs, Ratenbegrenzung, Abwehr von Angriffen, Diagnose von Störungen;",
            "Verbesserung des Produkts: aggregierte Statistiken aus anonymer Telemetrie, die zeigen, welche Funktionen genutzt werden und wo Nutzer abspringen;",
            "Rechtliche Verpflichtungen: Aufbewahrung von Aufzeichnungen, die nach Steuer-, Rechnungslegungs- und Cybersicherheitsvorschriften erforderlich sind;",
            "Kommunikation mit Ihnen: Dienständerungen, Sicherheitsvorfälle, Änderungen der Bedingungen."
          ]
        },
        {
          "type": "p",
          "text": "Wir verwenden die Informationen für nichts anderes. Sollten wir dies jemals benötigen, werden wir separat um Ihre Zustimmung bitten. Wir führen keine automatisierte Entscheidungsfindung durch und verwenden personenbezogene Informationen nicht für gezielte Werbung oder differenzierte Preisgestaltung."
        }
      ]
    },
    {
      "id": "third-parties",
      "title": "6. Offenlegung und Dritte",
      "blocks": [
        {
          "type": "callout",
          "text": "Die Plattform-KI der China-Website (Desktop-Chat, Office/WPS-Add-ins und KI-gestützte Skill-Erstellung) wird über den chinesischen Server von AI WorkDeck an den Pekinger Zugangspunkt von Alibaba Cloud Model Studio und den jeweiligen Modellanbieter weitergeleitet. Das Gateway erfasst im Abrechnungsbuch Konto, Modell, Nutzung und Kosten, nicht die weitergeleiteten Inhalte. Die bisherigen Speicherregeln für Add-in-Unterhaltungen und Skills bleiben bestehen. Für Model Studio und die Inferenzanbieter gelten deren eigene Speicher-, Trainings- und Standortregeln. Unsere Gateway-Regeln garantieren keine Speicherfreiheit bei Dritten. Modellbereitstellung: https://help.aliyun.com/zh/model-studio/beijing-access-information"
        },
        {
          "type": "p",
          "text": "Wir geben Ihre personenbezogenen Informationen nicht an Dritte weiter, außer wie folgt:"
        },
        {
          "type": "table",
          "head": [
            "Empfänger",
            "Information",
            "Zweck",
            "Standort"
          ],
          "rows": [
            [
              "Tenpay Payment Technology Co., Ltd. (WeChat Pay)",
              "Bestellnummer, Betrag, Artikelbeschreibung",
              "Zahlungseinzug, Rückerstattungen, Abstimmung",
              "Festlandchina"
            ],
            [
              "Alibaba Cloud Model Studio und die jeweiligen Modellanbieter",
              "Aktuelle Frage, erforderlicher Gesprächsverlauf, Dateiauszüge und Bilder",
              "Modellinferenz, Nutzungsmessung und Abrechnung",
              "Zugang über Peking; Verarbeitung je nach Modellbereitstellung auch außerhalb Festlandchinas"
            ],
            [
              "GitHub, Inc.",
              "Netzwerkanfragedaten beim Herunterladen von Installationsprogrammen",
              "Hosting von Installationsprogrammen und Open-Source-Code",
              "USA"
            ],
            [
              "Alibaba Cloud Computing Ltd.",
              "Technische Daten auf Server- und Netzwerkebene",
              "Hosting und Netzwerkbeschleunigung",
              "Festlandchina + Singapur-Knoten"
            ],
            [
              "Alibaba Cloud (Tingwu)",
              "Ihre Besprechungsaudios und deren Transkript",
              "Sprachtranskription und Sprechertrennung",
              "Festlandchina"
            ],
            [
              "Alibaba Cloud (OCR)",
              "Das Bild, das Sie zur Erkennung einreichen",
              "Texterkennung in Bildern",
              "Festlandchina"
            ],
            [
              "Bocha (Websuche)",
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
          "text": "Die Plattform-KI der China-Website (Desktop-Chat, Office/WPS-Add-ins und KI-gestützte Skill-Erstellung) wird über den chinesischen Server von AI WorkDeck an den Pekinger Zugangspunkt von Alibaba Cloud Model Studio und den jeweiligen Modellanbieter weitergeleitet. Das Gateway erfasst im Abrechnungsbuch Konto, Modell, Nutzung und Kosten, nicht die weitergeleiteten Inhalte. Die bisherigen Speicherregeln für Add-in-Unterhaltungen und Skills bleiben bestehen. Der Zugang über Peking bedeutet nicht, dass jede Inferenz in Festlandchina erfolgt. Maßgeblich sind die Bereitstellungsangaben des gewählten Modells; Modelle der China Elastic Zone können Daten außerhalb Festlandchinas verarbeiten. Website-Zugriffe aus dem Ausland verwenden weiterhin einen Cache-Knoten in Singapur."
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
            "Der Zugang über Peking bedeutet nicht, dass jede Inferenz in Festlandchina erfolgt. Maßgeblich sind die Bereitstellungsangaben des gewählten Modells; Modelle der China Elastic Zone können Daten außerhalb Festlandchinas verarbeiten. Website-Zugriffe aus dem Ausland verwenden weiterhin einen Cache-Knoten in Singapur.",
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
          "text": "Eigene Schlüssel verwenden die Verbindung und Richtlinien des konfigurierten Anbieters; vollständig lokale Modelle verarbeiten Inhalte auf Ihrem Gerät. Die Verarbeitungsorte ergeben sich aus den Bereitstellungsangaben des Modells. Installationsdateien werden weiterhin über GitHub verteilt."
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
            "Im Transit: HTTPS wird siteweite durchgesetzt;",
            "Passwörter: gespeichert als scrypt-Hashes mit Salt – wir können Ihr Original-Passwort nicht wiederherstellen;",
            "Account-Schlüssel: es werden nur Hash und Präfix gespeichert; der Klartext wird Ihnen einmalig bei der Generierung angezeigt und existiert danach nirgendwo in unseren Systemen;",
            "Modell-Schlüssel: verschlüsselt gespeichert;",
            "Zugriffskontrolle: Produktionszugriff ist auf die Personen beschränkt, die ihn benötigen;",
            "Beständigkeit: Finanzdaten werden transaktional geschrieben und regelmäßig gesichert."
          ]
        },
        {
          "type": "p",
          "text": "Kein System ist vollkommen sicher. Sollten personenbezogene Daten auf eine Weise offengelegt, verändert oder verloren werden, die Sie schädigen könnte, ergreifen wir umgehend Abhilfemaßnahmen und benachrichtigen Sie sowie die zuständigen Behörden, wie es das Gesetz verlangt."
        }
      ]
    },
    {
      "id": "rights",
      "title": "10. Ihre Rechte",
      "blocks": [
        {
          "type": "p",
          "text": "Nach dem Gesetz zum Schutz personenbezogener Daten haben Sie die folgenden Rechte in Bezug auf die personenbezogenen Daten, die wir verarbeiten:"
        },
        {
          "type": "ul",
          "items": [
            "**Einsicht und Kopie** — herausfinden, welche Daten wir über Sie speichern, und eine Kopie erhalten;",
            "**Berichtigung und Vervollständigung** — unrichtige oder unvollständige Angaben korrigieren lassen; Kontodaten können Sie auch selbst bearbeiten;",
            "**Löschung** — wenn der Zweck erfüllt ist, Sie Ihre Einwilligung widerrufen oder wir unrechtmäßig verarbeitet haben;",
            "**Übertragbarkeit** — Ihre Daten an einen anderen von Ihnen benannten Verantwortlichen übertragen lassen, sofern die von der nationalen Cyberbehörde festgelegten Bedingungen erfüllt sind;",
            "**Widerruf der Einwilligung** — für alles, was auf Basis einer Einwilligung verarbeitet wird, etwa Telemetrie und grenzüberschreitende Übermittlungen;",
            "**Einschränkung oder Widerspruch** — uns bitten, bestimmte Verarbeitungen einzuschränken oder zu verweigern;",
            "**Erläuterung** — uns bitten, diese Richtlinie und unsere Verarbeitungsregeln zu erläutern;",
            "**Schließung Ihres Kontos** — jederzeit, wonach wir Ihre Daten gemäß Ziffer 8 behandeln."
          ]
        },
        {
          "type": "p",
          "text": "So machen Sie davon Gebrauch: Bearbeiten Sie Ihre Daten und widerrufen Sie Account-Schlüssel selbst in Ihrem Konto; wenden Sie sich in allen anderen Fällen schriftlich an und geben Sie Ihr Konto und Ihr Anliegen an. Wir bitten Sie ggf. zunächst, Ihre Identität zu bestätigen. Wir antworten innerhalb von fünfzehn Werktagen und erläutern, falls ein komplexer Antrag mehr Zeit benötigt."
        },
        {
          "type": "p",
          "text": "Ein naher Angehöriger eines verstorbenen Nutzers kann die Rechte auf Einsicht, Kopie, Berichtigung und Löschung in Bezug auf die relevanten personenbezogenen Daten dieses Nutzers ausüben, sofern der Nutzer zu Lebzeiten nichts anderes verfügt hat."
        }
      ]
    },
    {
      "id": "minors",
      "title": "11. Minderjährige",
      "blocks": [
        {
          "type": "p",
          "text": "Der Service richtet sich an Fachkräfte und wird Kindern unter 14 Jahren nicht angeboten. Wir erheben wissentlich keine personenbezogenen Daten von Kindern. Sollten wir feststellen, dass wir solche ohne vorherige Zustimmung des Erziehungsberechtigten erhoben haben, löschen wir sie umgehend."
        },
        {
          "type": "p",
          "text": "Erziehungsberechtigte, die von einem solchen Fall Kenntnis erlangen, erreichen uns unter ."
        }
      ]
    },
    {
      "id": "changes",
      "title": "12. Änderungen dieser Richtlinie",
      "blocks": [
        {
          "type": "p",
          "text": "Wir können diese Richtlinie überarbeiten. Bei wesentlichen Änderungen von Zwecken, Methoden oder Kategorien von Daten werden wir Sie per Website-Ankündigung oder E-Mail informieren, bevor sie in Kraft treten, und – wo das Gesetz es verlangt – eine erneute Einwilligung einholen."
        },
        {
          "type": "p",
          "text": "Frühere Versionen stellen wir auf Anfrage per E-Mail bereit."
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
