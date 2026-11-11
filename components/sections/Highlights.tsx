import Image from 'next/image';
import { toBaseLocale, type Locale } from '@/i18n-config';
import { getDictionary } from '@/get-dictionary';

export function Highlights({ lang, dict }: { lang: Locale; dict: Awaited<ReturnType<typeof getDictionary>> }) {
  const isZh = toBaseLocale(lang) === 'zh';
  const features = [
    { ...dict.common.features.ai, image: isZh ? '/images/card-ai-agent.png' : '/images/feature-agent-en.png', width: isZh ? 768 : 1140, height: isZh ? 512 : 1520 },
    { ...dict.common.features.oneStop, image: isZh ? '/images/card-workdeck.png' : '/images/feature-workspace-en.png', width: isZh ? 768 : 2480, height: isZh ? 512 : 1700 },
    { ...dict.common.features.ecosystem, image: isZh ? '/images/card-plugins.png' : '/images/feature-plugins-en.png', width: isZh ? 768 : 2500, height: isZh ? 512 : 940 },
  ];
  return <section className="community-features" id="product">
    <div className="edition-container">
      <h2>{dict.common.features.sectionTitleLead}<br />{dict.common.features.sectionTitleTail}</h2>
      <div className="community-feature-grid">{features.map(feature => <article key={feature.title}>
        <div className="community-feature-image"><Image src={feature.image} width={feature.width} height={feature.height} sizes="(max-width: 720px) 94vw, 360px" alt={feature.title} /></div>
        <h3>{feature.title}</h3><p className="feature-subtitle">{feature.subtitle}</p><p>{feature.desc1}</p><p>{feature.desc2}</p>
      </article>)}</div>
      {dict.common.features.demoDisclaimer && <p className="mt-6 text-xs text-neutral-gray-medium">{dict.common.features.demoDisclaimer}</p>}
    </div>
  </section>;
}
