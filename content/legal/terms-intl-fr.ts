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
    "**Les litiges relèvent d'un arbitrage devant ** — voir la clause 16. Si vous êtes un consommateur, cette clause ne vous prive pas des protections du droit impératif applicable dans votre lieu de résidence.",
    "**Ce site et {__T_siteConfig_otherSite_host__} sont distincts.** Entités contractantes distinctes, comptes distincts, soldes distincts. Rien de ce que vous détenez là-bas n'est utilisable ici — voir la clause 1."
  ],
  "tocTitle": "Contents",
  "sections": [
    {
      "id": "parties",
      "title": "1. Parties et champ d'application",
      "blocks": [
        {
          "type": "p",
          "text": "Le Service est exploité par , une société constituée dans la Région administrative spéciale de Hong Kong en vertu de la Companies Ordinance (Cap. 622),  . Siège social : . Contact : ."
        },
        {
          "type": "p",
          "text": "Les présentes Conditions couvrent {__T_siteConfig_host__}, l'application de bureau, les compléments Office, les places de marché de Skills et de plugins, ainsi que les autres services connexes que nous pouvons proposer. Les parties de l'application de bureau publiées sous une licence open source (voir le fichier LICENSE dans le dépôt de code) sont en outre régies par cette licence ; en cas de conflit entre cette licence et les présentes Conditions, la licence prévaut pour ces parties."
        },
        {
          "type": "callout",
          "text": "**{__T_siteConfig_host__} et {__T_siteConfig_otherSite_host__} sont deux services distincts.** Ils fonctionnent sur des infrastructures distinctes avec des bases de données distinctes, et chacun est exploité par une entité contractante différente soumise à un droit applicable différent. Les comptes, mots de passe, soldes de Credits, droits acquis et clés de compte **ne sont pas transférables**. S'inscrire ici ne vous donne pas de compte là-bas, et un achat effectué là-bas ne peut pas être utilisé ici. Si vous avez déjà un compte sur l'autre site et souhaitez utiliser celui-ci, vous devez vous inscrire à nouveau."
        },
        {
          "type": "callout",
          "text": "**L'application de bureau est livrée avec une interface en chinois.** Ce site est disponible en anglais et en chinois, mais le logiciel lui-même — menus, boîtes de dialogue, paramètres, messages d'erreur — est actuellement en chinois uniquement, de même que la majeure partie de l'aide intégrée. Les fonctionnalités d'IA répondent dans la langue dans laquelle vous écrivez, et les documents que vous modifiez ne sont pas affectés. Nous le disons clairement ici car c'est le point le plus susceptible de décevoir une personne ayant acheté sur la foi d'un site web en anglais. Si cela pose problème, n'achetez pas."
        },
        {
          "type": "p",
          "text": "Les présentes Conditions existent en anglais et en chinois. En cas de divergence, la version anglaise prévaut."
        }
      ]
    },
    {
      "id": "eligibility",
      "title": "2. Qui peut utiliser le Service",
      "blocks": [
        {
          "type": "p",
          "text": "Le Service est conçu pour les professionnels et les organisations travaillant dans les domaines du droit, de la conformité et des domaines connexes, et suppose des utilisateurs capables de faire preuve de jugement professionnel. Vous confirmez disposer de la capacité juridique pour conclure les présentes Conditions, ou être dûment autorisé à les accepter au nom de votre organisation."
        },
        {
          "type": "p",
          "text": "Le Service n'est pas proposé aux personnes de moins de 18 ans. Nous ne le fournissons pas sciemment aux enfants et ne recueillons pas sciemment d'informations les concernant."
        },
        {
          "type": "p",
          "text": "Vous êtes responsable de vérifier que votre utilisation du Service est licite là où vous vous trouvez, y compris au regard des contrôles des exportations, des sanctions ou des restrictions à l'exercice professionnel qui vous concernent. Nous pouvons refuser ou interrompre le service lorsque sa fourniture enfreindrait des règles de sanctions ou de contrôle des exportations qui nous lient."
        }
      ]
    },
    {
      "id": "account",
      "title": "3. Comptes et clés de compte",
      "blocks": [
        {
          "type": "p",
          "text": "L'inscription requiert un nom d'utilisateur, une adresse e-mail et un mot de passe. Vous devez fournir des informations exactes et protéger vos identifiants. Les pertes causées par votre manquement à cette obligation sont à votre charge."
        },
        {
          "type": "p",
          "text": "Une clé de compte (une chaîne commençant par awdk_) relie l'application de bureau et les compléments Office à votre compte sur le site. Nous n'en stockons que l'empreinte (hash), jamais le texte en clair ; une clé perdue ne peut donc pas être récupérée — seulement remplacée. Chaque compte peut détenir au maximum trois clés actives."
        },
        {
          "type": "callout",
          "text": "**Quiconque détient votre clé de compte est considéré comme vous.** Gardez-la comme un mot de passe ; ne la transférez pas, ne la vendez pas et ne la publiez pas. En cas de fuite, révoquez-la immédiatement dans votre compte. Toutes les actions effectuées et tous les frais engagés avec cette clé avant sa révocation relèvent de votre responsabilité."
        },
        {
          "type": "p",
          "text": "Nous pouvons suspendre ou fermer un compte lorsque cela s'avère raisonnablement nécessaire : violation des présentes Conditions ou de la loi, utilisation du compte pour attaquer ou abuser du Service, activité anormale prolongée, ou soupçon de fraude. Sauf en cas d'urgence, nous vous en informerons d'abord et vous donnerons la possibilité de régulariser la situation. Si nous fermons votre compte sans motif, nous remboursons les Credits rechargeés non consommés."
        }
      ]
    },
    {
      "id": "ai",
      "title": "4. Ce que sont — et ne sont pas — les fonctionnalités d'IA",
      "blocks": [
        {
          "type": "callout",
          "text": "**Le Service est un outil, et non un service juridique.** Nous ne sommes pas un cabinet d'avocats, nous ne donnons pas de conseils juridiques, et aucune relation avocat-client, mandataire ou autre relation professionnelle ne découle de votre utilisation du Service. Tout ce que l'IA produit — brouillons, commentaires de révision, évaluations des risques, résultats de vérification des références — constitue du matériel de travail destiné à votre examen et ne remplace pas votre propre jugement professionnel."
        },
        {
          "type": "p",
          "text": "Vous acceptez les limites inhérentes aux grands modèles de langage : les sorties sont générées de manière statistique plutôt que récupérées, et peuvent contenir des affirmations contraires aux faits, des dispositions abrogées ou modifiées, et des affaires qui n'existent pas ou ne disent pas ce qui est affirmé (communément appelées « hallucinations »). Des fonctionnalités telles que la vérification des références réduisent ce risque sans pouvoir l'éliminer."
        },
        {
          "type": "p",
          "text": "Les modèles disponibles via le canal IA de la plateforme sont entraînés principalement sur des contenus en anglais et en chinois et reflètent ce biais. Les sorties concernant une juridiction donnée — y compris la vôtre — peuvent être erronées de manière non évidente. Rien dans le Service n'est adapté au droit d'un pays spécifique."
        },
        {
          "type": "p",
          "text": "En conséquence, vous vous engagez à vérifier indépendamment les sorties de l'IA avant de les utiliser dans tout livrable externe, tout conseil donné à un client, ou tout dépôt auprès d'une juridiction ou d'une autorité administrative. Les conséquences de l'utilisation de sorties non vérifiées sont à votre charge."
        },
        {
          "type": "p",
          "text": "Vous devez également respecter les règles de déontologie et de confidentialité qui vous sont applicables. Avant de soumettre des documents clients ou des dossiers à l'IA, il vous incombe de déterminer si le consentement du client est requis et si cette démarche est autorisée dans votre juridiction et par votre cabinet."
        }
      ]
    },
    {
      "id": "content",
      "title": "5. Vos contenus et vos données",
      "blocks": [
        {
          "type": "p",
          "text": "L'application de bureau repose sur le principe « local-first » : vos documents, projets et historique de travail restent par défaut sur votre propre appareil. Nous ne les téléchargeons pas, ne les conservons pas et n'y accédons pas."
        },
        {
          "type": "p",
          "text": "Les exceptions concernent les fonctionnalités que vous déclenchez vous-même. Lorsque vous utilisez le canal IA de la plateforme, le contenu que vous choisissez d'envoyer est traité par un fournisseur de modèles. Lorsque vous utilisez des extensions nécessitant un accès réseau (synthèse vocale, analyse de documents), le contenu concerné est transmis à ce fournisseur. Lorsque vous nous envoyez un retour produit, le texte et toute pièce jointe incluse sont téléversés dans notre boîte de réception dédiée aux retours. La Politique de confidentialité décrit chacun de ces flux ainsi que l'emplacement des serveurs."
        },
        {
          "type": "p",
          "text": "Vous garantissez que ce que vous soumettez au Service ne contient aucune information dont la divulgation vous est interdite, aucun contenu portant atteinte à la propriété intellectuelle ou aux secrets d'affaires de tiers, et rien d'illicite. Les réclamations, litiges ou sanctions découlant de votre contenu sont à votre charge."
        },
        {
          "type": "p",
          "text": "Vous conservez tous les droits sur votre propre contenu. Nous n'utilisons pas vos documents pour entraîner des modèles et nous ne les transmettons à personne, sauf tel que décrit dans la Politique de confidentialité."
        }
      ]
    },
    {
      "id": "marketplace",
      "title": "6. Place des Skills et place des extensions",
      "blocks": [
        {
          "type": "callout",
          "text": "**Les soumissions payantes ne sont pas encore ouvertes sur ce site.** La place du marché répertorie actuellement uniquement des entrées gratuites et de première partie. Vous pouvez dès à présent soumettre une entrée gratuite ; le partage de revenus créateur décrit ci-dessous s'applique à partir du moment où nous ouvrirons les soumissions payantes, ce que nous annoncerons avant que cela n'arrive."
        },
        {
          "type": "p",
          "text": "Vous pouvez soumettre des entrées à la place des Skills ou à la place des extensions. En soumettant, vous déclarez et garantissez que le contenu est le vôtre ou qu'il vous est entièrement sous-licencié, qu'il ne porte atteinte à aucun droit de propriété intellectuelle, secret d'affaires ou autre droit de tiers, et qu'il ne contient aucun code malveillant."
        },
        {
          "type": "p",
          "text": "Afin que nous puissions exploiter la place du marché, vous nous accordez une licence mondiale, non exclusive, transférable avec sous-licence et sans redevance, pour stocker, reproduire, afficher et distribuer votre soumission, la rendre disponible à l'installation et à la mise à jour, ainsi que la citer et l'afficher dans la mesure raisonnablement nécessaire pour promouvoir le Service. Cette licence prend fin lorsque votre contenu est retiré de la place du marché, sans effet sur les copies déjà distribuées."
        },
        {
          "type": "p",
          "text": "Nous pouvons examiner les soumissions et refuser de publier, ou supprimer, tout contenu qui semble porter atteinte à des droits, contient du code malveillant, n'est pas propre à la diffusion, ou enfreint la loi ou les présentes Conditions. L'examen ne constitue ni une approbation ni une garantie de qualité, de sécurité ou de légalité."
        },
        {
          "type": "callout",
          "text": "**Jugez vous-même le contenu de tiers.** Les Skills et extensions proposés par la communauté ne sont pas créés par nous et nous n'offrons aucune garantie quant à leur fonctionnement, leur exactitude ou leur sécurité. Les pertes résultant de leur utilisation relèvent de la responsabilité du contributeur."
        },
        {
          "type": "p",
          "text": "Une fois les soumissions payantes ouvertes : lorsqu'une entrée payante est vendue, le créateur reçoit immédiatement 70 % de la valeur de la transaction en Credits (la plateforme conserve 30 %). L'attribution des Credits s'effectue au moment de la vente — sans demande, sans attente de règlement manuel. Les droits accordés via un code de rachat constituent une promotion financée par la plateforme et ne génèrent aucun partage pour le créateur."
        },
        {
          "type": "callout",
          "text": "**Les revenus des créateurs sont réglés en Credits. Ils ne peuvent être convertis en espèces ni retirés.** Les Credits peuvent être dépensés pour des articles de la place du marché, des déblocages de fonctionnalités et l'IA de la plateforme, et sont valables 24 mois à compter de leur attribution. Tenez-en compte lors de la tarification de votre soumission ; si ce mode de règlement ne vous convient pas, veuillez ne pas soumettre d'entrées payantes."
        },
        {
          "type": "p",
          "text": "Vous êtes responsable de votre situation fiscale concernant tout ce que vous gagnez via la place du marché. Nous n'effectuons aucune retenue à la source et nous n'établissons pas de documents fiscaux en votre nom."
        }
      ]
    },
    {
      "id": "payment",
      "title": "7. Credits : paiement, dépenses, fiscalité et annulation",
      "blocks": [
        {
          "type": "p",
          "text": "Les Credits constituent l'unique unité de compte de l'ensemble du Service. La recharge vous donne des Credits, utilisés directement pour l'IA de la plateforme, les achats de Skills et d'extensions ainsi que les déblocages de fonctionnalités — il n'y a pas d'étape d'« allocation » distincte. Le paiement est traité par Stripe ; le montant et la description affichés au moment du paiement prévalent."
        },
        {
          "type": "p",
          "text": "Les Credits se répartissent en deux catégories avec des droits différents :"
        },
        {
          "type": "table",
          "head": [
            "Catégorie",
            "Source",
            "Expiration",
            "Remboursable"
          ],
          "rows": [
            [
              "Credits rechargés",
              "Votre propre recharge",
              "N'expirent jamais",
              "Remboursables à la fermeture du compte"
            ],
            [
              "Credits attribués",
              "Revenus de créateur, cadeaux, codes de rachat",
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
