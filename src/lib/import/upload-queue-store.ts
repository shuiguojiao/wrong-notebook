import type { CreateImportBatchInput } from "@/lib/import/import-batch-client";
import type { CreateImportTaskInput } from "@/lib/import/import-task-client";

export type UploadQueueInput = CreateImportTaskInput | (CreateImportBatchInput & { source: "image"; imageBase64: string });

export interface QueuedUpload {
    id: string;
    userId: string;
    input: UploadQueueInput;
    attempts: number;
    nextAttemptAt: number;
    blocked: boolean;
    error?: string;
    status?: number;
}

export interface UploadQueueStore {
    list: (userId: string) => Promise<QueuedUpload[]>;
    put: (item: QueuedUpload) => Promise<void>;
    remove: (id: string) => Promise<void>;
    clear: () => Promise<void>;
}

/** 只在事务提交后确认写入；隐私模式、配额不足等错误交由调用方降级。 */
export function createUploadQueueStore(): UploadQueueStore {
    const open = () => new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("wrong-notebook-uploads", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("photos", { keyPath: "id" });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("INDEXEDDB_BLOCKED"));
    });
    const transaction = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
        const db = await open();
        return new Promise<T>((resolve, reject) => {
            const tx = db.transaction("photos", mode);
            const request = action(tx.objectStore("photos"));
            tx.oncomplete = () => { db.close(); resolve(request.result); };
            tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? request.error); };
        });
    };
    return {
        list: async (userId) => (await transaction("readonly", store => store.getAll()) as QueuedUpload[]).filter(item => item.userId === userId),
        put: async (item) => { await transaction("readwrite", store => store.put(item)); },
        remove: async (id) => { await transaction("readwrite", store => store.delete(id)); },
        clear: async () => { await transaction("readwrite", store => store.clear()); },
    };
}
