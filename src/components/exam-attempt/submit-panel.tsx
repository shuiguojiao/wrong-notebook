"use client";

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import type { QuestionNumberState } from './question-numbers';

interface SubmitPanelProps { open: boolean; busy: boolean; items: QuestionNumberState[]; onOpenChange: (open: boolean) => void; onSelect: (index: number) => void; onSubmit: () => void }
export function SubmitPanel({ open, busy, items, onOpenChange, onSelect, onSubmit }: SubmitPanelProps) {
    const { t } = useLanguage();
    const unanswered = items.filter(item => !item.answered);
    const flagged = items.filter(item => item.flagged);
    const allDone = !unanswered.length && !flagged.length;
    const numbers = (subset: QuestionNumberState[]) => <div className="flex flex-wrap gap-2">{subset.map(item => <Button key={item.id} className="min-h-11 min-w-11" variant="outline" disabled={busy} onClick={() => { onOpenChange(false); onSelect(items.indexOf(item)); }}>{item.number}</Button>)}</div>;
    return <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
        <DialogContent aria-describedby={undefined} className="max-h-[85dvh] overflow-y-auto [&>button]:min-h-11 [&>button]:min-w-11">
            <DialogTitle>{t.examAnswering.submit}</DialogTitle>
            {allDone ? <p>{t.examAnswering.allAnswered.replace('{count}', String(items.length))}</p> : <div className="space-y-4">
                <p>{t.examAnswering.answeredCount.replace('{answered}', String(items.length - unanswered.length)).replace('{total}', String(items.length))}</p>
                {!!unanswered.length && <section className="space-y-2"><h3>{t.examAnswering.unanswered} · {unanswered.length}</h3>{numbers(unanswered)}</section>}
                {!!flagged.length && <section className="space-y-2"><h3>{t.examAnswering.flagged} · {flagged.length}</h3>{numbers(flagged)}</section>}
            </div>}
            {!allDone && <p className="text-sm text-muted-foreground">{t.examAnswering.irreversible}</p>}
            <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => onOpenChange(false)}>{t.examAnswering.checkAgain}</Button>
                <Button className="min-h-11" disabled={busy} onClick={onSubmit}>{busy ? t.examAnswering.waitingSave : t.examAnswering.submit}</Button>
            </div>
        </DialogContent>
    </Dialog>;
}
