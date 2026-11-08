"use client";

import { MarkdownRenderer } from '@/components/markdown-renderer';
import { useLanguage } from '@/contexts/LanguageContext';

interface RecognizedAnswerProps { text?: string | null }
export function RecognizedAnswer({ text }: RecognizedAnswerProps) {
    const { t } = useLanguage();
    if (!text) return null;
    return <div className="space-y-2 rounded-md border p-3">
        <p className="text-sm font-medium">{t.handwriting.recognizedAnswer}</p>
        <MarkdownRenderer content={text} />
    </div>;
}
