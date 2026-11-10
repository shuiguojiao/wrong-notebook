"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { useLanguage } from "@/contexts/LanguageContext";

interface AttemptQuestionStemProps { questionId: string; text: string }

export function AttemptQuestionStem({ questionId, text }: AttemptQuestionStemProps) {
    const { t } = useLanguage();
    const [expanded, setExpanded] = useState(false);
    const [overflowing, setOverflowing] = useState(false);
    const content = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const element = content.current;
        if (!element || expanded) return;
        const measure = () => setOverflowing(element.scrollHeight > element.clientHeight + 1);
        measure();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        observer?.observe(element);
        // 内层尺寸变化也要复测，覆盖公式、图片和字体加载后的高度变化。
        if (element.firstElementChild) observer?.observe(element.firstElementChild);
        window.addEventListener('resize', measure);
        return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
    }, [text, expanded]);
    return (
        <div>
            <div id={`stem-${questionId}`} ref={content} className={expanded ? undefined : 'line-clamp-2'}>
                <MarkdownRenderer content={text} className="[&>:last-child]:mb-0" />
            </div>
            {(expanded || overflowing) && (
                <Button variant="ghost" className="min-h-11" aria-controls={`stem-${questionId}`} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                    {expanded ? t.common.collapse : t.common.expand}
                </Button>
            )}
        </div>
    );
}
