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
  "eyebrow": "Undang-undang",
  "title": "Terma Perkhidmatan",
  "effectiveLabel": "Berkuat kuasa {__T_LEGAL_EFFECTIVE_DATE__}",
  "intro": "Terma ini membentuk perjanjian antara anda dan  () (\"kami\") yang merangkumi laman web AI WorkDeck (), aplikasi desktop, plugin, plaza Skill dan perkhidmatan berkaitan (secara keseluruhannya, \"Perkhidmatan\"). Dengan mendaftarkan akaun, menjana kunci akaun atau menggunakan Perkhidmatan dengan cara lain, anda mengesahkan bahawa anda telah membaca, memahami dan menerima Terma ini.",
  "highlightsTitle": "Baca perkara ini terlebih dahulu",
  "highlights": [
    "**Output AI bukan nasihat undang-undang.** Kami tidak menawarkan perkhidmatan guaman dan tiada hubungan peguam-klien atau agensi timbul daripada penggunaan Perkhidmatan oleh anda. Output AI mungkin mengandungi fakat yang salah, peruntakan yang telah dimansuhkan dan kes yang tidak wujud. Anda mlu mengesahkannya secara bebas sebelum bergantung padanya.",
    "**Anda bertanggungjawab atas apa yang anda hantar kepada AI.** Apabila anda menggunakan saluran AI platform, input anda dihantar kepada penyedia model di luar tanah besar China. Jangan hantar rahsia negara, maklumat peribadi sensitif, atau bahan yang anda tidak dibenarkan untuk didedahkan.",
    "**Kunci akaun adalah setara dengan kredensial anda.** Ia hanya dipaparkan sepenuhnya sekali sahaja; akibat pendedahannya ditanggung oleh anda. Batalkan kunci tersebut dalam akaun anda dengan segera sekiranya ia bocor.",
    "**Credits yang diberikan oleh kami (pendapatan pencipta, hadiah, kod penebusan) tamat tempoh 24 bulan selepas dikreditkan dan tidak boleh ditarik balik.** Credits yang anda tambah sendiri tidak akan tamat tempoh dan boleh dikembalikan apabila anda menutup akaun anda. Perbelanjaan akan ditolak daripada baki yang tamat tempoh terlebih dahulu.",
    "**Liabiliti kami adalah terhad** — lihat klausa 12. Had tersebut tidak mengecualikan liabiliti atas salah laku sengaja atau kecuaian teruk kami, mahupun sebarang liabiliti yang tidak boleh dikecualikan oleh undang-undang.",
    "**Pertikaian dirujuk kepada arbitrasi di hadapan Suruhanjaya Arbitrase Beijing dan keputusannya adalah muktamad** — lihat klausa 16. Menerima Terma ini bermakna anda dan kami sama-sama melepaskan hak untuk membawa pertikaian berkenaan ke mahkamah."
  ],
  "tocTitle": "Kandungan",
  "sections": [
    {
      "id": "parties",
      "title": "1. Pihak-pihak dan skop",
      "blocks": [
        {
          "type": "p",
          "text": "Perkhidmatan ini dikendalikan oleh  (), kod kredit sosial bersatu . Hubungi: ."
        },
        {
          "type": "p",
          "text": "Terma ini merangkumi laman web, aplikasi desktop, tambahan Office, plaza Skill dan plugin, serta perkhidmatan berkaitan lain yang mungkin kami tawarkan. Bahagian aplikasi desktop yang dikeluarkan di bawah lesen sumber terbuka (lihat fail LICENSE dalam repositori kod) turut tertakluk kepada lesen tersebut; sekiranya lesen berkonflik dengan Terma ini, lesen tersebut diutamakan bagi bahagian tersebut."
        },
        {
          "type": "p",
          "text": "Terma ini wujud dalam bahasa Cina dan bahasa Inggeris. Sekiranya terdapat sebarang percanggahan, versi bahasa Cina diutamakan."
        }
      ]
    },
    {
      "id": "eligibility",
      "title": "2. Siapa yang boleh menggunakan Perkhidmatan",
      "blocks": [
        {
          "type": "p",
          "text": "Perkhidmatan ini direka untuk pengamal dan organisasi dalam bidang undang-undang, pematuhan dan bidang berkaitan, dan menganggap pengguna mampu menggunakan pertimbangan profesional. Anda mengesahkan bahawa anda mempunyai keupayaan penuh untuk bertindak dalam urusan sivil, atau bahawa anda diberikan kuasa yang sah untuk menggunakan Perkhidmatan bagi pihak organisasi anda."
        },
        {
          "type": "p",
          "text": "Kami tidak menawarkan Perkhidmatan ini kepada kanak-kanak bawah 14 tahun. Jika anda berumur bawah 18 tahun, sila baca Terma ini bersama penjaga anda dan dapatkan persetujuan mereka sebelum menggunakan Perkhidmatan."
        }
      ]
    },
    {
      "id": "account",
      "title": "3. Akaun dan kunci akaun",
      "blocks": [
        {
          "type": "p",
          "text": "Pendaftaran memerlukan nama pengguna, alamat e-mel dan kata laluan. Anda mesti memberikan maklumat yang tepat dan menjaga keselamatan kredensial anda. Kerugian yang disebabkan oleh kegagalan anda berbuat demikian adalah ditanggung oleh anda sendiri."
        },
        {
          "type": "p",
          "text": "Kunci akaun (rentetan yang bermula dengan awdk_) menghubungkan aplikasi desktop dengan akaun laman web anda. Kami hanya menyimpan cincangannya (hash), bukan teks asalnya, jadi kunci yang hilang tidak boleh dipulihkan — hanya boleh diganti. Setiap akaun boleh mempunyai paling banyak sepuluh kunci aktif."
        },
        {
          "type": "callout",
          "text": "**Sesiapa yang memegang kunci akaun anda dianggap sebagai anda.** Jagalah ia seperti kata laluan anda; jangan pindahkan, jual atau siarkannya. Jika ia bocor, batalkan serta-merta dalam akaun anda. Segala tindakan yang dilakukan, dan segala caj yang dikenakan, dengan kunci tersebut sebelum pembatalan adalah tanggungjawab anda."
        },
        {
          "type": "p",
          "text": "Kami boleh menggantung atau menutup akaun jika munasabah untuk berbuat demikian: pelanggaran Terma ini atau undang-undang, penggunaan akaun untuk menyerang atau menyalahgunakan Perkhidmatan, aktiviti tidak normal yang berpanjangan, atau disyaki penipuan. Kecuali dalam kes segera, kami akan memberitahu anda terlebih dahulu."
        }
      ]
    },
    {
      "id": "ai",
      "title": "4. Apakah ciri AI ini, dan apakah bukannya",
      "blocks": [
        {
          "type": "callout",
          "text": "**Perkhidmatan ini adalah alat, bukan perkhidmatan undang-undang.** Kami bukan firma guaman, kami tidak memberi nasihat guaman, dan tiada hubangan peguam-klien, agensi atau hubungan profesional lain terhasil daripada penggunaan Perkhidmatan ini oleh anda. Segala yang dihasilkan oleh AI — draf, komen semakan, penilaian risiko, keputusan semakan petikan — adalah bahan kerja untuk pertimbangan anda dan bukan pengganti pertimbangan profesional anda sendiri."
        },
        {
          "type": "p",
          "text": "Anda menerima had yang wujud dalam model bahasa besar: output dijana secara statistik dan bukannya dicapai semula, dan mungkin mengandungi kenyataan yang bertentangan dengan fakta, peruntukan yang telah dimansuhkan atau dipinda, dan kes yang tidak wujud atau tidak menyatakan seperti yang didakwa (biasanya dipanggil \"halusinasi\"). Ciri seperti semakan petikan mengurangkan risiko ini tetapi tidak boleh menghapuskannya sepenuhnya."
        },
        {
          "type": "p",
          "text": "Oleh itu, anda berjanji untuk mengesahkan output AI secara bebas sebelum menggunakannya dalam sebarang hasil kerja luaran, sebarang nasihat kepada klien, atau sebarang pemfailan dengan pihak berkuasa kehakiman atau pentadbiran. Akibat daripada menggunakan output yang tidak disahkan adalah tanggungan anda."
        },
        {
          "type": "p",
          "text": "Anda juga mesti mematuhi peraturan tatatertib profesional dan kerahsiaan yang terpakai kepada anda. Sebelum menghantar bahan klien atau kes kepada AI, anda bertanggungjawab memutuskan sama ada persetujuan klien diperlukan dan sama ada berbuat demikian dibenarkan di bidang kuasa anda dan oleh firma anda."
        }
      ]
    },
    {
      "id": "content",
      "title": "5. Kandungan dan data anda",
      "blocks": [
        {
          "type": "p",
          "text": "Aplikasi desktop adalah local-first: dokumen, projek dan sejarah kerja anda kekal pada peranti anda sendiri secara lalai. Kami tidak memuat naik, menyimpan atau mengaksesnya."
        },
        {
          "type": "p",
          "text": "Pengecualian adalah ciri yang anda cetuskan sendiri. Apabila anda menggunakan saluran AI platform, kandungan yang anda pilih untuk dihantar akan diproses oleh penyedia model. Apabila anda menggunakan pemalam yang memerlukan akses rangkaian (sintesis pertuturan, penghuraian dokumen), kandungan berkaitan dihantar kepada penyedia tersebut. Dasar Privasi menyatakan aliran ini."
        },
        {
          "type": "p",
          "text": "Anda menjamin bahawa apa yang anda hantar kepada Perkhidmatan ini tidak mengandungi rahsia negara, tiada maklumat yang anda tidak dibenarkan dedahkan, tiada bahan yang melanggar harta intelek atau rahsia perdagangan pihak ketiga, dan tiada apa-apa yang menyalahi undang-undang. Pertikaian, tuntutan atau penalti yang timbul daripada kandungan anda adalah tanggungan anda, dan anda akan menggantikan kerugian yang kami alami akibatnya."
        },
        {
          "type": "p",
          "text": "Anda mengekalkan semua hak ke atas kandungan anda sendiri. Kami tidak menggunakan dokumen anda untuk melatih model."
        }
      ]
    },
    {
      "id": "marketplace",
      "title": "6. Plaza Skill dan plaza pemalam",
      "blocks": [
        {
          "type": "p",
          "text": "Anda boleh menghantar penyertaan ke plaza Skill atau pemalam. Dengan menghantar, anda menyatakan dan menjamin bahawa kandungan itu milik anda atau dilesenkan sepenuhnya kepada anda, bahawa ia tidak melanggar harta intelek, rahsia perdagangan atau hak pihak ketiga lain, dan bahawa ia tidak mengandungi kod berniat jahat."
        },
        {
          "type": "p",
          "text": "Supaya kami dapat mengendalikan plaza, anda memberikan kami lesen seluruh dunia, bukan eksklusif, boleh disublesenkan, tanpa royalti untuk menyimpan, membiak, memaparkan dan mengedarkan penyertaan anda, menjadikannya tersedia untuk pemasangan dan kemas kini, serta memetik dan memaparkannya sebagaimana yang munasabah diperlukan untuk mempromosikan Perkhidmatan ini. Lesen berakhir apabila kandungan anda dibuang daripada plaza, tanpa menjejaskan salinan yang telah diedarkan."
        },
        {
          "type": "p",
          "text": "Kami boleh menyemak penyertaan dan boleh menolak untuk menerbitkan, atau membuang, kandungan yang nampaknya melanggar hak, mengandungi kod berniat jahat, tidak sesuai untuk dilancarkan, atau melanggar undang-undang atau Terma ini. Semakan bukanlah sokongan atau jaminan terhadap kualiti, keselamatan atau kesahan."
        },
        {
          "type": "callout",
          "text": "**Nilai kandungan pihak ketiga sendiri.** Skill dan pemalam sumbangan komuniti tidak dibina oleh kami dan kami tidak memberi apa-apa jaminan terhadap fungsi, ketepatan atau keselamatannya. Kerugian yang timbul daripada penggunaannya adalah untuk disahkan oleh penyumbang."
        },
        {
          "type": "p",
          "text": "Apabila penyertaan berbayar terjual, pencipta serta-merta menerima 70% daripada nilai transaksi sebagai Credits (platform mengekalkan 30%). Perekodan Credits berlaku pada saat jualan — tiada permintaan, tiada menunggu penyelesaian manual. Hak yang diberikan melalui kod penebusan adalah promosan dibiayai oleh platform dan tidak menjana bahagian pencipta."
        },
        {
          "type": "callout",
          "text": "**Pendapatan pencipta diselaraskan dalam Credits. Ia tidak boleh ditukar kepada wang tunai atau dikeluarkan.** Credits boleh dibelanjakan untuk item plaza, pembukaan ciri dan AI platform, dan sah selama 24 bulan dari tarikh perekodan. Ambil kira perkara ini apabila anda menetapkan harga penyertaan; jika kaedah penyelesaian ini tidak boleh diterima oleh anda, sila jangan hantar penyertaan berbayar."
        }
      ]
    },
    {
      "id": "payment",
      "title": "7. Credits: tambah nilai, perbelanjaan dan luput",
      "blocks": [
        {
          "type": "p",
          "text": "Credits adalah unit akaun tunggal di seluruh Perkhidmatan ini. Tambah nilai memberikan anda Credits, yang digunakan secara terus untuk AI platform, pembelian Skill dan pemalam serta pembukaan ciri — tiada langkah \"peruntukan\" berasingan. Pembayaran diproses melalui WeChat Pay; jumlah dan perihal yang dipaparkan semasa pembayaran adalah yang terpakai."
        },
        {
          "type": "p",
          "text": "Credits terbahagi kepada dua kelas dengan hak yang berbeza:"
        },
        {
          "type": "table",
          "head": [
            "Kelas",
            "Sumber",
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
