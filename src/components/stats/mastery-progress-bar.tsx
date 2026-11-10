"use client";

import { useLanguage } from "@/contexts/LanguageContext";

interface MasteryProgressBarProps {
    total: number;
    newCount: number;
    reviewingCount: number;
    masteredCount: number;
}

/** 两段式掌握状态进度条：还没掌握 / 已掌握 */
export function MasteryProgressBar({ total, newCount, reviewingCount, masteredCount }: MasteryProgressBarProps) {
    const { t } = useLanguage();
    if (total <= 0) return null;

    const segments = [
        { key: 'unmastered', count: newCount + reviewingCount, color: 'var(--warning)', label: t.student.unmastered },
        { key: 'mastered', count: masteredCount, color: 'var(--success)', label: t.student.mastered },
    ];

    return (
        <div className="space-y-2">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                {segments.map((seg) => {
                    if (seg.count <= 0) return null;
                    const pct = (seg.count / total) * 100;
                    return (
                        <div
                            key={seg.key}
                            className="h-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: seg.color }}
                        />
                    );
                })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
                {segments.map((seg) => {
                    if (seg.count <= 0) return null;
                    return (
                        <div key={seg.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: seg.color }}
                            />
                            <span>{seg.label}</span>
                            <span className="font-medium">{seg.count}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
