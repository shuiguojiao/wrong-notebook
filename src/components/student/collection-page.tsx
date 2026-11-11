"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { KnowledgeSticker } from '@/components/student/knowledge-sticker';
import { NetworkNotice } from '@/components/student/network-notice';
import { NoteCard } from '@/components/student/note-card';
import { PaperCard } from '@/components/student/paper-card';
import { StudentSkeleton } from '@/components/student/student-skeleton';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStatsData } from '@/lib/hooks/use-stats-data';
import { getTagSetName } from '@/lib/hooks/use-tag-sets';
import type { StudentProgress, StudentSticker } from '@/lib/student-progress';

interface CollectionContentProps { data: StudentProgress; selectedPoint?: string | null }

export function CollectionContent({ data, selectedPoint }: CollectionContentProps) {
    const { t } = useLanguage();
    const [filter, setFilter] = useState<'all' | StudentSticker['state']>('all');
    const visible = data.stickers.filter(sticker => filter === 'all' || sticker.state === filter);
    const subjects = new Map<string | null, StudentSticker[]>();
    for (const sticker of visible) subjects.set(sticker.subjectId, [...(subjects.get(sticker.subjectId) ?? []), sticker]);
    const filters = [{ value: 'all', label: t.review.all }, { value: 'earned', label: t.student.stickerEarned },
        { value: 'improving', label: t.student.stickerImproving }, { value: 'missing', label: t.student.stickerUnfinished }] as const;
    const selected = data.stickers.find(sticker => sticker.key === selectedPoint);
    if (selected) return <PaperCard><div className="space-y-4">
        <h2 className="font-title text-xl">{t.student.practiceSticker} · {selected.name}</h2>
        <p>{t.student.unmastered} · {getTagSetName(t.notebooks.dialog, selected.tagSet)}</p>
        <ol>{selected.itemIds.filter(id => data.items[id]?.status !== 'mastered').map((id, index) => <li key={id}>
            <Link className="inline-flex min-h-11 items-center text-primary underline" href={`/error-items/${encodeURIComponent(id)}`}>{t.review.questionNumber.replace('{number}', String(index + 1))}</Link>
        </li>)}</ol>
        <Link className="inline-flex min-h-11 items-center text-primary underline" href="/collection">{t.student.openCollection}</Link>
    </div></PaperCard>;
    return <div className="space-y-6">
        <p className="text-lg tabular-nums">{t.student.collectionCount.replace('{earned}', String(data.earned)).replace('{total}', String(data.stickers.length))}</p>
        <NoteCard tape className="max-w-2xl"><p className="font-title text-lg font-semibold">{t.student.collectionRule}</p></NoteCard>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t.student.stickerFilter}>
            {filters.map(option => <Button key={option.value} variant={filter === option.value ? 'default' : 'outline'} className="min-h-11" aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>{option.label}</Button>)}
        </div>
        {!visible.length && <PaperCard><p>{data.stickers.length ? t.student.collectionFilterEmpty : t.student.collectionEmpty}</p><Button asChild variant="link"><Link href="/notebooks">{t.student.goToNotebooks}</Link></Button></PaperCard>}
        <div className="grid items-start gap-6 lg:grid-cols-3">
            {[...subjects].map(([id, stickers]) => {
                const tagSets = new Map<string, StudentSticker[]>();
                for (const sticker of stickers) tagSets.set(sticker.tagSet, [...(tagSets.get(sticker.tagSet) ?? []), sticker]);
                // 按学科全集判断体系数量，状态筛选后仍保留必要的体系上下文。
                const multipleTagSets = new Set(data.stickers.filter(sticker => sticker.subjectId === id).map(sticker => sticker.tagSet)).size > 1;
                return <PaperCard key={id ?? 'unknown'} className="h-full">
                    <h2 className="font-title border-b pb-4 text-xl font-semibold">{stickers[0].subjectName ?? t.review.subjectUnknown}</h2>
                    {[...tagSets].map(([tagSet, entries]) => <section key={tagSet} className="py-6">
                        {multipleTagSets && <h3 className="mb-4 font-title font-semibold">{getTagSetName(t.notebooks.dialog, tagSet)}</h3>}
                        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                            {entries.map(sticker => {
                                const subject = sticker.subjectKey === 'english' || sticker.subjectKey === 'math' || sticker.subjectKey === 'chinese' ? sticker.subjectKey : 'other';
                                const href = sticker.subjectId ? `/notebooks/${encodeURIComponent(sticker.subjectId)}?${new URLSearchParams({ mastery: 'unmastered', tag: sticker.name, tagSet: sticker.tagSet })}` : `/collection?${new URLSearchParams({ point: sticker.key })}`;
                                return <li key={sticker.key} className="flex min-w-0">
                                    <KnowledgeSticker name={sticker.name} subject={subject} className="h-full w-full rounded-xl" {...(sticker.state === 'missing' ? { state: 'missing', remaining: sticker.remaining, practiceHref: href } : sticker.state === 'improving' ? { state: 'improving', practiceHref: href } : { state: 'earned' })} />
                                </li>;
                            })}
                        </ul>
                    </section>)}
                </PaperCard>;
            })}
        </div>
    </div>;
}

export function CollectionPage() {
    const searchParams = useSearchParams();
    const { data, loading, error, reload } = useStatsData<StudentProgress>('/api/student-progress');
    return loading ? <StudentSkeleton variant="block" className="h-80" /> : error ? <NetworkNotice onRetry={reload} /> : data ? <CollectionContent data={data} selectedPoint={searchParams.get("point")} /> : null;
}
