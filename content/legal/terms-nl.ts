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
  "title": "Terms of Service",
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
      "title": "6. Skill- en pluginplaza",
      "blocks": [
        {
          "type": "p",
          "text": "U kunt bijdragen indienen bij de Skill- of pluginplaza. Door in te dienen verklaart en garandeert u dat de inhoud van u zelf is of volledig aan u in licentie is gegeven, dat zij geen inbreuk maakt op intellectuele eigendomsrechten, bedrijfsgeheimen of andere rechten van derden, en dat zij geen kwaadaardige code bevat."
        },
        {
          "type": "p",
          "text": "Opdat wij de plaza kunnen exploiteren, verleent u ons een wereldwijde, niet-exclusieve, sublicentieerbare, royaltyvrije licentie om uw inzending op te slaan, te reproduceren, weer te geven en te verspreiden, beschikbaar te stellen voor installatie en updates, en te citeren en weer te geven voor zover redelijkerwijs nodig is om de Service te promoten. De licentie eindigt zodra uw inhoud van de plaza wordt verwijderd, zonder afbreuk te doen aan reeds verspreide kopieën."
        },
        {
          "type": "p",
          "text": "Wij kunnen inzendingen beoordelen en weigeren te publiceren of inhoud verwijderen die inbreuk lijkt te maken, kwaadaardige code bevat, niet geschikt is voor publicatie, of de wet of deze Voorwaarden schendt. Beoordeling is geen goedkeuring of garantie qua kwaliteit, beveiliging of wettelijkheid."
        },
        {
          "type": "callout",
          "text": "**Beoordeel inhoud van derden zelf.** Door de community aangeleverde Skills en plugins zijn niet door ons gebouwd en wij geven geen garantie omtrent hun werking, nauwkeurigheid of beveiliging. Verliezen door het gebruik ervan zijn voor rekening en risico van de bijdrager."
        },
        {
          "type": "p",
          "text": "Wanneer een betaalde bijdrage wordt verkocht, ontvangt de maker direct 70% van de transactiewaarde als Credits (het platform behoudt 30%). Het bijschrijven gebeurt op het moment van verkoop — geen verzoek, geen wachten op handmatige afrekening. Entitlements die via inwisselcodes worden verstrekt, zijn door het platform gefinancierde promotie en genereren geen makersaandeel."
        },
        {
          "type": "callout",
          "text": "**Makerinkomsten worden afgerekend in Credits. Deze kunnen niet worden omgezet in contant geld of worden opgenomen.** Credits kunnen worden besteed aan plaza-items, functie-ontgrendelingen en platform-AI en zijn 24 maanden geldig na bijschrijving. Houd hier rekening mee bij het prijzen van een inzending; kunt u zich niet in deze afrekenmethode vinden, dien dan geen betaalde bijdragen in."
        }
      ]
    },
    {
      "id": "payment",
      "title": "7. Credits: opwaarderen, besteden en verlopen",
      "blocks": [
        {
          "type": "p",
          "text": "Credits zijn de enige rekeneenheid binnen de Service. Opwaarderen levert u Credits op, die direct worden gebruikt voor platform-AI, de aankoop van Skills en plugins en functie-ontgrendelingen — er is geen aparte \"toewijzings\"-stap. De betaling wordt verwerkt via WeChat Pay; het bij de afrekenpagina getoonde bedrag en de omschrijving zijn leidend."
        },
        {
          "type": "p",
          "text": "Credits vallen in twee klassen met verschillende rechten:"
        },
        {
          "type": "table",
          "head": [
            "Klasse",
            "Bron",
            "Vervaldatum",
            "Restitueerbaar"
          ],
          "rows": [
            [
              "Opgewaardeerde Credits",
              "Uw eigen opwaardering",
              "Verlopen nooit",
              "Restitueerbaar bij accountsluiting"
            ],
            [
              "Toegekende Credits",
              "Makerinkomsten, cadeaus, inwisselcodes",
              "24 maanden na bijschrijving",
              "Niet opneembaar of restitueerbaar"
            ]
          ]
        },
        {
          "type": "callout",
          "text": "**Bij besteding worden eerst toegekende Credits gebruikt, en binnen elke klasse gaan degene die het eerst verlopen eerst.** Deze volgorde werkt in uw voordeel: het saldo dat zou verlopen, wordt eerst verbruikt. Uw accountpagina toont beide saldi en de eerstvolgende vervaldatum."
        },
        {
          "type": "p",
          "text": "Credits zijn een administratieve registratie van betaalde tegenprestatie. Ze zijn geen prepaidkaart: ze dragen geen rente en kunnen niet aan een ander persoon worden overgedragen."
        },
        {
          "type": "callout",
          "text": "**Platform-AI wordt verrekend met Credits op basis van werkelijk verbruik.** Wij stellen een verbruikslimiet vast met de upstream-modelaanbieder op basis van uw Credits-saldo en trekken periodiek het verbruik af. Elk verschil dat door synchronisatievertraging ontstaat, is voor onze rekening — wij brengen u dit niet in rekening, en uw Credits zullen nooit negatief worden."
        },
        {
          "type": "p",
          "text": "Digitale goederen (Skills, plug-ins, functie-ontgrendelingen) gelden als geleverd zodra ze beschikbaar zijn voor download. Binnen zeven dagen na aankoop kunt u een terugbetaling verzoeken indien het artikel een materiële defect heeft — het kan niet worden geïnstalleerd, of wijkt wezenlijk af van de beschrijving — en wij dit niet binnen een redelijke termijn verhelpen; indien u in Credits heeft betaald, worden de Credits geretourneerd. Problemen veroorzaakt door uw eigen apparaat, netwerk of wijze van gebruik geven geen recht op terugbetaling."
        },
        {
          "type": "p",
          "text": "Bij het sluiten van uw account kunt u verzoeken om ongebruikte opgewaardeerde Credits terug te storten via het oorspronkelijke betaalkanaal, minus de daadwerkelijk gemaakte kosten van het betaalkanaal. Toegekende Credits zijn niet terugbetaalbaar."
        },
        {
          "type": "p",
          "text": "Wij kunnen prijzen en pakketten wijzigen. Wijzigingen gelden alleen voor bestellingen die na inwerkingtreding worden geplaatst, nooit voor voltooide transacties, en nooit voor Credits die u al in uw bezit heeft."
        }
      ]
    },
    {
      "id": "ip",
      "title": "8. Intellectuele eigendom",
      "blocks": [
        {
          "type": "p",
          "text": "Behoudens andersluidende bepalingen van een open-sourcelicentie berust de intellectuele eigendom van de Service en de bijbehorende software, interfaces, documentatie, handelsmerken en logo's bij ons of bij de desbetreffende rechthebbenden. \"AI WorkDeck\" en het bijbehorende logo zijn onze merken en mogen niet worden gebruikt op wijzen die tot verwarring kunnen leiden, zonder onze schriftelijke toestemming."
        },
        {
          "type": "p",
          "text": "Wij verlenen u een niet-exclusieve, niet-overdraagbare, herroepbare licentie om de Service te gebruiken, onder voorbehoud van deze Voorwaarden, voor uw eigen zakelijke doeleinden of die van uw organisatie. U mag de Service niet reverse-engineeren (behalve voor zover een open-sourcelicentie dit toestaat), de licentie- of factureringsmechanismen omzeilen, deze op grote schaal scrapen, of doorverkopen, verhuren of in deeltijd aanbieden aan derden."
        }
      ]
    },
    {
      "id": "thirdparty",
      "title": "9. Diensten van derden",
      "blocks": [
        {
          "type": "p",
          "text": "De Service is afhankelijk van derden: WeChat Pay voor betalingen, OpenRouter voor modelrouting, GitHub voor hosting van installatieprogramma's en broncode, en cloudproviders voor infrastructuur. Elk van deze partijen hanteert eigen voorwaarden."
        },
        {
          "type": "p",
          "text": "Als een dienst van een derde partij wordt onderbroken, gewijzigd of stopgezet, kunnen de bijbehorende functies worden beïnvloed. Wij zullen redelijke inspanningen doen om alternatieven te vinden, maar zijn niet verantwoordelijk voor het handelen van die derden."
        }
      ]
    },
    {
      "id": "availability",
      "title": "10. Beschikbaarheid en wijzigingen",
      "blocks": [
        {
          "type": "p",
          "text": "Wij werken aan een stabiele Service, maar garanderen niet dat deze ononderbroken of foutloos zal zijn. Wij zijn niet aansprakelijk voor onderbrekingen veroorzaakt door onderhoud, upgrades, storingen bij derden, netwerkaanvallen of overmacht. Gepland onderhoud wordt vooraf aangekondigd."
        },
        {
          "type": "p",
          "text": "Wij kunnen onderdelen van de Service toevoegen, wijzigen of stopzetten. Als wij iets stopzetten waarvoor u heeft betaald, betalen wij het niet-uitgevoerde gedeelte pro rata terug."
        },
        {
          "type": "p",
          "text": "Desktopupdates worden geleverd als patches in de app of als volledige installatieprogramma's, zie de pagina met release notes. U mag updates weigeren, maar oudere versies kunnen online functionaliteit verliezen naarmate interfaces wijzigen."
        }
      ]
    },
    {
      "id": "warranty",
      "title": "11. Geen garanties",
      "blocks": [
        {
          "type": "p",
          "text": "Voor zover maximaal wettelijk toegestaan, wordt de Service geleverd \"as is\". Wij geven geen uitdrukkelijke of stilzwijgende garantie van verkoopbaarheid, geschiktheid voor een bepaald doel, ononderbroken of foutloze werking, noch enige garantie met betrekking tot de juistheid, volledigheid of bruikbaarheid van AI-uitvoer."
        },
        {
          "type": "p",
          "text": "Deze clausule sluit geen garanties uit die wettelijk niet kunnen worden uitgesloten."
        }
      ]
    },
    {
      "id": "liability",
      "title": "12. Beperking van aansprakelijkheid",
      "blocks": [
        {
          "type": "callout",
          "text": "**Voor zover maximaal wettelijk toegestaan, is onze totale aansprakelijkheid jegens u onder deze Voorwaarden en in verband met de Service beperkt tot de vergoedingen die u daadwerkelijk aan ons heeft betaald voor de Service in de twaalf maanden voorafgaand aan het ontstaan van het verlies; als u nooit heeft betaald, geldt een limiet van CNY 100.**"
        },
        {
          "type": "p",
          "text": "Voor zover maximaal wettelijk toegestaan, zijn wij niet aansprakelijk voor gederfde winst, bedrijfsonderbreking, verlies van goede wil, gegevensverlies of enig ander indirect, incidenteel of gevolgschade — zelfs niet als ons was meegedeeld dat zulks mogelijk was."
        },
        {
          "type": "callout",
          "text": "**Deze clausule is niet van toepassing op, en wij blijven aansprakelijk krachtens de wet voor: opzet of grove nalatigheid van onze kant; persoonlijk letsel; en alle andere aansprakelijkheid die wettelijk niet kan worden beperkt of uitgesloten.**"
        },
        {
          "type": "p",
          "text": "U begrijpt dat deze clausule samen met clausule 4 deel uitmaakt van de grondslag waarop de Service wordt aangeboden: de prijs weerspiegelt het feit dat de aansprakelijkheid op deze wijze begrensd is."
        }
      ]
    },
    {
      "id": "indemnity",
      "title": "13. Uw schadeloosstelling",
      "blocks": [
        {
          "type": "p",
          "text": "Als wij worden geconfronteerd met een claim van een derde partij, een bestuurlijke boete of een procedure omdat u deze Voorwaarden of de wet heeft geschonden, inbreuk heeft gemaakt op een recht van een derde partij, of als gevolg van inhoud die u bij de Service heeft ingediend, vergoedt u ons de daadwerkelijk geleden verliezen, inclusief redelijke kosten van juridisch bijstand, rechtszaken en arbitrage."
        }
      ]
    },
    {
      "id": "termination",
      "title": "14. Beëindiging",
      "blocks": [
        {
          "type": "p",
          "text": "U kunt op elk moment stoppen met het gebruik van de Service en uw account sluiten. Wij zullen vervolgens uw persoonsgegevens verwerken zoals beschreven in het Privacybeleid, en uw accountsleutels werken onmiddellijk niet meer."
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
