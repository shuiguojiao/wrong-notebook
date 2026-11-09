"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePendingChecks } from "@/lib/hooks/use-pending-checks";

interface ImportCheckSummaryProps { ids: string[]; total?: number }

export function ImportCheckSummary({ ids, total = new Set(ids).size }: ImportCheckSummaryProps) {
    const { t } = useLanguage();
    const data = usePendingChecks(ids);
    if (!data?.total) return null;
    return <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
        {t.checks.importSummary.replace("{total}", String(total)).replace("{count}", String(data.total))}{" "}
        <Link href="/checks" className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">{t.checks.open} ›</Link>
    </p>;
}
