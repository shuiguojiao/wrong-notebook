"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { MISTAKE_CAUSES, normalizeMistakeCause } from "@/lib/question/mistake-cause";
import { cn } from "@/lib/utils";
import type { MistakeCause } from "@/lib/question/mistake-cause";

interface MistakeCauseSelectProps {
    value?: string | null;
    onChange: (cause: MistakeCause | null) => void;
    sticker?: boolean;
}

const stickerColors = {
    concept: "border-violet-300 bg-violet-100 text-violet-950 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100",
    method: "border-sky-300 bg-sky-100 text-sky-950 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100",
    reading: "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
    calculation: "border-orange-300 bg-orange-100 text-orange-950 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-100",
    memory: "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
    unclassified: "bg-muted text-muted-foreground",
};

export function MistakeCauseSelect({ value, onChange, sticker = false }: MistakeCauseSelectProps) {
    const { t } = useLanguage();
    const cause = normalizeMistakeCause(value) ?? "unclassified";
    return <Select value={cause} onValueChange={next => onChange(normalizeMistakeCause(next))}>
        <SelectTrigger aria-label={t.mistakeCause.label}
            className={cn("min-h-11 max-w-full", sticker && ["student-sticker rounded-full font-semibold", stickerColors[cause]])}>
            <SelectValue />
        </SelectTrigger>
        <SelectContent>
            {([...MISTAKE_CAUSES, "unclassified"] as const).map(key => <SelectItem key={key} value={key}>
                {t.mistakeCause.names[key]}
            </SelectItem>)}
        </SelectContent>
    </Select>;
}
