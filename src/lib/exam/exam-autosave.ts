import type { ExamAnswerDraft, StoredExamDraft } from './exam-answering-draft';

export type ExamSaveStatus = 'saved' | 'saving' | 'retrying';
interface AutosaveOptions {
    persist: (id: string, value: StoredExamDraft) => Promise<unknown>;
    send: (id: string, draft: ExamAnswerDraft, durationSec: number) => Promise<unknown>;
    duration: () => number;
    online: () => boolean;
    notify: () => void;
}
/** 保存始终串行；网络返回时只确认发送的版本，不能吞掉发送期间的新笔迹。 */
export class ExamAutosave {
    drafts: Record<string, ExamAnswerDraft> = {};
    status: ExamSaveStatus = 'saved';
    private versions = new Map<string, number>();
    private dirty = new Set<string>();
    private writes = new Map<string, Promise<unknown>>();
    private running: Promise<boolean> | null = null;
    private timer?: ReturnType<typeof setTimeout>;
    private failures = 0;
    private disposed = false;
    constructor(private options: AutosaveOptions) {}
    restore(id: string, draft: ExamAnswerDraft, dirty = false) {
        this.drafts[id] = draft;
        if (dirty) { this.dirty.add(id); this.versions.set(id, 1); }
    }
    private persist(id: string, dirty: boolean) {
        const value = { draft: this.drafts[id], dirty, durationSec: this.options.duration() };
        const previous = this.writes.get(id) ?? Promise.resolve();
        const next = previous.catch(() => undefined).then(() => this.options.persist(id, value));
        // 立刻接住拒绝，flush 时仍会检查该持久化是否成功。
        void next.catch(() => { this.status = 'retrying'; this.options.notify(); });
        this.writes.set(id, next);
        return next;
    }
    update(id: string, draft: ExamAnswerDraft) {
        this.drafts = { ...this.drafts, [id]: draft };
        this.versions.set(id, (this.versions.get(id) ?? 0) + 1);
        this.dirty.add(id);
        this.status = 'saving';
        void this.persist(id, true);
        this.schedule(2000);
        this.options.notify();
    }
    private schedule(delay: number) {
        clearTimeout(this.timer);
        if (!this.disposed) this.timer = setTimeout(() => { void this.flush(); }, delay);
    }
    flush(): Promise<boolean> {
        clearTimeout(this.timer);
        if (this.running) return this.running;
        this.running = this.save().finally(() => { this.running = null; });
        return this.running;
    }
    private async save() {
        try {
            while (this.dirty.size) {
                if (!this.options.online()) throw new Error('OFFLINE');
                const id = [...this.dirty][0];
                const version = this.versions.get(id);
                const draft = this.drafts[id];
                this.status = 'saving'; this.options.notify();
                await this.persist(id, true);
                await this.options.send(id, draft, this.options.duration());
                if (version === this.versions.get(id)) {
                    await this.persist(id, false);
                    if (version === this.versions.get(id)) this.dirty.delete(id);
                }
            }
            this.failures = 0; this.status = 'saved'; this.options.notify();
            return true;
        } catch {
            this.status = 'retrying'; this.options.notify();
            this.schedule(Math.min(30000, 2000 * 2 ** this.failures++));
            return false;
        }
    }
    async persistLocal() {
        try { await Promise.all([...this.dirty].map(id => this.persist(id, true))); return true; }
        catch { return false; }
    }
    get pending() { return this.dirty.size > 0; }
    dispose() { this.disposed = true; clearTimeout(this.timer); }
}
