"use client";

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { QuestionFigure } from '@/components/question-figure';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

export interface InkQuestion { text: string; figureSvg?: string | null; figureScale?: number | null; figureAlign?: string | null }
interface InkWorkspaceProps {
    children: ReactNode;
    expanded: boolean;
    onCollapse: () => void;
    question?: InkQuestion;
    submit?: ReactNode;
    error?: string | null;
}

/** 同一个非模态对话框进入顶层后成为模态，画布与工具无需卸载或复制。 */
export function InkWorkspace({ children, expanded, onCollapse, question, submit, error }: InkWorkspaceProps) {
    const { t } = useLanguage();
    const dialog = useRef<HTMLDialogElement>(null);
    const closeButton = useRef<HTMLButtonElement>(null);
    const [showQuestion, setShowQuestion] = useState(false);
    useEffect(() => {
        const element = dialog.current;
        if (!element || !expanded) return;
        const previous = document.activeElement;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        // 原地转成浏览器顶层模态，避开抽屉、动画祖先的定位和裁切影响。
        element.close(); element.showModal();
        closeButton.current?.focus();
        return () => {
            element.close(); element.show();
            document.body.style.overflow = overflow;
            if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
        };
    }, [expanded]);
    return <dialog ref={dialog} open role={expanded ? 'dialog' : 'presentation'} aria-modal={expanded ? true : undefined}
        aria-label={expanded ? t.handwriting.handwriting : undefined} data-expanded={expanded}
        className="ink-workspace" onCancel={event => { event.preventDefault(); setShowQuestion(false); onCollapse(); }}>
        {expanded && <div className="relative flex shrink-0 items-center gap-2 pb-2">
            <Button type="button" variant="ghost" className="min-h-11 min-w-0 flex-1 justify-start" aria-expanded={showQuestion}
                onClick={() => setShowQuestion(value => !value)}>
                <span className="truncate">{question?.text || t.app.practiceProblem}</span>
            </Button>
            <Button ref={closeButton} type="button" variant="outline" className="min-h-11 shrink-0" onClick={() => { setShowQuestion(false); onCollapse(); }}>{t.handwriting.collapse}</Button>
            {submit}
            {showQuestion && <section className="absolute inset-x-0 top-full z-20 max-h-[60dvh] overflow-y-auto rounded-lg border bg-background p-4 shadow-xl" aria-label={t.app.practiceProblem}>
                <MarkdownRenderer content={question?.text || ''} />
                <QuestionFigure svg={question?.figureSvg} scale={question?.figureScale ?? undefined} align={question?.figureAlign} />
                <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={() => setShowQuestion(false)}>{t.student.collapseQuestion}</Button>
            </section>}
        </div>}
        {children}
        {expanded && error && <p role="alert" className="shrink-0 text-sm text-destructive">{error}</p>}
    </dialog>;
}
