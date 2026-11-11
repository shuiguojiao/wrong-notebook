"use client";

import { useId } from 'react';
import { SourceThumb } from '@/components/question/source-thumb';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { questionNeedsFigure } from '@/lib/question-needs-figure';
import type { ErrorItem } from '@/types/api';

interface ReviewSourcePeekProps { item: ErrorItem }

export function ReviewSourcePeek({ item }: ReviewSourcePeekProps) {
    const { t } = useLanguage();
    const hintId = useId();
    if (!item.originalImageUrl?.trim() || !questionNeedsFigure(item)) return null;
    return <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <SourceThumb errorItemId={item.id} src={item.originalImageUrl} alt={t.detail.originalProblem}
            trigger={<Button type="button" variant="outline" className="min-h-11" aria-describedby={hintId}>
                {t.student.viewOriginal}
            </Button>} />
        <span id={hintId} className="text-sm text-muted-foreground">{t.student.originalMayContainAnswer}</span>
    </div>;
}
