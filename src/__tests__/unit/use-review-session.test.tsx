import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { useReviewSession } from '@/lib/hooks/use-review-session';
import { getReviewSummary } from '@/lib/review-session';
import type { ReviewOutcome } from '@/lib/review-session';
import type { ReviewSessionItem } from '@/types/api';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: mocks.get } }));

let root: Root;
let container: HTMLDivElement;
let session: ReturnType<typeof useReviewSession>;
const dayKey = 'student:2026-11-10';
const items: ReviewSessionItem[] = [
    { id: 'a', nextReviewAt: null }, { id: 'b', nextReviewAt: null }, { id: 'c', nextReviewAt: null },
];
function Harness() {
    const current = useReviewSession();
    useEffect(() => { session = current; });
    return null;
}
async function finish(outcomes: ReviewOutcome[]) {
    for (const outcome of outcomes) await act(async () => session.complete(outcome));
}

beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.get.mockReset();
    mocks.get.mockImplementation(async (url: string) => url.includes('overview')
        ? { items: [], todayReviewed: 3, dayKey } : { items, dayKey });
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await act(async () => root.render(<LanguageProvider><Harness /></LanguageProvider>));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('收工会话核对与统计', () => {
    it('做对、判错、跳过分别计数；撤销回退掌握变化、用时及后续跳过，不重复计数', async () => {
        await act(async () => session.start(''));
        const outcomes: ReviewOutcome[] = [
            { ...items[0], result: 'correct', durationSec: 61, masteryBefore: 'new', masteryAfter: 'mastered' },
            { ...items[1], result: 'wrong', durationSec: 64, masteryBefore: 'reviewing', masteryAfter: 'reviewing' },
            { ...items[2], result: 'skipped' },
        ];
        await finish(outcomes);
        expect(session).toMatchObject({ correct: 1, wrong: 1, skipped: 1 });
        expect(getReviewSummary(session.outcomes)).toEqual({ answered: 2, durationSec: 125, mastered: 1 });
        expect(session.completionDate).toBeUndefined();
        await act(async () => session.undo('b'));
        expect(session).toMatchObject({ correct: 1, wrong: 0, skipped: 0, current: items[1] });
        expect(getReviewSummary(session.outcomes)).toEqual({ answered: 1, durationSec: 61, mastered: 1 });
        await act(async () => session.undo('a'));
        expect(getReviewSummary(session.outcomes)).toEqual({ answered: 0, durationSec: 0, mastered: 0 });
        await finish(outcomes.slice(0, 2));
        await finish([outcomes[1]]);
        expect(session.outcomes).toHaveLength(2);
    });
    it('只有未掌握变为已掌握才新增计数，缺任一前后状态则未知', () => {
        const correct = { id: 'a', nextReviewAt: null, result: 'correct' as const };
        expect(getReviewSummary([
            { ...correct, masteryBefore: 'mastered', masteryAfter: 'mastered' },
            { ...correct, id: 'b', masteryBefore: 'reviewing', masteryAfter: 'mastered' },
            { ...correct, id: 'c', masteryBefore: 'new', masteryAfter: 'reviewing' },
        ]).mastered).toBe(1);
        expect(getReviewSummary([{ ...correct, masteryBefore: 'new' }]).mastered).toBeNull();
        expect(getReviewSummary([{ ...correct, masteryAfter: 'mastered' }]).mastered).toBeNull();
    });
    it('单科做完后核对全科为空才能盖章，撤销立即撤章', async () => {
        await act(async () => session.start('math'));
        await finish(items.map(item => ({ ...item, result: 'correct' })));
        expect(mocks.get).toHaveBeenLastCalledWith('/api/review/due?format=overview');
        expect(session.completionDate).toBe('2026-11-10');
        await act(async () => session.undo('c'));
        expect(session.completionDate).toBeUndefined();
    });
    it.each(['pending', 'failed', 'midnight', 'no-evidence'])('全科未完成、核对失败、跨日或缺证据不盖章：%s', async kind => {
        await act(async () => session.start('math'));
        if (kind === 'failed') mocks.get.mockRejectedValueOnce(new Error('离线'));
        else mocks.get.mockResolvedValueOnce({ items: kind === 'pending' ? [items[0]] : [], dayKey: kind === 'midnight' ? 'student:2026-11-11' : dayKey, todayReviewed: kind === 'no-evidence' ? 0 : 3 });
        await finish(items.map(item => ({ ...item, result: 'correct' })));
        expect(session.completionDate).toBeUndefined();
        expect(session.outcomes).toHaveLength(3);
    });
    it('单科未覆盖开始时全科任务，即使额度变化后全科队列为空也不盖章', async () => {
        mocks.get.mockImplementation(async (url: string) => url.includes('overview')
            ? { items: [items[0], { id: 'other-subject', nextReviewAt: null }], dayKey, todayReviewed: 0 }
            : { items: [items[0]], dayKey });
        await act(async () => session.start('math'));
        mocks.get.mockResolvedValue({ items: [], dayKey, todayReviewed: 1 });
        await finish([{ ...items[0], result: 'correct' }]);
        expect(session.completionDate).toBeUndefined();
        expect(mocks.get).toHaveBeenCalledTimes(2);
    });
    it('核对晚到结果不能覆盖撤销后的状态', async () => {
        await act(async () => session.start(''));
        let resolve!: (data: object) => void;
        mocks.get.mockReturnValueOnce(new Promise(done => { resolve = done; }));
        await finish(items.map(item => ({ ...item, result: 'correct' })));
        await act(async () => session.undo('c'));
        await act(async () => resolve({ items: [], dayKey, todayReviewed: 3 }));
        expect(session.completionDate).toBeUndefined();
    });
    it('加练防连点、去重并限制五题，每组独立计数，完成也不盖当天章', async () => {
        const many = Array.from({ length: 9 }, (_, index) => ({ id: String(index), nextReviewAt: null }));
        mocks.get.mockResolvedValue({ items: [many[0], ...many], dayKey });
        await act(async () => { void session.start('', 'extra'); void session.start('', 'extra'); });
        expect(mocks.get).toHaveBeenCalledTimes(1);
        expect(session.items?.map(item => item.id)).toEqual(['0', '1', '2', '3', '4']);
        await finish(session.items!.map(item => ({ ...item, result: 'correct' })));
        expect(session.correct).toBe(5);
        expect(session.completionDate).toBeUndefined();
        await act(async () => session.start('', 'extra'));
        expect(session.correct).toBe(0);
        expect(session.outcomes).toEqual([]);
        expect(mocks.get).toHaveBeenCalledTimes(2);
    });
});
