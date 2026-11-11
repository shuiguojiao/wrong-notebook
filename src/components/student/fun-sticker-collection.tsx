"use client";

import { NetworkNotice } from '@/components/student/network-notice';
import { NoteCard } from '@/components/student/note-card';
import { PaperCard } from '@/components/student/paper-card';
import { StudentSkeleton } from '@/components/student/student-skeleton';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStatsData } from '@/lib/hooks/use-stats-data';
import { FUN_STICKERS, FUN_STICKER_SETS } from '@/lib/rewards/fun-stickers';
import type { RewardFunStickersResponse } from '@/types/api';

interface FunStickerCollectionContentProps { data: RewardFunStickersResponse }

export function FunStickerCollectionContent({ data }: FunStickerCollectionContentProps) {
    const { t, language } = useLanguage();
    const owned = new Map(data.stickers.map(sticker => [sticker.id, sticker]));
    const count = FUN_STICKERS.filter(sticker => owned.get(sticker.id)?.owned).length;
    const formatDay = (day: string) => new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
    return <div className="space-y-6">
        <p className="text-lg tabular-nums">{t.rewards.funCount.replace('{count}', String(count)).replace('{total}', String(FUN_STICKERS.length))}</p>
        <NoteCard tape><p>{t.rewards.funRule}</p></NoteCard>
        {FUN_STICKER_SETS.map(setId => {
            const stickers = FUN_STICKERS.filter(sticker => sticker.setId === setId);
            const total = stickers.filter(sticker => owned.get(sticker.id)?.owned).length;
            return <PaperCard key={setId}><section aria-label={t.rewards.funSets[setId]}>
                <h2 className="mb-5 flex flex-wrap items-center gap-3 border-b pb-3 font-title text-xl font-semibold">
                    {t.rewards.funSets[setId]} <span className="text-sm tabular-nums">{total} / {stickers.length}</span>
                    {data.sets.some(set => set.setId === setId && set.completed) && <span className="rounded border border-primary px-2 text-sm text-primary">{t.rewards.funSetDone}</span>}
                </h2>
                <ul className="grid grid-cols-4 gap-x-2 gap-y-5 md:grid-cols-6">
                    {stickers.map(sticker => {
                        const record = owned.get(sticker.id);
                        return <li key={sticker.id} className="min-w-0 text-center">
                            {record?.owned ? <><div className="student-fun-sticker mx-auto flex size-14 items-center justify-center rounded-xl bg-white text-[40px] sm:size-18" aria-hidden="true">{sticker.emoji}</div>
                                <p className="mt-2 break-words text-xs">{t.rewards.funNames[sticker.nameKey as keyof typeof t.rewards.funNames]}</p>
                                {record.day && <p className="mt-1 break-words text-xs text-muted-foreground"><time dateTime={record.day}>{formatDay(record.day)}</time></p>}
                            </> : <div className="mx-auto flex size-14 items-center justify-center rounded-xl border-2 border-dashed text-2xl text-muted-foreground sm:size-18">?</div>}
                        </li>;
                    })}
                </ul>
            </section></PaperCard>;
        })}
    </div>;
}

export function FunStickerCollection() {
    const { data, loading, error, reload } = useStatsData<RewardFunStickersResponse>('/api/rewards/fun-stickers');
    if (loading) return <StudentSkeleton variant="block" className="h-80" />;
    if (error) return <NetworkNotice onRetry={reload} />;
    return data ? <FunStickerCollectionContent data={data} /> : null;
}
