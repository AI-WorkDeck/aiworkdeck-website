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
  "title": "Privacy Policy",
  "effectiveLabel": "Effective {__T_LEGAL_EFFECTIVE_DATE__}",
  "intro": "This policy explains how  () collects, uses, stores and discloses personal information when you use the AI WorkDeck website and desktop application, and what rights you have. We suggest reading it in full; if you only want the gist, the summary below covers it.",
  "highlightsTitle": "The short version",
  "highlights": [
    "**The Office/WPS add-in uses cloud processing.** The current document, necessary conversation history and references you select reach our hosted backend, then Alibaba Cloud Model Studio and the inference provider serving your selected model. Raw document bodies use transient memory; user messages, AI replies and reasoning remain until you delete the conversation. See clauses 6 and 8.",
    "Los documentos, proyectos e historial de trabajo del escritorio permanecen en su dispositivo. Al invocar la IA de la plataforma, los textos, fragmentos, imágenes y contexto necesarios pasan por nuestra pasarela china a Model Studio. El almacenamiento local no significa que las solicitudes eviten nuestros servidores.",
    "**Six platform-sourced services do pass through our servers** (text recognition, web search, company registry data, securities and financial data, statute and case law search, meeting transcription): we buy from the vendor on your behalf so you need no key of your own, and the content each call requires is relayed through us to that vendor. **All six vendors are inside mainland China, so this tier involves no cross-border transfer.** Only meeting audio is held briefly on our side, and it is deleted once transcription finishes. Any of them can be switched to your own key or turned off. See clauses 2, 6, 7 and 8.",
    "**The site sets exactly one cookie** (`awd_session`, to keep you signed in). There is no third-party analytics, advertising or tracking code, and web fonts are self-hosted, so no request goes to a third party.",
    "**Desktop telemetry is anonymous**: a random install identifier, the app version and whitelisted event names. No IP address is stored, nothing is linked to your account, no document content is included, and it can be switched off.",
    "El acceso por Pekín no implica que toda inferencia ocurra en China continental. La ubicación depende del despliegue del modelo elegido; los modelos China Elastic Zone pueden procesar datos fuera de China continental. El acceso al sitio desde el extranjero sigue usando un nodo de caché en Singapur.",
    "**To exercise your rights** (access, correction, deletion, account closure, withdrawal of consent), write to . We respond within fifteen working days."
  ],
  "tocTitle": "Contents",
  "sections": [
    {
      "id": "controller",
      "title": "1. Who we are",
      "blocks": [
        {
          "type": "p",
          "text": "Personal information handler:  (), unified social credit code ."
        },
        {
          "type": "p",
          "text": "For anything concerning personal information protection, contact . The same address reaches the person responsible for personal information protection."
        },
        {
          "type": "p",
          "text": "This policy covers the AI WorkDeck website, desktop application, Office add-ins and related services. It exists in Chinese and English; in the event of any discrepancy, the Chinese version prevails."
        }
      ]
    },
    {
      "id": "collect",
      "title": "2. What we collect",
      "blocks": [
        {
          "type": "p",
          "text": "We collect on a \"no more than needed\" basis. The table sets out what we collect, why, and on what basis."
        },
        {
          "type": "table",
          "head": [
            "Context",
            "Information",
            "Purpose",
            "Basis"
          ],
          "rows": [
            [
              "Registration",
              "Username, email, password, display name, bio (optional)",
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
              "Credenciales limitadas y autorización de la cuenta, modelos, uso y registros de liquidación",
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
            "Las conversaciones de escritorio pasan por la pasarela china al invocar la IA de la plataforma; sus registros de facturación no guardan el contenido. La conservación y eliminación de conversaciones de complementos se rigen por las cláusulas 6 y 8.",
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
          "text": "La IA de la plataforma del sitio chino (chat de escritorio, complementos Office/WPS y redacción de Skills con IA) pasa por el servidor chino de AI WorkDeck hasta el acceso de Pekín de Alibaba Cloud Model Studio y el proveedor del modelo. El registro de facturación de la pasarela guarda cuenta, modelo, uso y costes, no el contenido reenviado. Se mantienen las reglas existentes de conservación de conversaciones de complementos y Skills. Model Studio y los proveedores de inferencia aplican sus propias políticas de conservación, entrenamiento y ubicación. Las reglas de nuestra pasarela no garantizan la retención cero por terceros. Despliegue: https://help.aliyun.com/zh/model-studio/beijing-access-information"
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
              "Alibaba Cloud Model Studio y los proveedores efectivos de los modelos",
              "Pregunta actual, historial necesario, fragmentos de archivos e imágenes",
              "Inferencia, medición del uso y liquidación",
              "Acceso por Pekín; procesamiento según el despliegue del modelo, posiblemente fuera de China continental"
            ],
            [
              "GitHub, Inc.",
              "Network request data when downloading installers",
              "Host installers and open-source code",
              "Estados Unidos"
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
          "text": "La IA de la plataforma del sitio chino (chat de escritorio, complementos Office/WPS y redacción de Skills con IA) pasa por el servidor chino de AI WorkDeck hasta el acceso de Pekín de Alibaba Cloud Model Studio y el proveedor del modelo. El registro de facturación de la pasarela guarda cuenta, modelo, uso y costes, no el contenido reenviado. Se mantienen las reglas existentes de conservación de conversaciones de complementos y Skills. El acceso por Pekín no implica que toda inferencia ocurra en China continental. La ubicación depende del despliegue del modelo elegido; los modelos China Elastic Zone pueden procesar datos fuera de China continental. El acceso al sitio desde el extranjero sigue usando un nodo de caché en Singapur."
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
            "El acceso por Pekín no implica que toda inferencia ocurra en China continental. La ubicación depende del despliegue del modelo elegido; los modelos China Elastic Zone pueden procesar datos fuera de China continental. El acceso al sitio desde el extranjero sigue usando un nodo de caché en Singapur.",
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
          "text": "Su propia clave usa la ruta y las políticas del proveedor configurado; los modelos totalmente locales procesan el contenido en su dispositivo. Consulte el despliegue del modelo para conocer los lugares de procesamiento. Los instaladores siguen distribuyéndose por GitHub."
        },
        {
          "type": "p",
          "text": "Conforme a la Ley de Protección de Información Personal, le informamos por separado el nombre y los datos de contacto de cada destinatario extranjero, la finalidad y el método de tratamiento, las categorías de información implicadas y cómo ejercer sus derechos frente a dicho destinatario, y obtenemos su consentimiento independiente. Puede retirar ese consentimiento en cualquier momento; en tal caso, detendremos la transferencia correspondiente, aunque las funciones relacionadas dejarán de estar disponibles."
        }
      ]
    },
    {
      "id": "retention",
      "title": "8. Cuánto tiempo lo conservamos",
      "blocks": [
        {
          "type": "callout",
          "text": "**Conservación de documentos y conversaciones del complemento.** Los cuerpos de documentos insertados y los argumentos/resultados brutos de las herramientas se utilizan para el turno actual y para cachés de memoria transitorias; no se almacenan en la cola de solicitudes ni en el historial de conversaciones. El complemento no crea automáticamente resúmenes duraderos de las conversaciones. Los cuerpos de entrada en cola caducan en un plazo máximo de 30 minutos y pueden eliminarse antes o perderse tras un reinicio, en cuyo caso será necesario volver a subirlos. Los mensajes del usuario, las respuestas de la IA y el razonamiento permanecen como historial de conversación **hasta que el usuario elimine la conversación, sin caducidad automática independiente**. Esto incluye el texto de documentos pegado por el usuario o citado por la IA. La eliminación de la conversación también elimina las solicitudes de la cola y los resúmenes derivados, y borra las cachés de documentos; los registros de uso de facturación se conservan. Las copias ya replicadas en un proyecto de escritorio se rigen por las reglas de dicho proyecto y no se borran de forma remota al eliminar la conversación en la nube. Las versiones anteriores almacenaban los cuerpos insertados en la cola y extractos de herramientas y resúmenes en el almacenamiento de conversaciones. Esta actualización elimina los cuerpos insertados históricos de la cola de solicitudes activa. También elimina los extractos brutos de herramientas y los resúmenes derivados de las conversaciones que aún puedan identificarse como conversaciones del complemento de Office/WPS mediante sus registros de origen de solicitud. Las conversaciones históricas sin esos registros de origen no pueden clasificarse con fiabilidad y no quedan cubiertas por esta limpieza específica de Office. Las copias de seguridad operativas y el material ya enviado a terceros son un asunto distinto; esto no constituye una promesa de borrado retroactivo de todas las copias."
        },
        {
          "type": "table",
          "head": [
            "Categoría",
            "Conservación"
          ],
          "rows": [
            [
              "Información de la cuenta",
              "Mientras exista la cuenta; eliminada o anonimizada dentro de los 30 días posteriores al cierre"
            ],
            [
              "Tokens de sesión",
              "30 días, después caducan automáticamente"
            ],
            [
              "Hashes de clave de cuenta",
              "Eliminados al revocarse o al cerrar la cuenta"
            ],
            [
              "Registros de pedidos, contabilidad y facturación",
              "Al menos 10 años desde la finalización de la transacción (artículo 29 de las Normas de Aplicación de la Ley de Recaudación y Administración Fiscal); cerrar su cuenta no acorta este plazo"
            ],
            [
              "Envíos a la Plaza",
              "Eliminados dentro de los 90 días posteriores a su retirada; las copias ya distribuidas no se ven afectadas"
            ],
            [
              "Contenido retransmitido en llamadas de origen de la plataforma",
              "No se conserva. Pasa por nuestros servidores solo mientras se realiza esa llamada"
            ],
            [
              "Archivos de audio de reuniones",
              "Eliminados por el programa en cuanto finaliza la transcripción o la tarea falla; una regla de ciclo de vida de 24 horas en el almacenamiento de objetos borra cualquier resto. La transcripción no se conserva de nuestro lado una vez devuelta a la aplicación de escritorio"
            ],
            [
              "Telemetría anónima",
              "24 meses, después se elimina de forma continuada"
            ],
            [
              "Registros del servidor",
              "6 meses (el artículo 21 de la Ley de Ciberseguridad exige no menos de 6 meses)"
            ]
          ]
        },
        {
          "type": "p",
          "text": "Transcurridos estos plazos, eliminamos o anonimizamos. Cuando la ley exija plazos más largos, prevalece la ley."
        }
      ]
    },
    {
      "id": "security",
      "title": "9. Cómo lo protegemos",
      "blocks": [
        {
          "type": "ul",
          "items": [
            "En tránsito: HTTPS está aplicado en todo el sitio;",
            "Contraseñas: almacenadas como hashes scrypt con sal — no podemos recuperar su contraseña original;",
            "Claves de cuenta: solo se almacenan el hash y el prefijo; el texto plano se le muestra una vez al generarla y después no existe en ningún lugar de nuestros sistemas;",
            "Claves de modelos: almacenadas cifradas;",
            "Control de acceso: el acceso a producción está limitado a quienes lo necesitan;",
            "Durabilidad: los datos financieros se escriben transaccionalmente y se respaldan con regularidad."
          ]
        },
        {
          "type": "p",
          "text": "Ningún sistema es completamente seguro. Si la información personal se filtra, altera o pierde de forma que pueda perjudicarle, tomaremos medidas correctivas de inmediato y le notificaremos a usted y a las autoridades competentes según lo exija la ley."
        }
      ]
    },
    {
      "id": "rights",
      "title": "10. Sus derechos",
      "blocks": [
        {
          "type": "p",
          "text": "En virtud de la Ley de Protección de Información Personal, usted tiene los siguientes derechos sobre la información personal que tratamos:"
        },
        {
          "type": "ul",
          "items": [
            "**Acceso y copia** — conocer qué información tenemos sobre usted y obtener una copia;",
            "**Rectificación y complemento** — corregir la información inexacta o incompleta; los datos de la cuenta también pueden editarse por usted mismo;",
            "**Supresión** — cuando la finalidad se haya cumplido, usted retire su consentimiento o hayamos tratado los datos de forma ilícita;",
            "**Portabilidad** — transferir su información a otro responsable que usted designe, siempre que se cumplan las condiciones establecidas por la autoridad nacional de ciberespacio;",
            "**Retirada del consentimiento** — para cualquier tratamiento basado en el consentimiento, como la telemetría y las transferencias transfronterizas;",
            "**Limitación u oposición** — solicitarnos limitar o rechazar determinados tratamientos;",
            "**Explicación** — solicitarnos que expliquemos esta política y nuestras normas de tratamiento;",
            "**Cierre de su cuenta** — en cualquier momento, tras lo cual trataremos su información según lo establecido en la cláusula 8."
          ]
        },
        {
          "type": "p",
          "text": "Cómo ejercerlos: edite sus datos y revoque las claves de cuenta por usted mismo en su cuenta; para cualquier otra cosa, escriba a identificando su cuenta y lo que desea. Es posible que le pidamos verificar primero su identidad. Respondemos en un plazo de quince días hábiles y le explicaremos si una solicitud compleja requiere más tiempo."
        },
        {
          "type": "p",
          "text": "Un familiar directo de un usuario fallecido puede ejercer los derechos de acceso, copia, rectificación y supresión sobre la información personal pertinente de dicho usuario, salvo que el usuario haya dispuesto otra cosa en vida."
        }
      ]
    },
    {
      "id": "minors",
      "title": "11. Menores",
      "blocks": [
        {
          "type": "p",
          "text": "El Servicio está dirigido a profesionales y no se ofrece a menores de 14 años. No recopilamos deliberadamente información personal de niños. Si descubrimos que la hemos recopilado sin el consentimiento previo del tutor, la eliminaremos de inmediato."
        },
        {
          "type": "p",
          "text": "Los tutores que tengan conocimiento de tal caso pueden contactarnos en ."
        }
      ]
    },
    {
      "id": "changes",
      "title": "12. Cambios en esta política",
      "blocks": [
        {
          "type": "p",
          "text": "Podemos revisar esta política. Para cambios sustanciales en las finalidades, métodos o categorías de información, le notificaremos mediante anuncio en el sitio web o correo electrónico antes de que entren en vigor, y solicitaremos un nuevo consentimiento cuando la ley lo exija."
        },
        {
          "type": "p",
          "text": "Las versiones anteriores están disponibles a petición por correo electrónico."
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
