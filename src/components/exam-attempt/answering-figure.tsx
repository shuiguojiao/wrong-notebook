"use client";

import { useState } from 'react';
import { QuestionFigure } from '@/components/question-figure';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { figureSvgToDataUri } from '@/lib/figure-svg';
import type { ExamAttemptQuestion } from '@/types/api';

interface AnsweringFigureProps { question: ExamAttemptQuestion }
export function AnsweringFigure({ question }: AnsweringFigureProps) {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    if (!question.figureSvg) return null;
    return <div>
        <QuestionFigure svg={question.figureSvg} scale={question.figureScale} align={question.figureAlign} />
        <Button variant="outline" className="min-h-11" onClick={() => setOpen(true)}>{t.examAnswering.zoomFigure}</Button>
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent aria-describedby={undefined} className="max-w-4xl [&>button]:min-h-11 [&>button]:min-w-11">
                <DialogTitle>{t.figure.alt}</DialogTitle>
                <img src={figureSvgToDataUri(question.figureSvg)} alt={t.figure.alt} className="max-h-[75dvh] w-full rounded-md bg-white object-contain" />
            </DialogContent>
        </Dialog>
    </div>;
}
