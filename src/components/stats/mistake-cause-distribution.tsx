"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import type { AnalyticsData } from "@/types/api";

interface MistakeCauseDistributionProps {
    stats: NonNullable<AnalyticsData["mistakeCauseStats"]>;
    subjectId?: string;
    range: AnalyticsData["range"];
}

export function MistakeCauseDistribution({ stats, subjectId, range }: MistakeCauseDistributionProps) {
    const { t } = useLanguage();
    const total = stats.reduce((sum, row) => sum + row.count, 0);
    const path = subjectId ? `/notebooks/${encodeURIComponent(subjectId)}` : "/notebooks";
    return <Card>
        <CardHeader>
            <CardTitle>{t.mistakeCause.distribution}</CardTitle>
            <p className="text-sm text-muted-foreground">{t.mistakeCause.distributionNote}</p>
        </CardHeader>
        <CardContent>
            <ul className="space-y-1">
                {stats.map(({ cause, count }) => {
                    const params = new URLSearchParams({ cause, mastery: "unmastered" });
                    if (range && range !== "all") params.set("timeRange", range);
                    return <li key={cause}>
                        <Link href={`${path}?${params}`} className="block min-h-11 space-y-1 rounded-md px-2 py-1.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <span className="flex justify-between gap-3 text-sm">
                                <span>{t.mistakeCause.names[cause]}</span><span className="tabular-nums">{count}</span>
                            </span>
                            <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-muted">
                                <span className="block h-full rounded-full bg-primary" style={{ width: `${total ? count / total * 100 : 0}%` }} />
                            </span>
                        </Link>
                    </li>;
                })}
            </ul>
        </CardContent>
    </Card>;
}
