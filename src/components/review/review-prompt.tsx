"use client";

import { useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { QuestionFigure } from '@/components/question-figure';
import { QuestionMeta } from '@/components/question/question-meta';
import { SourceThumb } from '@/components/question/source-thumb';
import { ReviewSourcePeek } from '@/components/review/review-source-peek';
import { PaperCard } from '@/components/student/paper-card';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import type { ErrorItem } from '@/types/api';

interface ReviewPromptProps { item: ErrorItem; submitted: boolean }
interface ReviewSourceProps { src: string; errorItemId?: string; needsCheck?: boolean }

export function ReviewSource({ src, errorItemId, needsCheck = false }: ReviewSourceProps) {
    const { t } = useLanguage();
    if (!src && !needsCheck) return null;
    return <PaperCard tape>
        <h2 className="mb-3 font-semibold">{t.student.paperOriginal}</h2>
        {src && <SourceThumb errorItemId={errorItemId} src={src} alt={t.detail.originalProblem} previewPage />}
        {needsCheck && <details className="review-disclosure">
            <summary>
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-yellow-500 dark:bg-yellow-400" />
                {t.review.sourceNeedsCheck}
            </summary>
            {errorItemId && <Link className="inline-flex min-h-11 items-center pb-4 text-sm text-primary hover:underline"
                href={`/checks?id=${encodeURIComponent(errorItemId)}`}>{t.student.takeALook}</Link>}
        </details>}
    </PaperCard>;
}

/** 作答时仅为缺配图的图表题提供主动查看入口，对照时沿用原图卡。 */
export function ReviewPrompt({ item, submitted }: ReviewPromptProps) {
    const { t } = useLanguage();
    const [expanded, setExpanded] = useState(false);
    const [fullQuestion, setFullQuestion] = useState(false);
    const [longQuestion, setLongQuestion] = useState(false);
    const content = useRef<HTMLDivElement>(null);
    const text = item.questionText || item.ocrText || '';
    useLayoutEffect(() => {
        const element = content.current;
        if (!element || submitted) return;
        const measure = () => {
            const line = Number.parseFloat(getComputedStyle(element).lineHeight) || 28;
            setLongQuestion(element.scrollHeight > line * 6 + 1);
        };
        measure();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        observer?.observe(element);
        window.addEventListener('resize', measure);
        return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
    }, [text, submitted]);
    const body = <>
        <QuestionMeta questionType={item.questionType ? t.questionType.names[item.questionType] || item.questionType : null}
            difficulty={item.difficultyStars} />
        {submitted ? <>
            <div id={`review-material-${item.id}`} className={expanded ? undefined : 'line-clamp-3'}>
                <MarkdownRenderer content={text} />
            </div>
            <Button variant="ghost" className="min-h-11 gap-2 px-0" aria-controls={`review-material-${item.id}`}
                aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
                {expanded ? t.student.collapseQuestion : t.student.expandQuestion}
                <ChevronDown aria-hidden="true" className={`size-4 shrink-0 ${expanded ? 'rotate-180' : ''}`} />
            </Button>
            {expanded && <QuestionFigure svg={item.figureSvg} scale={item.figureScale} align={item.figureAlign} />}
        </> : <>
            <div id={`review-question-${item.id}`} ref={content} className="review-question-text" data-collapsed={longQuestion && !fullQuestion}>
                <MarkdownRenderer content={text} />
            </div>
            {longQuestion && <Button variant="outline" className="review-question-toggle min-h-11" aria-controls={`review-question-${item.id}`}
                aria-expanded={fullQuestion} onClick={() => setFullQuestion(value => !value)}>
                {fullQuestion ? t.student.collapseQuestion : t.student.expandQuestion}
            </Button>}
            <QuestionFigure svg={item.figureSvg} scale={item.figureScale} align={item.figureAlign} />
            {!item.figureSvg && item.figurePreviewUrl && <img src={item.figurePreviewUrl} alt={t.figure.alt}
                className="my-3 max-h-90 max-w-full rounded border bg-white p-2" />}
            <ReviewSourcePeek key={item.id} item={item} />
        </>}
    </>;
    return submitted ? <div className="review-prompt min-w-0 space-y-4">
        <PaperCard tape>{body}</PaperCard>
        <ReviewSource errorItemId={item.id} src={item.originalImageUrl} needsCheck={item.needsCheck} />
    </div>
        : <PaperCard tape className="review-prompt review-question-paper">{body}</PaperCard>;
}
