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
          "text": "Estos Términos existen en chino e inglés. En caso de discrepancia, prevalecerá la versión en chino."
        }
      ]
    },
    {
      "id": "eligibility",
      "title": "2. Quién puede utilizar el Servicio",
      "blocks": [
        {
          "type": "p",
          "text": "El Servicio está diseñado para profesionales y organizaciones que trabajan en el ámbito jurídico, el cumplimiento normativo y áreas afines, y presupone usuarios capaces de ejercer un juicio profesional. Usted confirma que tiene plena capacidad de obrar o que está debidamente autorizado a utilizar el Servicio en nombre de su organización."
        },
        {
          "type": "p",
          "text": "No ofrecemos el Servicio a menores de 14 años. Si usted es menor de 18 años, lea estos Términos junto con su tutor y obtenga su consentimiento antes de utilizar el Servicio."
        }
      ]
    },
    {
      "id": "account",
      "title": "3. Cuentas y claves de cuenta",
      "blocks": [
        {
          "type": "p",
          "text": "El registro requiere un nombre de usuario, una dirección de correo electrónico y una contraseña. Debe facilitar información veraz y mantener sus credenciales seguras. Las pérdidas causadas por su propio incumplimiento serán de su exclusiva responsabilidad."
        },
        {
          "type": "p",
          "text": "Una clave de cuenta (una cadena que comienza por awdk_) conecta la aplicación de escritorio con su cuenta del sitio web. Solo almacenamos su hash, nunca el texto en claro, por lo que una clave perdida no puede recuperarse, solo reemplazarse. Cada cuenta puede tener como máximo diez claves activas."
        },
        {
          "type": "callout",
          "text": "**Quien posea su clave de cuenta será tratado como usted.** Guárdela como protegería una contraseña; no la transfiera, venda ni publique. Si se filtra, revóquela de inmediato en su cuenta. Todo lo que se haga, y todo cargo que se genere, con dicha clave antes de su revocación es responsabilidad suya."
        },
        {
          "type": "p",
          "text": "Podemos suspender o cerrar una cuenta cuando sea razonablemente necesario: incumplimiento de estos Términos o de la ley, uso de la cuenta para atacar o abusar del Servicio, actividad anómala prolongada o sospecha de fraude. Salvo en casos urgentes, le notificaremos primero."
        }
      ]
    },
    {
      "id": "ai",
      "title": "4. Qué son y qué no son las funciones de IA",
      "blocks": [
        {
          "type": "callout",
          "text": "**El Servicio es una herramienta, no un servicio jurídico.** No somos un despacho de abogados, no ofrecemos asesoramiento jurídico y del uso del Servicio no surge ninguna relación profesional de abogado-cliente, de mandato ni de otro tipo. Todo lo que la IA produce —borradores, comentarios de revisión, valoraciones de riesgo, resultados de verificación de citas— es material de trabajo para su consideración y no sustituye su propio juicio profesional."
        },
        {
          "type": "p",
          "text": "Usted acepta los límites inherentes a los grandes modelos de lenguaje: el resultado se genera de forma estadística y no recuperada, y puede contener afirmaciones contrarias a los hechos, disposiciones derogadas o modificadas y casos que no existen o que no dicen lo que se afirma (lo que se conoce habitualmente como \"alucinación\"). Funciones como la verificación de citas reducen, pero no pueden eliminar, este riesgo."
        },
        {
          "type": "p",
          "text": "En consecuencia, usted se compromete a verificar de forma independiente el resultado de la IA antes de utilizarlo en cualquier entregable externo, cualquier asesoramiento a un cliente o cualquier presentación ante una autoridad judicial o administrativa. Las consecuencias del uso de resultados no verificados son suyas."
        },
        {
          "type": "p",
          "text": "También debe observar las normas deontológicas y de confidencialidad que le sean aplicables. Antes de enviar al AI materiales de clientes o asuntos, es usted responsable de decidir si se requiere el consentimiento del cliente y si hacerlo está permitido en su jurisdicción y por su despacho."
        }
      ]
    },
    {
      "id": "content",
      "title": "5. Su contenido y sus datos",
      "blocks": [
        {
          "type": "p",
          "text": "La aplicación de escritorio es local-first: sus documentos, proyectos e historial de trabajo permanecen en su propio dispositivo por defecto. No los subimos, ni los conservamos, ni accedemos a ellos."
        },
        {
          "type": "p",
          "text": "Las excepciones son las funciones que usted mismo activa. Cuando utiliza el canal de IA de la plataforma, el contenido que elija enviar es procesado por un proveedor de modelos. Cuando utiliza plugins que requieren acceso a la red (síntesis de voz, análisis de documentos), el contenido pertinente se envía a dicho proveedor. La Política de Privacidad describe estos flujos."
        },
        {
          "type": "p",
          "text": "Usted garantiza que lo que envía al Servicio no contiene secretos de Estado, ni información cuya divulgación no le esté permitida, ni material que infrinja derechos de propiedad intelectual de terceros o secretos comerciales, ni nada ilícito. Las disputas, reclamaciones o sanciones derivadas de su contenido son de su responsabilidad, y nos compensará por las pérdidas que suframos como consecuencia."
        },
        {
          "type": "p",
          "text": "Usted conserva todos los derechos sobre su propio contenido. No utilizamos sus documentos para entrenar modelos."
        }
      ]
    },
    {
      "id": "marketplace",
      "title": "6. Plaza de Skills y plaza de plugins",
      "blocks": [
        {
          "type": "p",
          "text": "Puede enviar entradas a la plaza de Skills o de plugins. Al enviarlas, declara y garantiza que el contenido es suyo o está plenamente licenciado a su favor, que no infringe derechos de propiedad intelectual, secretos comerciales u otros derechos de terceros, y que no contiene código malicioso."
        },
        {
          "type": "p",
          "text": "Para poder operar la plaza, usted nos otorga una licencia mundial, no exclusiva, sublicenciable y libre de regalías para almacenar, reproducir, exhibir y distribuir su envío, ponerlo a disposición para su instalación y actualización, y citarlo y exhibirlo según sea razonablemente necesario para promover el Servicio. La licencia finaliza cuando su contenido se retira de la plaza, sin afectar a las copias ya distribuidas."
        },
        {
          "type": "p",
          "text": "Podemos revisar los envíos y podemos negarnos a publicar, o retirar, contenido que parezca infractor, que contenga código malicioso, que no sea apto para su publicación o que infrinja la ley o estos Términos. La revisión no constituye un respaldo ni una garantía de calidad, seguridad o legalidad."
        },
        {
          "type": "callout",
          "text": "**Valore usted mismo el contenido de terceros.** Los Skills y plugins aportados por la comunidad no están creados por nosotros y no ofrecemos garantía alguna sobre su funcionamiento, exactitud o seguridad. Las pérdidas derivadas de su uso serán responsabilidad del colaborador."
        },
        {
          "type": "p",
          "text": "Cuando se vende una entrada de pago, el creador recibe de inmediato el 70% del valor de la transacción en forma de Credits (la plataforma retiene el 30%). El abono se realiza en el momento de la venta, sin solicitudes ni esperas de liquidación manual. Los derechos otorgados mediante códigos de canje son promociones financiadas por la plataforma y no generan participación para el creador."
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
          "text": "We grant you a non-exclusive, non-transferable, revocable license to use the Service, subject to these Terms, for your own or your organization's business purposes. You may not reverse-engineer the Service (except as an open-source license permits), circumvent its licensing or billing mechanisms, scrape it in bulk, or resell, rent or timeshare it to third parties."
        }
      ]
    },
    {
      "id": "thirdparty",
      "title": "9. Third-party services",
      "blocks": [
        {
          "type": "p",
          "text": "The Service depends on third parties: WeChat Pay for payments, OpenRouter for model routing, GitHub for installer and source hosting, and cloud providers for infrastructure. Each operates under its own terms."
        },
        {
          "type": "p",
          "text": "If a third-party service is interrupted, changed or discontinued, the corresponding features may be affected. We will make reasonable efforts to find alternatives but are not responsible for the conduct of those third parties."
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
          "text": "We may add, change or discontinue parts of the Service. If we discontinue something you have paid for, we will refund the unperformed portion pro rata."
        },
        {
          "type": "p",
          "text": "Desktop updates come as in-app patches or as full installers, per the release notes page. You may decline updates, but older versions may lose online functionality as interfaces change."
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
          "text": "This clause does not exclude warranties that cannot be excluded by law."
        }
      ]
    },
    {
      "id": "liability",
      "title": "12. Limitation of liability",
      "blocks": [
        {
          "type": "callout",
          "text": "**To the maximum extent permitted by law, our total liability to you under these Terms and in connection with the Service is capped at the fees you actually paid us for the Service in the twelve months before the loss arose; if you have never paid, the cap is CNY 100.**"
        },
        {
          "type": "p",
          "text": "To the maximum extent permitted by law, we are not liable for lost profits, business interruption, loss of goodwill, data loss, or any other indirect, incidental or consequential loss — even if we were told such loss was possible."
        },
        {
          "type": "callout",
          "text": "**This clause does not apply to, and we remain liable at law for: our wilful misconduct or gross negligence; personal injury; and any other liability that may not be limited or excluded by law.**"
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
          "text": "If we face a third-party claim, administrative penalty or proceeding because you breached these Terms or the law, infringed a third-party right, or because of content you submitted to the Service, you will compensate us for the losses actually incurred, including reasonable legal, litigation and arbitration costs."
        }
      ]
    },
    {
      "id": "termination",
      "title": "14. Termination",
      "blocks": [
        {
          "type": "p",
          "text": "You may stop using the Service and close your account at any time. We will then handle your personal information as set out in the Privacy Policy, and your account keys stop working immediately."
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
