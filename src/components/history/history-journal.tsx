"use client";

import { HistorySheet } from '@/components/history/history-sheet';
import { WeeklyJournal } from '@/components/student/weekly-journal';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { historyWeekStart, validHistoryDate } from '@/lib/practice-history-view';
import { shiftDay } from '@/lib/rewards/rules';

interface HistoryJournalProps { start: string | null; today: string; onChange: (start: string | null) => void }

export function HistoryJournal({ start, today, onChange }: HistoryJournalProps) {
    const { t } = useLanguage();
    const valid = validHistoryDate(start, today);
    const week = valid && historyWeekStart(valid) === valid ? valid : null;
    const current = historyWeekStart(today);
    return <HistorySheet open={!!week} onClose={() => onChange(null)} title={t.rewards.journalTitle} centered>
        {week && <div className="space-y-4">
            <div className="flex justify-between gap-3">
                <Button variant="outline" className="min-h-11" onClick={() => onChange(shiftDay(week, -7))}>{t.rewards.prevWeek}</Button>
                <Button variant="outline" className="min-h-11" disabled={week >= current} onClick={() => { if (week < current) onChange(shiftDay(week, 7)); }}>{t.rewards.nextWeek}</Button>
            </div>
            <WeeklyJournal key={week} start={week} />
        </div>}
    </HistorySheet>;
}
