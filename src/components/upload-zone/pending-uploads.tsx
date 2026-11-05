"use client";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import type { QueuedUpload } from "@/lib/import/upload-queue-store";
import { useUploadQueue } from "@/lib/hooks/use-upload-queue";

/** 本机队列与服务端识别任务分开显示，避免把待上传误认为已提交。 */
export function PendingUploads() {
    const { t } = useLanguage();
    const { queue, items } = useUploadQueue();
    if (!items.length) return null;
    const message = (item: QueuedUpload) => {
        if (item.status === 401) return t.upload.queueAuth;
        if (item.status === 415) return t.upload.queueFormat;
        const error = item.error;
        const errors: Record<string, unknown> = { ...t.practice.errors, ...t.errors };
        const mapped = errors[error ?? ""];
        return typeof mapped === "string" ? mapped : error ?? t.upload.queueBlocked;
    };
    return (
        <section className="mx-4 mt-4 space-y-3 rounded-lg border p-4 md:mx-auto md:max-w-4xl print:hidden" data-testid="pending-uploads" aria-label={t.upload.queueTitle}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p role="status">{t.upload.queueCount.replace("{n}", String(items.length))}</p>
                <Button className="min-h-12" variant="outline" onClick={() => void queue.retry(true)}>{t.upload.queueRetry}</Button>
            </div>
            <p className="text-sm text-muted-foreground">{t.upload.queueLocal}</p>
            {items.map((item, index) => (
                <div key={item.id} className="flex items-center justify-between gap-2" data-testid="pending-upload" data-attempts={item.attempts} data-blocked={item.blocked}>
                    <img src={item.input.imageBase64} alt={t.upload.queuePhoto.replace("{n}", String(index + 1))} className="h-16 w-16 shrink-0 rounded bg-muted object-contain" />
                    <p className="min-w-0 flex-1 break-words text-sm">
                        {t.upload.queuePhoto.replace("{n}", String(index + 1))}{": "}
                        {item.blocked ? message(item) : t.upload.queueWaiting}
                    </p>
                    <Button className="min-h-12 shrink-0" variant="ghost" onClick={() => void queue.remove(item.id)}>{t.upload.queueDelete}</Button>
                </div>
            ))}
        </section>
    );
}
