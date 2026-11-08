import { describe, expect, it } from 'vitest';
import { getDayRange } from '@/lib/date-time';
import { defaultReviewSeconds, estimateReviewSeconds, reviewSeconds, reviewSubjectKey } from '@/lib/review-duration';
import { selectReviewDate } from '@/lib/review-load';
import { extraReviewQueue, hasReviewBacklog, sortReviewQueue, takeReviewBudget } from '@/lib/review-queue';
import type { QueueItem } from '@/lib/review-queue';
import { rebuildReviewState, reviewHash, reviewWindowDays } from '@/lib/review-schedule';

const zone = 'Asia/Shanghai';
const now = new Date('2026-11-08T04:00:00Z');
const day = (offset: number) => getDayRange(now, zone, offset).start;
const subject = { name: '数学', subjectKey: 'math' };
const question = (id: string, subjectId = 'math', estimatedSec = 240, reviewStage = 0, offset = -1): QueueItem => ({
    id, subjectId, subject: { name: subjectId, subjectKey: subjectId }, reviewStage, nextReviewAt: day(offset), estimatedSec,
});

describe('单题用时估计', () => {
    it.each([['math', 240], ['physics', 240], ['chemistry', 240], ['biology', 120], ['geography', 120], ['history', 120], ['politics', 120], ['chinese', 120], ['english', 60], ['unknown', 120]])('%s 默认 %i 秒', (key, seconds) => {
        expect(defaultReviewSeconds(key)).toBe(seconds);
    });
    it('按科目 key 分类，无 key 时推断名称，未知科目回退', () => {
        expect(reviewSubjectKey({ name: '英语错题' })).toBe('english');
        expect(reviewSubjectKey({ name: '数学', subjectKey: 'english' })).toBe('english');
        expect(reviewSeconds(null, new Map())).toBe(120);
    });
    const samples = (values: (number | null)[]) => values.map((durationSec, i) => ({ durationSec, subject, createdAt: new Date(now.getTime() + i * 1000) }));
    it('有效样本不足五条时不校准，异常值不占样本名额', () => {
        expect(reviewSeconds(subject, estimateReviewSeconds(samples([10, 100, 200, 1800, 9, 1801, null, NaN])))).toBe(240);
    });
    it('有效边界包含十秒和三十分钟，奇偶样本中位数正确', () => {
        expect(reviewSeconds(subject, estimateReviewSeconds(samples([10, 40, 90, 100, 1800])))).toBe(90);
        expect(reviewSeconds(subject, estimateReviewSeconds(samples([10, 40, 90, 100, 200, 1800])))).toBe(95);
    });
    it('乱序输入仍只取最近二十条有效数据，按科目分别校准', () => {
        const history = samples([...Array(20).fill(20), ...Array(20).fill(100)]).reverse();
        const english = samples([60, 60, 60, 60, 60]).map(row => ({ ...row, subject: { name: 'English', subjectKey: 'english' } }));
        expect(estimateReviewSeconds([...history, ...english])).toEqual(new Map([['math', 100], ['english', 60]]));
    });
});

describe('分钟队列、积压及额外一组', () => {
    it('额度截断，下一题超额即停，即使后面的题较短', () => {
        expect(takeReviewBudget([question('a'), question('b'), question('c', 'math', 30)], 300, false).map(q => q.id)).toEqual(['a']);
    });
    it('各科轮流取题，组内保持优先级', () => {
        expect(takeReviewBudget([question('m1'), question('m2'), question('e1', 'english', 60), question('e2', 'english', 60)], 600, true).map(q => q.id)).toEqual(['m1', 'e1', 'm2', 'e2']);
    });
    it('第一题总放行，已复习过时不能再次超额放行', () => {
        expect(takeReviewBudget([question('a', 'math', 1200), question('b')], 600, true)).toHaveLength(1);
        expect(takeReviewBudget([question('a')], 120, false)).toHaveLength(0);
        expect(takeReviewBudget([question('a')], 0, false)).toHaveLength(0);
    });
    it('优先轮次，再逾期比例、日期、ID；不依赖输入顺序', () => {
        const items = [question('z', 'math', 240, 1, -10), question('b', 'math', 240, 0, -1),
            question('a', 'math', 240, 0, -1), question('e', 'english', 60, 0, -1), question('late', 'math', 240, 0, -4)];
        expect(sortReviewQueue(items, now, zone).map(q => q.id)).toEqual(['late', 'e', 'a', 'b', 'z']);
        expect(sortReviewQueue(items.reverse(), now, zone).map(q => q.id)).toEqual(['late', 'e', 'a', 'b', 'z']);
    });
    it('积压严格超过三天额度才提示', () => {
        expect(hasReviewBacklog(5400, 30)).toBe(false); expect(hasReviewBacklog(5401, 30)).toBe(true);
    });
    it('额外一组先积压，按优先级取约十五分钟，不混入未来题', () => {
        expect(extraReviewQueue([question('b'), question('a'), question('c'), question('d')], [question('future', 'math', 240, 2, 1)], now, zone).map(q => q.id)).toEqual(['a', 'b', 'c']);
    });
    it('无积压时仅取未来三天且至少第二轮，第四天和今天不算提前复习', () => {
        const items = [question('d3', 'math', 240, 2, 3), question('d1', 'math', 240, 2, 1), question('d4', 'math', 240, 2, 4), question('young', 'math', 240, 1, 1), question('today', 'math', 240, 2, 0)];
        expect(extraReviewQueue([], items, now, zone).map(q => q.id)).toEqual(['d1', 'd3']);
    });
});

describe('负载选日与提前作答', () => {
    it('在候选窗口中选择估计负载最少的一天', () => {
        const loads = [6, 7].map((offset, i) => ({ id: String(i), nextReviewAt: day(offset), estimatedSec: 240 }));
        expect(selectReviewDate('a', 1, 'method', now, loads, zone)).toEqual(day(8));
    });
    it('并列时固定哈希选择，排除本题自身旧安排', () => {
        const selected = selectReviewDate('a', 1, 'method', now, [], zone);
        expect(selected).toEqual(day(6 + reviewHash('a', 1) % 3));
        expect(selectReviewDate('a', 1, 'method', now, [{ id: 'a', nextReviewAt: selected, estimatedSec: 10000 }], zone)).toEqual(selected);
        expect(selectReviewDate('a', 1, 'method', now, [], zone)).toEqual(selected);
    });
    it('提前做对从原定到期日算新间隔，做错仍从作答日算', () => {
        const item = { id: 'early', subject, createdAt: day(0) };
        const initial = rebuildReviewState(item, [], [], zone);
        const correct = rebuildReviewState(item, [{ result: 'correct', confidence: 'unsure', createdAt: day(1) }], [], zone);
        const wrong = rebuildReviewState(item, [{ result: 'wrong', createdAt: day(1) }], [], zone);
        expect(initial.nextReviewAt).toEqual(day(reviewWindowDays('early', 0, 'method')));
        expect(correct.nextReviewAt).toEqual(day(reviewWindowDays('early', 0, 'method') + reviewWindowDays('early', 1, 'method')));
        expect(wrong.nextReviewAt).toEqual(day(1 + reviewWindowDays('early', 0, 'method')));
    });
});
