"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { HistoryCalendar } from '@/components/history/history-calendar';
import { HistoryDayList } from '@/components/history/history-day-list';
import { HistoryDaySummary, HistoryDetail, HistorySkeleton } from '@/components/history/history-detail';
import { HistoryFilters } from '@/components/history/history-filters';
import { HistorySheet } from '@/components/history/history-sheet';
import { PaperCard } from '@/components/student/paper-card';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTimeZone } from '@/contexts/TimeZoneContext';
import { formatDateTime } from '@/lib/date-time';
import { usePracticeHistory } from '@/lib/hooks/use-practice-history';
import { useStatsData } from '@/lib/hooks/use-stats-data';
import { usePageTitle } from '@/lib/page-title';
import { validHistoryDate } from '@/lib/practice-history-view';
import type { UserProfile } from '@/types/api';

const mediaQuery = '(min-width: 1024px)';
const subscribe = (callback: () => void) => {
    const media = window.matchMedia(mediaQuery);
    media.addEventListener('change', callback);
    return () => media.removeEventListener('change', callback);
};
const wideSnapshot = () => window.matchMedia(mediaQuery).matches;
const serverSnapshot = () => false;

export function HistoryPage() {
    const { t } = useLanguage();
    const { timeZone } = useTimeZone();
    usePageTitle(t.history.title);
    const preferences = useStatsData<UserProfile>('/api/user');
    const router = useRouter();
    const params = useSearchParams();
    const today = formatDateTime(new Date(), 'yyyy-MM-dd', timeZone);
    const date = validHistoryDate(params.get('date'), today);
    const record = params.get('record') ?? '';
    const subjectId = params.get('subjectId') ?? '';
    const wrongOnly = params.get('result') === 'wrong';
    const filterKey = JSON.stringify([subjectId, wrongOnly]);
    const [selection, setSelection] = useState({ filterKey, allowFallback: !date });
    const allowFallback = selection.filterKey !== filterKey || selection.allowFallback;
    // 选记录只更新直达地址，不重排已读列表；选日历日期才将当天置顶。
    const [listDate, setListDate] = useState(date);
    const [fallbackToLatest, setFallbackToLatest] = useState(!date);
    const history = usePracticeHistory({ date: listDate, subjectId, wrongOnly, fallbackToLatest });
    const { loading, error, hasMore, loadMore } = history;
    const preferred = date ?? today;
    const selected = allowFallback && !loading && !error && !history.days.some(day => day.date === preferred)
        ? history.days[0]?.date ?? preferred : preferred;
    useEffect(() => {
        if (!allowFallback || loading || error || !history.days.length || selected === date) return;
        const next = new URLSearchParams(params.toString());
        next.set('date', selected);
        next.delete('record');
        router.replace(`/history?${next}`, { scroll: false });
    }, [allowFallback, loading, error, history.days.length, selected, date, params, router]);
    const wide = useSyncExternalStore(subscribe, wideSnapshot, serverSnapshot);
    const sentinel = useRef<HTMLDivElement>(null);
    const listTop = useRef<HTMLDivElement>(null);
    const pendingScroll = useRef(false);
    useEffect(() => {
        const restoreDate = () => setListDate(validHistoryDate(new URLSearchParams(window.location.search).get('date'), today));
        window.addEventListener('popstate', restoreDate);
        return () => window.removeEventListener('popstate', restoreDate);
    }, [today]);
    function update(values: Record<string, string | null>) {
        const next = new URLSearchParams(params.toString());
        for (const [key, value] of Object.entries(values)) {
            if (value) next.set(key, value);
            else next.delete(key);
        }
        router.replace(`/history${next.size ? `?${next}` : ''}`, { scroll: false });
    }
    useEffect(() => {
        if (!sentinel.current || loading || error || !hasMore || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) void loadMore();
        }, { rootMargin: '160px' });
        observer.observe(sentinel.current);
        return () => observer.disconnect();
    }, [loading, error, hasMore, loadMore]);
    useEffect(() => {
        if (pendingScroll.current && !history.loading) {
            listTop.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
            pendingScroll.current = false;
        }
    }, [history.loading]);
    const day = history.days.find(value => value.date === selected);
    const empty = !history.loading && !history.error && !history.days.length;
    return <main className="mx-auto max-w-[1500px] space-y-5 px-3 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-title text-3xl font-bold">{t.history.title}</h1>
            <HistoryFilters subjectId={subjectId} wrongOnly={wrongOnly} onChange={values => {
                setSelection({ filterKey, allowFallback: true });
                // 先检查当前日期；变空时再从最新记录查找匹配日期。
                setListDate(selected);
                setFallbackToLatest(true);
                update({ ...values, date: selected, record: null });
            }} />
        </header>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-5">
                <HistoryCalendar selected={selected} today={today} subjectId={subjectId} onSelect={value => {
                    setSelection({ filterKey, allowFallback: false });
                    setFallbackToLatest(false);
                    if (value === listDate) listTop.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
                    else pendingScroll.current = true;
                    setListDate(value);
                    update({ date: value, record: null });
                }} />
                <div ref={listTop} className="scroll-mt-4 space-y-6" aria-busy={history.loading}>
                    {!history.loading && !history.error && date && !allowFallback && !day && <p className="py-4">{date} · {wrongOnly || subjectId ? t.history.filterEmpty : t.history.emptyDay}</p>}
                    {history.days.map(value => <HistoryDayList key={value.date} day={value} showRewards={selected === value.date && !!preferences.data && preferences.data.rewardsEnabled !== false} selectedRecord={record} onSelect={item => {
                        setSelection({ filterKey, allowFallback: false });
                        update({ date: value.date, record: item.id });
                    }} />)}
                    {history.loading && <HistorySkeleton />}
                    {history.error && <div role="alert" className="rounded-lg border p-4">{t.history.loadFailed}<Button variant="ghost" className="min-h-11" onClick={history.retry}>{t.review.retry}</Button></div>}
                    {empty && (!date || allowFallback) && <PaperCard><p>{wrongOnly || subjectId ? t.history.filterEmpty : t.history.empty}</p><Button asChild variant="ghost" className="min-h-11"><Link href="/">{t.history.goToday}</Link></Button></PaperCard>}
                    {!history.loading && !history.error && !history.hasMore && (!empty || (!!date && !allowFallback)) && <p className="py-4 text-center text-sm text-muted-foreground">{t.history.noMore}</p>}
                    <div ref={sentinel} className="h-1" />
                    {history.hasMore && !history.loading && !history.error && <Button variant="ghost" className="min-h-11 w-full" onClick={() => void history.loadMore()}>{t.history.loadEarlier}</Button>}
                </div>
            </div>
            {wide && <aside className="sticky top-4 max-h-[calc(100dvh-2rem)] min-h-0 min-w-0 self-start overflow-y-auto overscroll-contain rounded-xl border bg-card p-5" aria-label={t.history.detail}>
                {record ? <><div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-semibold">{t.history.detail}</h2><Button variant="ghost" className="min-h-11" aria-label={t.history.closeDetail} onClick={() => update({ record: null })}>{t.common.close}</Button></div><HistoryDetail key={record} id={record} /></> : history.loading ? <HistorySkeleton /> : !history.error && <HistoryDaySummary day={day} />}
            </aside>}
        </div>
        {!wide && <HistorySheet open={!!record} onClose={() => update({ record: null })} title={t.history.detail}>{record && <HistoryDetail key={record} id={record} />}</HistorySheet>}
    </main>;
}
