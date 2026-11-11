"use client";

import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePracticeCalendar } from '@/lib/hooks/use-practice-history';
import { historyDayState, historyMonth, historyWeekStart, shiftHistoryDate } from '@/lib/practice-history-view';
import { cn } from '@/lib/utils';

interface HistoryCalendarProps { selected: string; today: string; subjectId: string; onSelect: (date: string) => void; onJournal?: (week: string) => void }

export function HistoryCalendar({ selected, today, subjectId, onSelect, onJournal }: HistoryCalendarProps) {
    const { language, t } = useLanguage();
    const [anchor, setAnchor] = useState(selected);
    const [monthOpen, setMonthOpen] = useState(false);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 记录直达和浏览器历史切换后，让日历跟随所选日期。
        setAnchor(selected);
    }, [selected]);
    const weekStart = historyWeekStart(anchor);
    const month = historyMonth(anchor);
    const from = monthOpen ? month.from : weekStart;
    const to = monthOpen ? month.to : shiftHistoryDate(weekStart, 6);
    const calendar = usePracticeCalendar(from, to, subjectId);
    const dayCounts = new Map(calendar.data?.days.map(day => [day.date, day]));
    const dates = Array.from({ length: monthOpen ? new Date(`${month.to}T12:00:00Z`).getUTCDate() : 7 }, (_, index) => shiftHistoryDate(from, index));
    const format = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
    const canNext = monthOpen ? historyMonth(anchor, 1).from <= today : shiftHistoryDate(weekStart, 7) <= today;
    const showBackToToday = selected !== today || today < weekStart || today > shiftHistoryDate(weekStart, 6);
    function move(direction: number) {
        setAnchor(monthOpen ? historyMonth(anchor, direction).from : shiftHistoryDate(weekStart, direction * 7));
    }
    return <section aria-label={t.history.calendar} className="space-y-1 rounded-xl border bg-card px-2 py-2 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-1">
            <Button variant="ghost" className="min-h-11 min-w-0 px-1" aria-expanded={monthOpen} onClick={() => setMonthOpen(value => !value)}>{format(anchor, { year: 'numeric', month: 'long' })}<span className="sr-only">{t.history.calendar}</span></Button>
            {onJournal && <Button variant="link" className="min-h-11 px-1" onClick={() => onJournal(weekStart)}>{t.rewards.journalTitle}</Button>}
            <div className="flex shrink-0 items-center gap-2">
                {showBackToToday && <Button variant="ghost" className="min-h-11 px-2" onClick={() => { setAnchor(today); onSelect(today); }}>{t.history.backToToday}</Button>}
                <Button variant="ghost" className="size-11 shrink-0" aria-label={monthOpen ? t.history.previousMonth : t.history.previousWeek} onClick={() => move(-1)}><ChevronLeft aria-hidden="true" /></Button>
                <Button variant="ghost" className="size-11 shrink-0" aria-label={monthOpen ? t.history.nextMonth : t.history.nextWeek} disabled={!canNext} onClick={() => move(1)}><ChevronRight aria-hidden="true" /></Button>
            </div>
        </div>
        <div className="grid grid-cols-7 text-center text-xs text-muted-foreground" aria-hidden="true">
            {Array.from({ length: 7 }, (_, index) => <span key={index}>{format(shiftHistoryDate(historyWeekStart(today), index), { weekday: 'short' })}</span>)}
        </div>
        {calendar.error ? <div role="alert" className="p-2 text-sm">{t.history.loadFailed}<Button variant="ghost" onClick={calendar.retry}>{t.review.retry}</Button></div> : <div className="grid grid-cols-7 gap-y-2" aria-busy={!calendar.data}>
            {monthOpen && Array.from({ length: (new Date(`${from}T12:00:00Z`).getUTCDay() + 6) % 7 }, (_, index) => <span key={`blank-${index}`} />)}
            {dates.map(date => {
                const counts = dayCounts.get(date);
                const state = counts ? historyDayState(counts.total, counts.correct) : undefined;
                const label = `${format(date, { month: 'long', day: 'numeric', weekday: 'long' })}${counts ? `，${t.history.daySummary.replace('{count}', String(counts.total)).replace('{correct}', String(counts.correct))}` : `，${t.common.loading}`}`;
                return <div key={date} className="flex min-w-0 flex-col items-center gap-1">
                    <button type="button" data-day={date} data-day-state={state} aria-label={label} aria-pressed={selected === date} disabled={date > today || !counts}
                        onClick={() => onSelect(date)} className={cn('relative flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-foreground/60 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40', selected === date && 'outline-2 outline-offset-2 outline-foreground font-bold', state && state !== 'empty' && 'bg-foreground text-background', !counts && 'animate-pulse motion-reduce:animate-none bg-muted')}>
                        <span>{Number(date.slice(-2))}</span>{state === 'perfect' && <Check className="absolute -right-1 -top-1 size-4 rounded-full border bg-background text-foreground" aria-hidden="true" />}
                    </button>
                    {date === today && <span className="text-xs">{t.student.todayTag}</span>}
                </div>;
            })}
        </div>}
    </section>;
}
