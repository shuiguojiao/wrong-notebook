"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api-client";
import { createImportBatch } from "@/lib/import/import-batch-client";
import { createImportTask } from "@/lib/import/import-task-client";
import { UploadQueue } from "@/lib/import/upload-queue";
import { createUploadQueueStore } from "@/lib/import/upload-queue-store";
import type { QueuedUpload } from "@/lib/import/upload-queue-store";

export const UploadQueueContext = createContext<UploadQueue | null>(null);
const EMPTY: QueuedUpload[] = [];

/** 全局只挂载一次；页面切换后仍继续重传，登出则取消传输并清空本机队列。 */
export function useUploadQueueLifecycle() {
    const { data: session, status } = useSession();
    const [queue] = useState(() => new UploadQueue({
        store: createUploadQueueStore(),
        onLogout: () => {
            try { localStorage.setItem("wrong-notebook:uploads-cleared", String(Date.now())); } catch { /* 隐私模式无需跨标签页通知。 */ }
        },
        send: async (input, id, signal, userId) => {
            return "source" in input ? createImportBatch(input, id, { attempts: 1, signal, userId }) : createImportTask(input, id, { attempts: 1, signal, userId });
        },
        fallback: (input, id, signal, userId) => "source" in input ? createImportBatch(input, id, { signal, userId }) : createImportTask(input, id, { signal, userId }),
    }));
    useEffect(() => {
        if (status === "loading") return;
        let cancelled = false;
        if (status === "authenticated") {
            void queue.setUser(session?.user.id ?? null).then(() => queue.retry());
        } else {
            // 弱网也可能让 NextAuth 暂时返回空会话；确认服务器已退出后才删除照片。
            void apiClient.get<{ user?: { id?: string } }>("/api/auth/session").then(current => {
                if (!cancelled && !current.user?.id) return queue.setUser(null);
            }).catch(() => undefined);
        }
        return () => { cancelled = true; };
    }, [queue, session?.user.id, status]);
    useEffect(() => {
        const retry = () => { if (document.visibilityState !== "hidden" && navigator.onLine) void queue.retry(); };
        const cleared = (event: StorageEvent) => {
            if (event.key === "wrong-notebook:uploads-cleared") void queue.setUser(null);
        };
        const timer = setInterval(retry, 1000);
        window.addEventListener("storage", cleared);
        window.addEventListener("online", retry);
        window.addEventListener("focus", retry);
        window.addEventListener("pageshow", retry);
        document.addEventListener("visibilitychange", retry);
        return () => {
            clearInterval(timer);
            window.removeEventListener("storage", cleared);
            window.removeEventListener("online", retry);
            window.removeEventListener("focus", retry);
            window.removeEventListener("pageshow", retry);
            document.removeEventListener("visibilitychange", retry);
        };
    }, [queue]);
    return queue;
}


export function useUploadQueue() {
    const { data: session } = useSession();
    const queue = useContext(UploadQueueContext);
    if (!queue) throw new Error("UPLOAD_QUEUE_PROVIDER_REQUIRED");
    const items = useSyncExternalStore(queue.subscribe, queue.getSnapshot, () => EMPTY);
    return { queue, items: items.filter(item => item.userId === session?.user.id) };
}
