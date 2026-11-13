import { LEGAL_ENTITY, LEGAL_EFFECTIVE_DATE } from '@/lib/legal-entity';
import type { LegalDocument } from './types';

const E = LEGAL_ENTITY;

export const termsEn: LegalDocument = {
    eyebrow: 'Legal',
    title: 'Terms of Service',
    effectiveLabel: `Effective ${LEGAL_EFFECTIVE_DATE}`,
    intro: `These Terms form an agreement between you and ${E.nameEn} (${E.nameZh}) ("we", "us") covering the AI WorkDeck website (${E.site}), the desktop application, plugins, the Skill plaza and related services (together, the "Service"). By registering an account, generating an account key or otherwise using the Service, you confirm that you have read, understood and accepted these Terms.`,
    highlightsTitle: 'Read these first',
    highlights: [
        '**AI output is not legal advice.** We do not provide legal services and no attorney-client or agency relationship arises from your use of the Service. AI output may contain incorrect facts, repealed provisions and non-existent cases. You must verify it independently before relying on it.',
        '**You are responsible for what you send to the AI.** When you use the platform AI channel, your input is transmitted to a model provider outside mainland China. Do not submit state secrets, sensitive personal information, or material you are not permitted to disclose.',
        '**An account key is equivalent to your credentials.** It is displayed in full only once; the consequences of disclosure are yours. Revoke it in your account immediately if it leaks.',
        '**Credits granted by us (creator earnings, gifts, redemption codes) expire 24 months after they are credited and cannot be withdrawn.** Credits you top up yourself never expire and can be refunded when you close your account. Spending draws on the expiring balance first.',
        '**Our liability is capped** — see clause 12. That cap does not exclude liability for our wilful misconduct or gross negligence, nor any liability that cannot be excluded by law.',
        '**Disputes go to arbitration before the Beijing Arbitration Commission and the award is final** — see clause 16. Accepting these Terms means both you and we give up the right to litigate covered disputes in court.',
    ],
    tocTitle: 'Contents',
    sections: [
        {
            id: 'parties',
            title: '1. Parties and scope',
            blocks: [
                {
                    type: 'p',
                    text: `The Service is operated by ${E.nameEn} (${E.nameZh}), unified social credit code ${E.uscc}. Contact: ${E.contactEmail}.`,
                },
                {
                    type: 'p',
                    text: 'These Terms cover the website, the desktop application, the Office add-ins, the Skill and plugin plazas, and other related services we may offer. Parts of the desktop application released under an open-source license (see the LICENSE file in the code repository) are additionally governed by that license; where the license conflicts with these Terms, the license prevails for those parts.',
                },
                {
                    type: 'p',
                    text: 'These Terms exist in Chinese and English. In the event of any discrepancy, the Chinese version prevails.',
                },
            ],
        },
        {
            id: 'eligibility',
            title: '2. Who may use the Service',
            blocks: [
                {
                    type: 'p',
                    text: 'The Service is designed for practitioners and organizations working in law, compliance and adjacent fields, and assumes users capable of exercising professional judgement. You confirm that you have full capacity for civil conduct, or that you are duly authorised to use the Service on behalf of your organization.',
                },
                {
                    type: 'p',
                    text: 'We do not offer the Service to children under 14. If you are under 18, please read these Terms with your guardian and obtain their consent before using the Service.',
                },
            ],
        },
        {
            id: 'account',
            title: '3. Accounts and account keys',
            blocks: [
                {
                    type: 'p',
                    text: 'Registration requires a username, an email address and a password. You must provide accurate information and keep your credentials secure. Losses caused by your own failure to do so are yours to bear.',
                },
                {
                    type: 'p',
                    text: 'An account key (a string beginning with awdk_) connects the desktop application to your website account. We store only its hash, never the plaintext, so a lost key cannot be recovered — only replaced. Each account may hold at most ten active keys.',
                },
                {
                    type: 'callout',
                    text: '**Whoever holds your account key is treated as you.** Guard it as you would a password; do not transfer, sell or publish it. If it leaks, revoke it in your account immediately. Everything done, and every charge incurred, with that key before revocation is your responsibility.',
                },
                {
                    type: 'p',
                    text: 'We may suspend or close an account where reasonably necessary: breach of these Terms or of the law, use of the account to attack or abuse the Service, prolonged anomalous activity, or suspected fraud. Except in urgent cases we will notify you first.',
                },
            ],
        },
        {
            id: 'ai',
            title: '4. What the AI features are, and are not',
            blocks: [
                {
                    type: 'callout',
                    text: '**The Service is a tool, not a legal service.** We are not a law firm, we do not give legal advice, and no attorney-client, agency or other professional relationship arises from your use of the Service. Everything the AI produces — drafts, review comments, risk ratings, citation-check results — is working material for your consideration and is not a substitute for your own professional judgement.',
                },
                {
                    type: 'p',
                    text: 'You accept the inherent limits of large language models: output is generated statistically rather than retrieved, and may contain statements contrary to fact, provisions that have been repealed or amended, and cases that do not exist or do not say what is claimed (commonly called "hallucination"). Features such as citation checking reduce but cannot eliminate this risk.',
                },
                {
                    type: 'p',
                    text: 'Accordingly, you undertake to verify AI output independently before using it in any external deliverable, any advice to a client, or any filing with a judicial or administrative authority. Consequences of using unverified output are yours.',
                },
                {
                    type: 'p',
                    text: 'You must also observe the professional conduct and confidentiality rules that apply to you. Before submitting client or matter materials to the AI, you are responsible for deciding whether client consent is required and whether doing so is permitted in your jurisdiction and by your firm.',
                },
            ],
        },
        {
            id: 'content',
            title: '5. Your content and data',
            blocks: [
                {
                    type: 'p',
                    text: 'The desktop application is local-first: your documents, projects and work history stay on your own device by default. We do not upload, retain or access them.',
                },
                {
                    type: 'p',
                    text: 'The exceptions are features you trigger yourself. When you use the platform AI channel, the content you choose to send is processed by a model provider. When you use plugins that require network access (speech synthesis, document parsing), the relevant content goes to that provider. The Privacy Policy sets out these flows.',
                },
                {
                    type: 'p',
                    text: 'You warrant that what you submit to the Service contains no state secrets, no information you are not permitted to disclose, no material infringing third-party intellectual property or trade secrets, and nothing unlawful. Disputes, claims or penalties arising from your content are yours to bear, and you will compensate us for losses we suffer as a result.',
                },
                {
                    type: 'p',
                    text: 'You keep all rights in your own content. We do not use your documents to train models.',
                },
            ],
        },
        {
            id: 'marketplace',
            title: '6. Skill plaza and plugin plaza',
            blocks: [
                {
                    type: 'p',
                    text: 'You may submit entries to the Skill or plugin plaza. By submitting, you represent and warrant that the content is your own or fully licensed to you, that it infringes no third-party intellectual property, trade secret or other right, and that it contains no malicious code.',
                },
                {
                    type: 'p',
                    text: 'So that we can run the plaza, you grant us a worldwide, non-exclusive, sublicensable, royalty-free license to store, reproduce, display and distribute your submission, to make it available for installation and update, and to quote and display it as reasonably needed to promote the Service. The license ends when your content is removed from the plaza, without affecting copies already distributed.',
                },
                {
                    type: 'p',
                    text: 'We may review submissions and may decline to publish, or remove, content that appears to infringe, contains malicious code, is not fit to ship, or breaches the law or these Terms. Review is not an endorsement or warranty of quality, security or legality.',
                },
                {
                    type: 'callout',
                    text: '**Judge third-party content for yourself.** Community-contributed Skills and plugins are not built by us and we make no warranty as to their function, accuracy or security. Losses arising from their use are for the contributor to answer for.',
                },
                {
                    type: 'p',
                    text: 'When a paid entry sells, the creator immediately receives 70% of the transaction value as Credits (the platform retains 30%). Crediting happens at the moment of sale — no request, no waiting for manual settlement. Entitlements granted by redemption code are platform-funded promotion and generate no creator share.',
                },
                {
                    type: 'callout',
                    text: '**Creator earnings are settled in Credits. They cannot be converted to cash or withdrawn.** Credits can be spent on plaza items, feature unlocks and platform AI, and are valid for 24 months from crediting. Factor this in when you price a submission; if this settlement method is not acceptable to you, please do not submit paid entries.',
                },
            ],
        },
        {
            id: 'payment',
            title: '7. Credits: top-ups, spending and expiry',
            blocks: [
                {
                    type: 'p',
                    text: 'Credits are the single unit of account across the Service. Topping up gives you Credits, which are used directly for platform AI, Skill and plugin purchases and feature unlocks — there is no separate "allocation" step. Payment is processed through WeChat Pay; the amount and description shown at checkout govern.',
                },
                { type: 'p', text: 'Credits fall into two classes with different rights:' },
                {
                    type: 'table',
                    head: ['Class', 'Source', 'Expiry', 'Refundable'],
                    rows: [
                        ['Topped-up Credits', 'Your own top-up', 'Never expire', 'Refundable on account closure'],
                        ['Granted Credits', 'Creator earnings, gifts, redemption codes', '24 months from crediting', 'Not withdrawable or refundable'],
                    ],
                },
                {
                    type: 'callout',
                    text: '**Spending draws on granted Credits first, and within each class the soonest to expire goes first.** This order works in your favor: the balance that would expire is used up first. Your account page shows both balances and the next expiry date.',
                },
                {
                    type: 'p',
                    text: 'Credits are an accounting record of consideration paid. They are not a prepaid card: they bear no interest and cannot be transferred to another person.',
                },
                {
                    type: 'callout',
                    text: '**Platform AI is charged against Credits by actual usage.** We set a usage cap with the upstream model provider based on your Credits balance and periodically deduct usage that has occurred. Any excess arising from synchronisation lag is borne by us — we will not bill you for it, and your Credits will never go negative.',
                },
                {
                    type: 'p',
                    text: 'Digital goods (Skills, plugins, feature unlocks) are treated as performed once available for download. Within seven days of purchase you may request a refund if the item has a material defect — it cannot be installed, or differs substantially from its description — and we fail to remedy it within a reasonable period; where you paid in Credits, the Credits are returned. Problems caused by your own device, network or manner of use are not grounds for refund.',
                },
                {
                    type: 'p',
                    text: 'On closing your account you may ask for unspent topped-up Credits to be returned via the original payment channel, less payment-channel fees actually incurred. Granted Credits are not refundable.',
                },
                {
                    type: 'p',
                    text: 'We may change prices and plans. Changes apply only to orders placed after they take effect, never to completed transactions, and never to Credits you already hold.',
                },
            ],
        },
        {
            id: 'ip',
            title: '8. Intellectual property',
            blocks: [
                {
                    type: 'p',
                    text: 'Except as an open-source license provides otherwise, intellectual property in the Service and its software, interfaces, documentation, trade marks and logos belongs to us or the respective right holders. "AI WorkDeck" and its logo are our marks and may not be used in ways likely to cause confusion without our written permission.',
                },
                {
                    type: 'p',
                    text: 'We grant you a non-exclusive, non-transferable, revocable license to use the Service, subject to these Terms, for your own or your organization\'s business purposes. You may not reverse-engineer the Service (except as an open-source license permits), circumvent its licensing or billing mechanisms, scrape it in bulk, or resell, rent or timeshare it to third parties.',
                },
            ],
        },
        {
            id: 'thirdparty',
            title: '9. Third-party services',
            blocks: [
                {
                    type: 'p',
                    text: 'The Service depends on third parties: WeChat Pay for payments, OpenRouter for model routing, GitHub for installer and source hosting, and cloud providers for infrastructure. Each operates under its own terms.',
                },
                {
                    type: 'p',
                    text: 'If a third-party service is interrupted, changed or discontinued, the corresponding features may be affected. We will make reasonable efforts to find alternatives but are not responsible for the conduct of those third parties.',
                },
            ],
        },
        {
            id: 'availability',
            title: '10. Availability and changes',
            blocks: [
                {
                    type: 'p',
                    text: 'We work to keep the Service stable but do not promise it will be uninterrupted or error-free. We are not liable for interruptions caused by maintenance, upgrades, third-party failures, network attacks or force majeure. Planned maintenance will be announced in advance.',
                },
                {
                    type: 'p',
                    text: 'We may add, change or discontinue parts of the Service. If we discontinue something you have paid for, we will refund the unperformed portion pro rata.',
                },
                {
                    type: 'p',
                    text: 'Desktop updates come as in-app patches or as full installers, per the release notes page. You may decline updates, but older versions may lose online functionality as interfaces change.',
                },
            ],
        },
        {
            id: 'warranty',
            title: '11. No warranties',
            blocks: [
                {
                    type: 'p',
                    text: 'To the maximum extent permitted by law, the Service is provided "as is". We make no express or implied warranty of merchantability, fitness for a particular purpose, uninterrupted or error-free operation, nor any warranty as to the accuracy, completeness or suitability of AI output.',
                },
                {
                    type: 'p',
                    text: 'This clause does not exclude warranties that cannot be excluded by law.',
                },
            ],
        },
        {
            id: 'liability',
            title: '12. Limitation of liability',
            blocks: [
                {
                    type: 'callout',
                    text: '**To the maximum extent permitted by law, our total liability to you under these Terms and in connection with the Service is capped at the fees you actually paid us for the Service in the twelve months before the loss arose; if you have never paid, the cap is CNY 100.**',
                },
                {
                    type: 'p',
                    text: 'To the maximum extent permitted by law, we are not liable for lost profits, business interruption, loss of goodwill, data loss, or any other indirect, incidental or consequential loss — even if we were told such loss was possible.',
                },
                {
                    type: 'callout',
                    text: '**This clause does not apply to, and we remain liable at law for: our wilful misconduct or gross negligence; personal injury; and any other liability that may not be limited or excluded by law.**',
                },
                {
                    type: 'p',
                    text: 'You understand that this clause and clause 4 together form part of the basis on which the Service is offered: the price reflects the fact that liability is bounded in this way.',
                },
            ],
        },
        {
            id: 'indemnity',
            title: '13. Your indemnity',
            blocks: [
                {
                    type: 'p',
                    text: 'If we face a third-party claim, administrative penalty or proceeding because you breached these Terms or the law, infringed a third-party right, or because of content you submitted to the Service, you will compensate us for the losses actually incurred, including reasonable legal, litigation and arbitration costs.',
                },
            ],
        },
        {
            id: 'termination',
            title: '14. Termination',
            blocks: [
                {
                    type: 'p',
                    text: 'You may stop using the Service and close your account at any time. We will then handle your personal information as set out in the Privacy Policy, and your account keys stop working immediately.',
                },
                {
                    type: 'p',
                    text: 'We may terminate the Service to you if you seriously breach these Terms. Termination does not affect rights and obligations already accrued. Clauses 5, 8, 11 to 13 and 16 survive termination.',
                },
            ],
        },
        {
            id: 'changes',
            title: '15. Changes to these Terms',
            blocks: [
                {
                    type: 'p',
                    text: 'We may revise these Terms. For substantive revisions affecting your main rights and obligations, we will give at least seven days\' notice before they take effect, by website announcement or email.',
                },
                {
                    type: 'p',
                    text: 'Continuing to use the Service after a revision takes effect means you accept it. If you do not accept it, stop using the Service and you may close your account; for anything purchased but not yet performed, you may request a pro rata refund.',
                },
            ],
        },
        {
            id: 'disputes',
            title: '16. Governing law and disputes',
            blocks: [
                {
                    type: 'p',
                    text: 'These Terms — their formation, validity, interpretation, performance and any dispute about them — are governed by the laws of the People\'s Republic of China (for this purpose excluding the laws of Hong Kong SAR, Macao SAR and Taiwan).',
                },
                {
                    type: 'callout',
                    text: '**Any dispute arising from or in connection with these Terms shall be submitted to the Beijing Arbitration Commission for arbitration under its rules in force at the time. The seat is Beijing and the language is Chinese. The award is final and binding on both parties.**',
                },
                {
                    type: 'p',
                    text: 'Note that accepting this clause means both you and we give up the right to bring covered disputes before a court, and give up the right to proceed collectively.  If you are not willing to arbitrate, please do not use the Service.',
                },
                {
                    type: 'p',
                    text: 'The preceding paragraph does not prevent either party from applying to a competent court for interim measures, including preservation of assets, conduct and evidence.',
                },
            ],
        },
        {
            id: 'misc',
            title: '17. General',
            blocks: [
                {
                    type: 'p',
                    text: 'If any provision is held invalid or unenforceable, the rest remain in force, and that provision is to be read in the way closest to its original intent that is enforceable.',
                },
                {
                    type: 'p',
                    text: 'Our failure or delay in exercising a right under these Terms is not a waiver of it.',
                },
                {
                    type: 'p',
                    text: 'You may not assign your rights or obligations under these Terms without our written consent. We may assign them to a successor in a merger, division or transfer of assets, with prior notice to you.',
                },
                {
                    type: 'p',
                    text: `For any question about these Terms, write to ${E.contactEmail}.`,
                },
            ],
        },
    ],
};
