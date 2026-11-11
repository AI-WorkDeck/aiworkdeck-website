'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Briefcase, Check, GraduationCap, GripVertical, Landmark, ListChecks,
    Pencil, Phone, Plus, QrCode, Search, Tags, Trash2, X,
} from 'lucide-react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormNotice } from '@/components/ui/notice';
import { readApiJson } from '@/lib/api-result';

/**
 * 作者主页编辑工作台（dev-board#303/#307）。
 *
 * 公开态渲染已全部收归服务端 page（v3 布局跨 hero/主栏/侧栏，client 双份实现只会漂）；
 * 本组件只负责「编辑主页」按钮 + 全屏工作台 overlay：卡片式模块编辑、@dnd-kit 拖拽排序、
 * 结构化教育行编辑（学校联想选择器 /api/schools + 年份/学位受限字段——dev-board#307
 * 维护者点名不做开放式）。保存 → PATCH → router.refresh() 刷新服务端公开态。
 */

type SectionType = 'practice' | 'expertise' | 'education' | 'positions' | 'highlights' | 'contact';
const ALL_TYPES: SectionType[] = ['practice', 'expertise', 'education', 'positions', 'highlights', 'contact'];

export interface EducationEntry {
    school: string;
    degree?: string;
    startYear?: number;
    endYear?: number;
    domain?: string;
}

export interface ResumeData {
    order: SectionType[];
    practice?: { title?: string; org?: string };
    expertise?: string[];
    education?: EducationEntry[];
    positions?: string[];
    highlights?: string[];
    contact?: { phone?: string; email?: string; hasWechatQr?: boolean };
}

const ICONS: Record<SectionType, typeof Briefcase> = {
    practice: Briefcase,
    expertise: Tags,
    education: GraduationCap,
    positions: Landmark,
    highlights: ListChecks,
    contact: Phone,
};

/** hero 化的模块：编辑卡上标注「显示在页首」 */
const HERO_TYPES: SectionType[] = ['practice', 'expertise', 'education'];

export function ProfileEditor({ t, initial }: {
    t: any;
    initial: ResumeData;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [data, setData] = useState<ResumeData>(initial);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const qrInputRef = useRef<HTMLInputElement>(null);
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

    // 工作台打开期间锁背景滚动
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [open]);

    const addable = ALL_TYPES.filter(type => !data.order.includes(type));

    const patch = (next: Partial<ResumeData>) => setData(d => ({ ...d, ...next }));

    const onDragEnd = (e: DragEndEvent) => {
        const { active, over } = e;
        if (!over || active.id === over.id) return;
        setData(d => ({
            ...d,
            order: arrayMove(d.order, d.order.indexOf(active.id as SectionType), d.order.indexOf(over.id as SectionType)),
        }));
    };

    const addSection = (type: SectionType) => setData(d => ({ ...d, order: [...d.order, type] }));

    const removeSection = (type: SectionType) => {
        setData(d => {
            const next: ResumeData = { ...d, order: d.order.filter(x => x !== type) };
            if (type === 'contact') {
                next.contact = d.contact?.hasWechatQr ? { hasWechatQr: true } : undefined;
                if (!d.contact?.hasWechatQr) next.contact = undefined;
            } else if (type === 'practice') {
                next.practice = undefined;
            } else {
                next[type] = undefined;
            }
            return next;
        });
    };

    const save = async () => {
        setSaving(true);
        setError('');
        try {
            const res = await fetch('/api/account/profile-sections', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sections: data }),
            });
            const body = await readApiJson(res);
            if (!res.ok) {
                setError(body.message || t.saveFailed);
            } else {
                setData(body.sections);
                setOpen(false);
                router.refresh();
            }
        } catch {
            setError(t.saveFailed);
        }
        setSaving(false);
    };

    const uploadQr = async (file: File) => {
        setError('');
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/account/profile-sections', { method: 'POST', body: form });
        const body = await readApiJson(res);
        if (!res.ok) {
            setError(body.message || t.saveFailed);
            return;
        }
        setData(d => ({
            ...d,
            order: d.order.includes('contact') ? d.order : [...d.order, 'contact'],
            contact: { ...(d.contact ?? {}), hasWechatQr: true },
        }));
        router.refresh();
    };

    const deleteQr = async () => {
        await fetch('/api/account/profile-sections', { method: 'DELETE' });
        setData(d => ({ ...d, contact: { ...(d.contact ?? {}), hasWechatQr: undefined } }));
        router.refresh();
    };

    return (
        <>
            <Button variant="outline"
                className="gap-1.5 border-white/30 bg-transparent font-bold text-white hover:border-king-mint/60 hover:bg-transparent hover:text-king-mint"
                onClick={() => { setData(initial); setOpen(true); }}>
                <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                {t.editCta}
            </Button>

            {open && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-gray-pale">
                    <div className="sticky top-0 z-10 border-b border-neutral-gray-light bg-white/90 backdrop-blur-xl">
                        <div className="container mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3.5 md:px-8">
                            <h2 className="font-display text-lg font-semibold text-neutral-dark-bg">{t.title}</h2>
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" className="font-medium" onClick={() => { setOpen(false); setError(''); }}>
                                    <X className="mr-1 h-3.5 w-3.5" strokeWidth={1.75} />
                                    {t.cancel}
                                </Button>
                                <Button variant="default" className="gap-1.5 font-bold" disabled={saving} onClick={save}>
                                    <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
                                    {saving ? t.saving : t.save}
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="container mx-auto max-w-5xl px-4 py-8 md:px-8">
                        {error && (
                            <FormNotice variant="error" className="mb-4">{error}</FormNotice>
                        )}

                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                            <SortableContext items={data.order} strategy={verticalListSortingStrategy}>
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    {data.order.map(type => (
                                        <SectionCard key={type} type={type} t={t} data={data} patch={patch}
                                            onRemove={() => removeSection(type)}
                                            onUploadQr={() => qrInputRef.current?.click()}
                                            onDeleteQr={deleteQr} />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>

                        {addable.length > 0 && (
                            <div className="mt-5 flex flex-wrap items-center gap-2">
                                <span className="text-[13px] text-neutral-gray-medium">{t.addSection}</span>
                                {addable.map(type => (
                                    <button key={type} type="button" onClick={() => addSection(type)}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-gray-light bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-gray-dark transition-colors hover:border-king-forest/40 hover:text-king-forest">
                                        <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                                        {t.sections[type]}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <input ref={qrInputRef} type="file" accept="image/*" className="hidden"
                        onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) void uploadQr(f);
                            e.target.value = '';
                        }} />
                </div>
            )}
        </>
    );
}

function SectionCard({ type, t, data, patch, onRemove, onUploadQr, onDeleteQr }: {
    type: SectionType; t: any; data: ResumeData;
    patch: (next: Partial<ResumeData>) => void;
    onRemove: () => void; onUploadQr: () => void; onDeleteQr: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: type });
    const Icon = ICONS[type];
    return (
        <div ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={`rounded-xl border bg-white px-5 py-4 ${
                isDragging ? 'z-10 border-king-forest/50 shadow-[0_18px_40px_-18px_rgba(46,90,80,0.35)]' : 'border-neutral-gray-light'
            } ${type === 'education' ? 'md:col-span-2' : ''}`}>
            <div className="mb-3 flex items-center gap-2">
                <button type="button" {...attributes} {...listeners} aria-label={t.dragHandle}
                    className="-ml-1 cursor-grab touch-none rounded p-1 text-neutral-gray-medium hover:bg-neutral-gray-pale active:cursor-grabbing">
                    <GripVertical className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <Icon className="h-4 w-4 text-king-forest" strokeWidth={1.75} />
                <h3 className="flex-1 font-display text-[15px] font-semibold text-neutral-dark-bg">
                    {t.sections[type]}
                    {HERO_TYPES.includes(type) && (
                        <span className="ml-2 text-[11px] font-normal text-neutral-gray-medium">{t.heroNote}</span>
                    )}
                </h3>
                <button type="button" onClick={onRemove} aria-label={t.removeSection}
                    className="rounded p-1 text-neutral-gray-medium transition-colors hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
            </div>
            <SectionBody type={type} t={t} data={data} patch={patch} onUploadQr={onUploadQr} onDeleteQr={onDeleteQr} />
        </div>
    );
}

function SectionBody({ type, t, data, patch, onUploadQr, onDeleteQr }: {
    type: SectionType; t: any; data: ResumeData;
    patch: (next: Partial<ResumeData>) => void;
    onUploadQr: () => void; onDeleteQr: () => void;
}) {
    if (type === 'practice') {
        return (
            <div className="flex flex-col gap-2.5">
                <Input value={data.practice?.title ?? ''} placeholder={t.practiceTitlePh}
                    onChange={e => patch({ practice: { ...(data.practice ?? {}), title: e.target.value } })} />
                <Input value={data.practice?.org ?? ''} placeholder={t.practiceOrgPh}
                    onChange={e => patch({ practice: { ...(data.practice ?? {}), org: e.target.value } })} />
            </div>
        );
    }

    if (type === 'education') {
        return <EducationEditor t={t} entries={data.education ?? []} onChange={entries => patch({ education: entries })} />;
    }

    if (type === 'contact') {
        const c = data.contact ?? {};
        return (
            <div className="flex flex-col gap-2.5">
                <Input value={c.phone ?? ''} placeholder={t.contactPhonePh} inputMode="tel"
                    onChange={e => patch({ contact: { ...c, phone: e.target.value } })} />
                <Input value={c.email ?? ''} placeholder={t.contactEmailPh} inputMode="email"
                    onChange={e => patch({ contact: { ...c, email: e.target.value } })} />
                <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" className="gap-1.5 text-[13px]" onClick={onUploadQr}>
                        <QrCode className="h-3.5 w-3.5" strokeWidth={1.75} />
                        {c.hasWechatQr ? t.contactQrReplace : t.contactQrUpload}
                    </Button>
                    {c.hasWechatQr && (
                        <Button type="button" variant="ghost" className="text-[13px] text-red-600" onClick={onDeleteQr}>
                            {t.contactQrRemove}
                        </Button>
                    )}
                </div>
                <p className="text-[12px] leading-relaxed text-neutral-gray-medium">{t.contactPublicNote}</p>
            </div>
        );
    }

    if (type === 'expertise') {
        return (
            <ListEditor value={data.expertise ?? []} placeholder={t.expertisePh}
                onChange={items => patch({ expertise: items })} rows={3} />
        );
    }

    const items = data[type] ?? [];
    return (
        <ListEditor value={items} placeholder={t[`${type}Ph`]}
            onChange={next => patch({ [type]: next } as Partial<ResumeData>)} rows={4} />
    );
}

/* ---------- 结构化教育行编辑器（dev-board#307：字段受限，不做开放式） ---------- */

interface SchoolSuggestion { name: string; en?: string; domain: string }

function EducationEditor({ t, entries, onChange }: {
    t: any;
    entries: EducationEntry[];
    onChange: (entries: EducationEntry[]) => void;
}) {
    const update = (i: number, next: Partial<EducationEntry>) => {
        onChange(entries.map((r, idx) => (idx === i ? { ...r, ...next } : r)));
    };
    return (
        <div className="flex flex-col gap-3">
            {entries.map((entry, i) => (
                <EducationRow key={i} t={t} entry={entry}
                    onChange={next => update(i, next)}
                    onRemove={() => onChange(entries.filter((_, idx) => idx !== i))} />
            ))}
            {entries.length < 8 && (
                <button type="button" onClick={() => onChange([...entries, { school: '' }])}
                    className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-dashed border-neutral-gray-light px-3 py-1.5 text-[13px] font-medium text-neutral-gray-medium transition-colors hover:border-king-forest/40 hover:text-king-forest">
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {t.educationAdd}
                </button>
            )}
        </div>
    );
}

function EducationRow({ t, entry, onChange, onRemove }: {
    t: any;
    entry: EducationEntry;
    onChange: (next: Partial<EducationEntry>) => void;
    onRemove: () => void;
}) {
    const [suggestions, setSuggestions] = useState<SchoolSuggestion[]>([]);
    const [showSuggest, setShowSuggest] = useState(false);
    const seqRef = useRef(0);

    const search = async (q: string) => {
        // 手输即视为脱离名录：domain 清空，选中联想项时再回填
        onChange({ school: q, domain: undefined });
        const trimmed = q.trim();
        if (!trimmed) {
            setSuggestions([]);
            return;
        }
        const seq = ++seqRef.current;
        try {
            const res = await fetch(`/api/schools?q=${encodeURIComponent(trimmed)}`);
            const body = await res.json();
            // 迟到的旧响应丢弃，避免快速输入时联想框回跳
            if (seq === seqRef.current) {
                setSuggestions(body.schools ?? []);
                setShowSuggest(true);
            }
        } catch { /* 联想失败不影响手输 */ }
    };

    const yearInput = (field: 'startYear' | 'endYear', placeholder: string) => (
        <Input
            value={entry[field] ?? ''}
            placeholder={placeholder}
            inputMode="numeric"
            maxLength={4}
            className="w-[76px] text-center"
            onChange={e => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
                onChange({ [field]: digits ? Number(digits) : undefined } as Partial<EducationEntry>);
            }}
        />
    );

    return (
        <div className="rounded-lg border border-neutral-gray-light/80 bg-neutral-gray-pale/50 p-3">
            <div className="relative">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-gray-medium" strokeWidth={1.75} />
                    <Input value={entry.school} placeholder={t.educationSchoolPh} className="pl-9"
                        onChange={e => void search(e.target.value)}
                        onFocus={() => suggestions.length > 0 && setShowSuggest(true)}
                        onBlur={() => setTimeout(() => setShowSuggest(false), 180)} />
                </div>
                {showSuggest && suggestions.length > 0 && (
                    <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-neutral-gray-light bg-white shadow-lg">
                        {suggestions.map(s => (
                            <li key={s.domain}>
                                <button type="button"
                                    className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-sm hover:bg-king-mint-lightest"
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => {
                                        onChange({ school: s.name, domain: s.domain });
                                        setShowSuggest(false);
                                    }}>
                                    <span className="font-medium text-neutral-dark-bg">{s.name}</span>
                                    {s.en && <span className="truncate text-[12px] text-neutral-gray-medium">{s.en}</span>}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Input value={entry.degree ?? ''} placeholder={t.educationDegreePh} list="awd-degrees"
                    className="w-[168px]"
                    onChange={e => onChange({ degree: e.target.value })} />
                <datalist id="awd-degrees">
                    {(t.degreeOptions as string[]).map(d => <option key={d} value={d} />)}
                </datalist>
                {yearInput('startYear', t.educationStartPh)}
                <span className="text-neutral-gray-medium">–</span>
                {yearInput('endYear', t.educationEndPh)}
                <button type="button" onClick={onRemove} aria-label={t.removeSection}
                    className="ml-auto rounded p-1.5 text-neutral-gray-medium transition-colors hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
            </div>
        </div>
    );
}

/** 一行一条的极简编辑器；失焦即回写数组 */
function ListEditor({ value, placeholder, onChange, rows }: {
    value: string[]; placeholder: string; rows: number;
    onChange: (items: string[]) => void;
}) {
    const [text, setText] = useState(value.join('\n'));
    return (
        <textarea
            value={text}
            rows={rows}
            placeholder={placeholder}
            onChange={e => setText(e.target.value)}
            onBlur={() => onChange(text.split('\n').map(s => s.trim()).filter(Boolean))}
            className="w-full resize-y rounded-lg border border-neutral-gray-light bg-white px-3 py-2 text-sm leading-relaxed text-neutral-gray-dark placeholder:text-neutral-gray-medium/60 focus:border-king-forest/50 focus:outline-none"
        />
    );
}
