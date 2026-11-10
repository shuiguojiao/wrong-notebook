"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckEntry } from "@/components/checks/check-entry";
import { PaperCard } from "@/components/student/paper-card";
import { TaskPanel } from "@/components/tasks/task-panel";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/lib/feedback";
import { useBackgroundTasks } from "@/lib/hooks/use-background-tasks";
import { usePendingExams } from "@/lib/hooks/use-pending-exams";
import { usePendingChecks } from "@/lib/hooks/use-pending-checks";
import { useImportTaskList } from "@/lib/hooks/use-import-tasks";

/** 顶栏识别提示迁到今天，沿用原 hook、结束提示与未读规则。 */
export function TodayTaskStatus() {
    const { t } = useLanguage();
    const { data, error } = useImportTaskList();
    const tasks = useBackgroundTasks();
    const exams = usePendingExams();
    const checks = usePendingChecks();
    const [open, setOpen] = useState(false);
    const activeIds = useRef<Set<string> | null>(null);
    useEffect(() => {
        if (!data) return;
        const nowActive = new Set([
            ...data.tasks.filter(task => task.status === "analyzing" || task.status === "saving").map(task => task.id),
            ...(data.batches ?? []).filter(batch => batch.phase === "splitting" || batch.phase === "processing").map(batch => `batch:${batch.id}`),
        ]);
        const unread = new Set([
            ...data.tasks.filter(task => task.unread).map(task => task.id),
            ...(data.batches ?? []).filter(batch => batch.unread).map(batch => `batch:${batch.id}`),
        ]);
        if (activeIds.current && [...activeIds.current].some(id => !nowActive.has(id) && unread.has(id))) toast.info(t.importTasks.finishedToast);
        activeIds.current = nowActive;
    }, [data, t.importTasks.finishedToast]);

    // 批次 activeCount 是批次数；状态卡按已知的题数汇总，分题中另用原阶段文字。
    const activeCount = (data?.tasks.filter(task => task.status === "analyzing" || task.status === "saving").length ?? 0)
        + (data?.batches ?? []).reduce((sum, batch) => sum + batch.counts.active, 0);
    const splitting = data?.batches?.some(batch => batch.phase === "splitting");
    const failed = data?.tasks.some(task => task.status === "failed") || data?.batches?.some(batch => batch.phase === "failed" || batch.counts.failed > 0);
    const results = data?.tasks.some(task => task.status === "review" || (task.status === "saved" && task.unread)) || data?.batches?.some(batch => batch.phase === "draft" || (batch.unread && batch.counts.review + batch.counts.saved > 0));
    // 已处理完的识别任务会保留 7 天，只有需要关注的状态才显示状态卡，避免空卡片。
    const hasImports = activeCount > 0 || !!splitting || !!failed || !!results;
    // 后台任务 store 只保留未关闭的任务，完成后的结果也需要能打开。
    const tasksNeedAttention = tasks.length > 0;
    if (!hasImports && !tasksNeedAttention && !error && !checks?.total && !exams.attempts.length && !exams.error) return null;
    return <PaperCard aria-label={t.backgroundTasks.title} data-testid="today-task-status"><div className="divide-y">
        {(hasImports || error) && <Link href="/import-tasks" data-testid="import-tasks-entry" className="flex min-h-11 flex-col justify-center gap-1 rounded-md px-2 hover:bg-muted">
            <span role="status">
                {activeCount > 0 ? t.student.recognizingCount.replace("{count}", String(activeCount)) : splitting ? t.importBatch.phase.splitting : t.importTasks.entry}
            </span>
            {failed && <span>{t.student.recognitionFailed}</span>}
            {results && <span>{t.student.resultsReady}{!!data?.unreadCount && <span data-testid="import-tasks-unread"> · {t.importTasks.entryUnread.replace("{count}", String(data.unreadCount))}</span>}</span>}
            {error && <span className="text-sm text-muted-foreground">{t.student.tasksLoadFailed}</span>}
        </Link>}
        {tasksNeedAttention && <Button variant="outline" className="min-h-11 w-full" onClick={() => setOpen(true)}>{t.backgroundTasks.title}{tasks.some(task => task.status === "failed") ? ` · ${t.backgroundTasks.status.failed}` : tasks.some(task => task.status === "running") ? ` · ${t.backgroundTasks.status.running}` : ` · ${t.student.resultsReady}`}</Button>}
        {exams.attempts.map(attempt => <Link key={attempt.id} href={`/exams/${attempt.paperId}/attempts/${attempt.id}`} className="flex min-h-11 items-center px-2 py-3 hover:bg-muted"><span role="status">{(attempt.status === 'grading' ? t.examAnswering.gradingToday : t.examAnswering.readyToday).replace('{title}', attempt.paper.title)}</span></Link>)}
        {exams.error && <p role="status" className="px-2 py-3 text-sm text-muted-foreground">{t.examAnswering.statusLoadFailed}</p>}
        <CheckEntry count={checks?.total ?? 0} compact />
        {open && <TaskPanel open={open} onOpenChange={setOpen} />}
    </div></PaperCard>;
}
