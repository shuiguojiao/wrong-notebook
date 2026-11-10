"use client";

import { useEffect, useRef, useState } from 'react';
import { Check, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

export interface QuestionNumberState { id: string; number: number; answered: boolean; flagged: boolean; graded?: boolean }
interface QuestionNumbersProps { items: QuestionNumberState[]; current: number; onSelect?: (index: number) => void; progress?: boolean }
export function QuestionNumbers({ items, current, onSelect, progress = false }: QuestionNumbersProps) {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    const active = useRef<HTMLButtonElement>(null);
    useEffect(() => { active.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); }, [current, open]);
    const buttons = items.map((item, index) => {
        const state = progress ? item.graded ? t.examAnswering.graded : t.examAnswering.gradingPending : item.flagged ? t.examAnswering.flagged : item.answered ? t.examAnswering.answered : t.examAnswering.unanswered;
        return <Button key={item.id} type="button" ref={index === current ? active : undefined} aria-current={index === current ? 'step' : undefined}
            aria-label={`${t.examAttempt.question.replace('{number}', String(item.number))} · ${state}`}
            variant={item.answered && !progress ? 'default' : 'outline'} disabled={!onSelect}
            className={`relative min-h-11 min-w-11 shrink-0 rounded-full px-2 ${index === current ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : ''} ${progress ? 'disabled:opacity-100' : ''}`}
            onClick={() => { onSelect?.(index); setOpen(false); }}>
            <span>{item.number}</span>
            {progress ? item.graded && <Check aria-hidden className="size-4" /> : item.flagged && <Flag aria-hidden className="size-4" />}
        </Button>;
    });
    return <nav aria-label={t.examAnswering.numbers} className="min-w-0 px-1 lg:flex lg:items-center lg:gap-4">
        {!progress && <Button variant="outline" className="min-h-11 lg:hidden" aria-expanded={open} aria-controls="exam-number-panel" onClick={() => setOpen(!open)}>{items[current]?.number}/{items.length} ▾</Button>}
        <div id="exam-number-panel" className={progress ? 'flex flex-wrap gap-3' : `${open ? 'flex flex-wrap' : 'hidden'} gap-3 py-2 lg:flex lg:min-w-0 lg:flex-1 lg:flex-nowrap lg:overflow-x-auto lg:p-1`}>
            {buttons}
        </div>
        {!progress && <p className={`${open ? 'flex' : 'hidden'} flex-wrap items-center gap-x-4 gap-y-1 pb-2 text-xs text-muted-foreground lg:flex lg:shrink-0 lg:pb-0`}><span>● {t.examAnswering.answered}</span><span>○ {t.examAnswering.unanswered}</span><span className="inline-flex items-center gap-1"><Flag className="size-3" aria-hidden />{t.examAnswering.flagged}</span></p>}
    </nav>;
}
