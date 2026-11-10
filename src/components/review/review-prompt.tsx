"use client";

import { useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { QuestionFigure } from '@/components/question-figure';
import { QuestionMeta } from '@/components/question/question-meta';
import { SourceThumb } from '@/components/question/source-thumb';
import { PaperCard } from '@/components/student/paper-card';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import type { ErrorItem } from '@/types/api';

interface ReviewPromptProps { item: ErrorItem; submitted: boolean }
interface ReviewSourceProps { src: string; errorItemId?: string; needsCheck?: boolean }

export function ReviewSource({ src, errorItemId, needsCheck = false }: ReviewSourceProps) {
    const { t } = useLanguage();
    if (!src && !needsCheck) return null;
    return <details className="review-disclosure">
        <summary>
            {needsCheck && <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-yellow-500 dark:bg-yellow-400" />}
            {needsCheck ? t.review.sourceNeedsCheck : t.review.sourceImage}
        </summary>
        {src && <SourceThumb errorItemId={errorItemId} src={src} alt={t.detail.originalProblem} className="pb-4" />}
        {needsCheck && errorItemId && <Link className="inline-flex min-h-11 items-center pb-4 text-sm text-primary hover:underline"
            href={`/checks?id=${encodeURIComponent(errorItemId)}`}>{t.student.takeALook}</Link>}
    </details>;
}

/** 作答阶段不挂载原图入口，避免原图中的作答和批改泄露答案。 */
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
    const question = <>
        <MarkdownRenderer content={text} />
        <QuestionFigure svg={item.figureSvg} scale={item.figureScale} align={item.figureAlign} />
    </>;
    const body = <>
        <QuestionMeta questionType={item.questionType ? t.questionType.names[item.questionType] || item.questionType : null}
            difficulty={item.difficultyStars} />
        {submitted ? <>
            <Button variant="ghost" className="h-auto min-h-11 w-full justify-between gap-3 whitespace-normal p-0 text-left font-normal"
                aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
                <span className="line-clamp-2 min-w-0">{text}</span>
                <ChevronDown aria-hidden="true" className={`size-4 shrink-0 ${expanded ? 'rotate-180' : ''}`} />
            </Button>
            {expanded && question}
            <div className="hidden lg:landscape:block"><ReviewSource errorItemId={item.id} src={item.originalImageUrl} needsCheck={item.needsCheck} /></div>
        </> : <>
            <div id={`review-question-${item.id}`} ref={content} className="review-question-text" data-collapsed={longQuestion && !fullQuestion}>
                <MarkdownRenderer content={text} />
            </div>
            {longQuestion && <Button variant="outline" className="review-question-toggle min-h-11" aria-controls={`review-question-${item.id}`}
                aria-expanded={fullQuestion} onClick={() => setFullQuestion(value => !value)}>
                {fullQuestion ? t.student.collapseQuestion : t.student.expandQuestion}
            </Button>}
            <QuestionFigure svg={item.figureSvg} scale={item.figureScale} align={item.figureAlign} />
        </>}
    </>;
    return submitted ? <div className="review-prompt min-w-0 space-y-4">{body}</div>
        : <PaperCard tape className="review-prompt review-question-paper">{body}</PaperCard>;
}
