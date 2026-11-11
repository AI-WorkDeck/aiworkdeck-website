'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState, type KeyboardEvent } from 'react';
import { ArrowRight, ArrowUpRight, Blocks, FolderOpen, Landmark, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { toBaseLocale, type Locale } from '@/i18n-config';
import type { getDictionary } from '@/get-dictionary';

type WorkspaceCopy = Awaited<ReturnType<typeof getDictionary>>['workspacePage'];

export function WorkspaceTools({ lang, copy }: { lang: Locale; copy: WorkspaceCopy }) {
  const zh = toBaseLocale(lang) === 'zh';
  const captureRoot = `/images/workspace/${lang === 'zh' ? '' : `${lang}/`}`;
  const [active, setActive] = useState(0);
  const navigation = useRef<HTMLDivElement>(null);
  const tools = [
    { id: 'files', Icon: FolderOpen, ...copy.tools.files },
    { id: 'overview', Icon: Landmark, ...copy.tools.overview },
    { id: 'search', Icon: Search, ...copy.tools.search },
    { id: 'redaction', Icon: ShieldCheck, ...copy.tools.redaction },
    { id: 'plugins', Icon: Blocks, ...copy.tools.plugins, href: `/${lang}/marketplace/plugins` },
    { id: 'skills', Icon: Sparkles, ...copy.tools.skills, href: `/${lang}/marketplace` },
  ];
  const selected = tools[active];
  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const offset = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0;
    if (!offset && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tools.length - 1 : (index + offset + tools.length) % tools.length;
    setActive(next);
    navigation.current?.querySelectorAll('button')[next]?.focus();
  }
  return <>
    <div className="tools-gallery">
      <div className="tools-navigation" ref={navigation} role="tablist" aria-label={copy.navAria}>
        {tools.map(({ id, Icon, label }, index) => <button type="button" role="tab" id={`tool-tab-${id}`} aria-controls="tool-panel" aria-selected={active === index} tabIndex={active === index ? 0 : -1} onKeyDown={event => onKey(event, index)} onClick={() => setActive(index)} key={id}><Icon size={18} strokeWidth={1.6} />{label}</button>)}
        <p>{copy.navNote}</p>
      </div>
      <div className="tools-panel" id="tool-panel" role="tabpanel" tabIndex={0} aria-labelledby={`tool-tab-${selected.id}`}>
        <figure className="tools-capture">
          <a href={`${captureRoot}${selected.id}.webp`} target="_blank" rel="noopener noreferrer" aria-label={copy.viewCaptureAria.replace('{label}', selected.label)}><Image src={`${captureRoot}${selected.id}.webp`} width={!zh && selected.id === 'overview' ? 521 : 624} height={!zh && selected.id === 'overview' ? 840 : 1360} sizes="(max-width: 700px) 90vw, 340px" quality={90} alt={copy.captureAlt.replace('{label}', selected.label)} /></a>
          <figcaption>{selected.id === 'overview' ? copy.captionOverview : copy.captionDefault}<ArrowUpRight size={12} /></figcaption>
        </figure>
        <div className="tools-description">
          <p className="workspace-eyebrow">{String(active + 1).padStart(2, '0')} / {selected.label}</p>
          <h2>{selected.title}</h2><p>{selected.body}</p>
          <ul>{selected.points.map(point => <li key={point}>{point}</li>)}</ul>
          <p className="tools-location">{selected.location}</p>
          {'href' in selected && selected.href && <Link href={selected.href} className="workspace-more">{copy.visitMarketplace}<ArrowRight size={16} /></Link>}
        </div>
      </div>
    </div>
    <section className="tools-utilities" aria-labelledby="tools-utilities-title">
      <p className="workspace-eyebrow">{copy.utilities.eyebrow}</p>
      <h2 id="tools-utilities-title">{copy.utilities.title}</h2>
      <p>{copy.utilities.subtitle}</p>
      {[
        { id: 'clipboard', ...copy.utilities.clipboard },
        { id: 'favorites', ...copy.utilities.favorites },
      ].map(item => <article key={item.id}><div><h3>{item.label}</h3><p>{item.body}</p></div><a href={`${captureRoot}${item.id}.webp`} target="_blank" rel="noopener noreferrer"><Image src={`${captureRoot}${item.id}.webp`} width={2177} height={523} quality={90} sizes="(max-width: 800px) 90vw, 1120px" alt={copy.utilities.panelAlt.replace('{label}', item.label)} /></a></article>)}
    </section>
  </>;
}
