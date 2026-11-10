import type { AnswerInputMode } from '@/components/handwriting/answer-input';
import { emptyHistory } from '@/lib/handwriting/strokes';
import type { InkHistory } from '@/lib/handwriting/strokes';
import type { ExamAttemptAnswer } from '@/types/api';

export interface ExamAnswerDraft {
    text: string;
    ink: InkHistory;
    photos: string[];
    mode: AnswerInputMode;
    flagged: boolean;
    serverImage: boolean;
}
export interface StoredExamDraft { draft: ExamAnswerDraft; dirty: boolean; durationSec: number }
export const hasExamAnswer = (draft: ExamAnswerDraft) => !!(draft.text.trim() || draft.ink.strokes.length || draft.photos.length || draft.serverImage);
export function initialExamDraft(answer?: ExamAttemptAnswer): ExamAnswerDraft {
    return { text: answer?.answerText ?? '', ink: emptyHistory(), photos: [], mode: 'keyboard', flagged: answer?.flagged ?? false, serverImage: !!answer?.answerImageUrl };
}

/** 大图与可编辑笔迹放 IndexedDB，按不可猜测的作答 ID 与题目 ID 隔离。 */
function openDrafts(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('exam-answer-drafts', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('answers');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
export async function examDraftStorage<T>(key: string, write?: { value: T | null }): Promise<T | undefined> {
    const db = await openDrafts();
    try {
        return await new Promise<T | undefined>((resolve, reject) => {
            const tx = db.transaction('answers', write ? 'readwrite' : 'readonly');
            const store = tx.objectStore('answers');
            const request = write ? write.value === null ? store.delete(key) : store.put(write.value, key) : store.get(key);
            tx.oncomplete = () => resolve(write ? undefined : request.result as T | undefined);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } finally { db.close(); }
}
export const examDraftKey = (attemptId: string, questionId: string) => `${attemptId}:${questionId}`;
