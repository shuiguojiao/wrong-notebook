"use client";

import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";
import { QuestionFigure } from "@/components/question-figure";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";

interface RowFigureProps {
    url?: string;
    hasSource: boolean;
}

/** 配图按需读取；旧数据没有可渲染的 SVG 时回退到出处标识。 */
export function RowFigure({ url, hasSource }: RowFigureProps) {
    const { t } = useLanguage();
    const [figure, setFigure] = useState<{ url: string; svg: string | null } | null>(null);
    useEffect(() => {
        if (!url) return;
        let cancelled = false;
        apiClient.get<{ svg: string | null }>(url)
            .then(data => { if (!cancelled) setFigure({ url, svg: data.svg }); })
            .catch(() => { if (!cancelled) setFigure({ url, svg: null }); });
        return () => { cancelled = true; };
    }, [url]);
    if (url && figure?.url === url && figure.svg) {
        return <div className="w-20 shrink-0"><QuestionFigure svg={figure.svg} className="my-0 [&_img]:!max-h-16 [&_img]:p-1" /></div>;
    }
    if (!hasSource) return null;
    return <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Paperclip className="size-4" aria-hidden="true" />{t.review.sourceImage}</span>;
}
