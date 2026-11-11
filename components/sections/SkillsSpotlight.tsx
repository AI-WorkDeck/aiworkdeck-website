import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Locale } from '@/i18n-config';
import { listSkills } from '@/lib/skills-store';
import { findUserById, toPublicUser } from '@/lib/users';
import { SkillCard } from '@/components/skills/SkillCard';
import { Reveal } from '@/components/motion/Reveal';
import { CountUp } from '@/components/motion/CountUp';
import { Button } from '@/components/ui/button';

interface SkillsSpotlightProps {
    lang: Locale;
    dict: any;
}

/**
 * 首页 Skill 广场精选区（服务端组件，实时读 skills-store）。
 * 精选优先，其次热门，最多 6 张卡；广场为空时不渲染，首页不留空洞。
 */
export function SkillsSpotlight({ lang, dict }: SkillsSpotlightProps) {
    const t = dict.common.skillsSpotlight;
    const all = listSkills({ sort: 'popular', featuredFirst: true });
    if (all.length === 0) return null;

    const spotlight = all.slice(0, 6);
    const contributorCount = new Set(all.map(s => s.authorId)).size;

    return (
        <section className="py-20 md:py-24 bg-neutral-gray-pale border-t border-neutral-gray-light/60" id="skills">
            <div className="container mx-auto px-4 md:px-8 max-w-6xl">
                <Reveal>
                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
                        <div>
                            <p className="flex items-center gap-3 text-[11px] tracking-[0.22em] uppercase text-king-forest/70 mb-4">
                                <span className="w-8 h-px bg-king-forest/40" />
                                {t.badge}
                            </p>
                            <h2 className="font-display text-[clamp(32px,3.4vw,46px)] font-semibold leading-[1.15] tracking-tight text-neutral-dark-bg mb-3">{t.title}</h2>
                            <p className="text-lg text-neutral-gray-medium max-w-2xl">{t.subtitle}</p>
                        </div>
                        <div className="flex items-center gap-8 flex-shrink-0 text-sm text-neutral-gray-medium">
                            <span className="flex items-baseline gap-2">
                                <CountUp value={all.length} className="font-display text-2xl font-bold text-neutral-dark-bg" />
                                {t.statSkills}
                            </span>
                            <span className="w-px h-5 bg-neutral-gray-light" />
                            <span className="flex items-baseline gap-2">
                                <CountUp value={contributorCount} className="font-display text-2xl font-bold text-neutral-dark-bg" />
                                {t.statContributors}
                            </span>
                        </div>
                    </div>
                </Reveal>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
                    {spotlight.map((skill, i) => {
                        const author = findUserById(skill.authorId);
                        return (
                            <Reveal key={skill.id} delay={i * 70} className="h-full">
                                <SkillCard
                                    lang={lang}
                                    dict={dict}
                                    skill={skill}
                                    author={author ? toPublicUser(author) : undefined}
                                />
                            </Reveal>
                        );
                    })}
                </div>

                <Reveal>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link href={`/${lang}/marketplace`}>
                            <Button size="lg" className="w-full sm:w-auto gap-2 font-semibold shadow-lg shadow-king-forest/15">
                                {t.browseAll}
                                <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                            </Button>
                        </Link>
                        <Link href={`/${lang}/skills/submit`}>
                            <Button variant="outline" size="lg" className="w-full sm:w-auto font-semibold bg-white border border-neutral-gray-light text-neutral-dark-bg hover:bg-neutral-gray-pale">
                                {t.submitCta}
                            </Button>
                        </Link>
                    </div>
                </Reveal>
            </div>
        </section>
    );
}
