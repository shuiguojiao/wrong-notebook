/** 同一目标在静默窗口内合并；执行中再次修改，只在本轮结束并静默后执行最新版。 */
export function createDebouncedQueue(operation: (id: string) => Promise<void>, onError: (id: string, error: unknown) => void, delay = 1500) {
    const pending = new Map<string, ReturnType<typeof setTimeout>>();
    const active = new Set<string>();
    const dirty = new Set<string>();
    const enqueue = (id: string) => {
        const old = pending.get(id);
        if (old) clearTimeout(old);
        dirty.add(id);
        const timer = setTimeout(() => {
            pending.delete(id);
            if (active.has(id)) return;
            dirty.delete(id);
            active.add(id);
            void operation(id).catch(error => onError(id, error)).finally(() => {
                active.delete(id);
                if (dirty.has(id) && !pending.has(id)) enqueue(id);
            });
        }, delay);
        timer.unref?.();
        pending.set(id, timer);
    };
    return {
        enqueue,
        clear: () => { for (const timer of pending.values()) clearTimeout(timer); pending.clear(); dirty.clear(); },
    };
}
