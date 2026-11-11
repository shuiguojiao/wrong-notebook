import { describe, expect, it } from 'vitest';
import { awardsForRecords, rewardMeta, REWARD_RULES_VERSION, settleDerived } from '@/lib/rewards/rules';
import type { Award, RewardRecord } from '@/lib/rewards/rules';
import { computeStudentProgress } from '@/lib/student-progress';
import type { StudentProgress } from '@/lib/student-progress';

const zone = 'Asia/Shanghai';
const now = new Date('2026-11-11T04:00:00Z');
const record = (id: string, extra: Partial<RewardRecord> = {}): RewardRecord => ({
    id, source: 'review', result: 'correct', errorItemId: 'item', examAttemptId: null, difficulty: null, createdAt: now, ...extra,
});
const items = new Map([['item', { difficultyStars: 4 }]]);
const award = (records: RewardRecord[], existing: Award[] = []) => awardsForRecords(records, items, existing, zone);
const progress = (extra: Partial<StudentProgress> = {}): StudentProgress => ({ ...computeStudentProgress([], 50, now, zone), ...extra });

describe('记录奖励', () => {
    it.each(['correct', 'wrong'])('复习 %s 获得基础与勇气奖励', result => {
        expect(award([record('1', { result })]).map(entry => [entry.type, entry.points])).toEqual(result === 'correct' ? [['review', 1], ['correction', 2], ['brave', 5]] : [['review', 1], ['brave', 2]]);
    });
    it.each(['not_attempted', '', null])('无效结果 %s 不奖励', result => expect(award([record('1', { result })])).toEqual([]));
    it.each(['manual', 'duplicate_import'])('来源 %s 不奖励', source => expect(award([record('1', { source })])).toEqual([]));
    it.each(['hard', 'harder', 'medium'])('加练 %s 按难度奖励且没有勇气与改正奖励', difficulty => {
        const records = [record('1', { source: 'manual', result: 'wrong' }), record('2', { source: 'practice', difficulty })];
        expect(award(records).map(entry => [entry.type, entry.points])).toEqual([['practice', difficulty === 'medium' ? 1 : 3]]);
        expect(award([record('3', { source: 'practice', difficulty, result: 'wrong' })])[0].points).toBe(1);
    });
    it('试卷必须有作答编号，各作答单独限制 20 道', () => {
        expect(award([record('1', { source: 'exam' })])).toEqual([]);
        const records = Array.from({ length: 22 }, (_, i) => record(String(i).padStart(3, '0'), { source: 'exam', examAttemptId: 'a' }));
        const first = award(records);
        expect(first.filter(entry => entry.type === 'exam')).toHaveLength(20);
        expect(award([record('other', { source: 'exam', examAttemptId: 'b' })], first).some(entry => entry.type === 'exam')).toBe(true);
        expect(award([record('last', { source: 'exam', examAttemptId: 'a' })], first).some(entry => entry.type === 'exam')).toBe(false);
    });
    it.each([['wrong', true], ['correct', false], [null, true]])('上一条有效结果 %s 的改正判定', (result, corrected) => {
        expect(award([record('1', { source: 'manual', result }), record('2')]).some(entry => entry.type === 'correction')).toBe(corrected);
    });
    it('第一次就做对也算改正，重复导入与空结果不遮住上次答错', () => {
        expect(award([record('1')]).some(entry => entry.type === 'correction')).toBe(true);
        expect(award([record('1', { result: 'wrong' }), record('2', { source: 'duplicate_import' }), record('3', { result: null }), record('4')]).filter(entry => entry.refKey === 'record:4').map(entry => entry.type)).toEqual(['review', 'correction', 'brave']);
    });
    it.each([3, 4, 5, null])('勇气奖励按四星临界，星级 %s', difficultyStars => {
        expect(awardsForRecords([record('1')], new Map([['item', { difficultyStars }]]), [], zone).some(entry => entry.type === 'brave')).toBe(difficultyStars !== null && difficultyStars >= 4);
    });
    it.each([['review', 40], ['practice', 5], ['brave', 3]] as const)('%s 每天按记录数封顶，已有账目占额度，跨日重置', (type, limit) => {
        const source = type === 'practice' ? 'practice' : 'review';
        const batch = Array.from({ length: 45 }, (_, i) => record(String(i).padStart(3, '0'), { source, difficulty: 'hard' }));
        const first = award(batch);
        expect(first.filter(entry => entry.type === type)).toHaveLength(limit);
        expect(award([record('new', { source })], first).filter(entry => entry.type === type)).toHaveLength(0);
        const next = award([record('new', { source, createdAt: new Date('2026-11-11T16:00:00Z') })], first);
        expect(next.filter(entry => entry.type === type)).toHaveLength(1);
        expect(next[0].day).toBe('2026-11-12');
    });
    it('同一记录同时产生三笔，重复调用或修改结果不重新结算', () => {
        const records = [record('1', { result: 'wrong' }), record('2')];
        const first = award(records);
        expect(first.filter(entry => entry.refKey === 'record:2').map(entry => entry.type)).toEqual(['review', 'correction', 'brave']);
        expect(award(records, first)).toEqual([]);
        expect(award([record('1')], first)).toEqual([]);
        expect(rewardMeta(first[0].meta)).toMatchObject({ rulesVersion: REWARD_RULES_VERSION, errorItemId: 'item', source: 'review', result: 'wrong', difficultyStars: 4 });
    });
    it('即时记账使用题目的前序记录，试卷重写编号仍不重发', () => {
        const r = record('2', { source: 'exam', examAttemptId: 'a', examQuestionId: 'q' });
        const context = new Map([['item', { difficultyStars: 4, previousRecords: [record('1', { result: 'wrong' })] }]]);
        const first = awardsForRecords([r], context, [], zone);
        expect(first.map(entry => entry.type)).toEqual(['exam', 'correction', 'brave']);
        expect(awardsForRecords([{ ...r, id: 'new' }], context, first, zone)).toEqual([]);
    });
});

describe('派生奖励', () => {
    it('只奖励已掌握且评估完成的题、已贴上的贴纸', () => {
        const p = progress({ items: { a: { status: 'mastered', pending: false }, b: { status: 'mastered', pending: true }, c: { status: 'reviewing', pending: false } },
            stickers: [{ key: 'tag', name: '标签', tagSet: 'default', subjectId: null, subjectName: null, subjectKey: null, state: 'earned', itemIds: ['a'], total: 1, remaining: 0, earnedDay: null }] });
        const first = settleDerived(p, false, 0, [], now, zone);
        expect(first.map(entry => [entry.type, entry.points, entry.refKey])).toEqual([['mastered', 5, 'item:a'], ['sticker', 20, 'sticker:tag']]);
        expect(settleDerived(p, false, 0, first, now, zone)).toEqual([]);
        expect(settleDerived({ ...p, stickers: p.stickers.map(sticker => ({ ...sticker, state: 'improving' })) }, false, 0, first, now, zone)).toEqual([]);
    });
    it.each([[false, 1, 0], [true, 0, 0], [true, 1, 1]] as const)('队列为空 %s，今日已做 %s 时收工奖 %s 条', (empty, reviewed, count) => {
        const first = settleDerived(progress(), empty, reviewed, [], now, zone);
        expect(first).toHaveLength(count);
        expect(settleDerived(progress(), empty, reviewed, first, now, zone)).toEqual([]);
    });
    it.each([[3, 10], [7, 20], [14, 30], [30, 50], [60, 80], [100, 100]] as const)('达到 %s 天奖励 %s', (streak, points) => {
        const first = settleDerived(progress({ streak, reviewedToday: true }), false, 0, [], now, zone);
        const milestone = first.find(entry => entry.refKey.startsWith(`streak:${streak}:`));
        expect(milestone?.points).toBe(points);
        expect(JSON.parse(milestone!.meta!).streakDays).toBe(streak);
        expect(settleDerived(progress({ streak, reviewedToday: true }), false, 0, first, now, zone)).toEqual([]);
    });
    it('连续中断后重新达到可再次得奖，今天无作答时从昨天算', () => {
        const first = settleDerived(progress({ streak: 3, reviewedToday: true }), false, 0, [], now, zone);
        expect(first[0].refKey).toBe('streak:3:2026-11-09');
        const next = new Date('2026-11-16T04:00:00Z');
        expect(settleDerived(progress({ streak: 3, reviewedToday: false }), false, 0, first, next, zone)[0].refKey).toBe('streak:3:2026-11-13');
        expect(settleDerived(progress({ streak: 2 }), false, 0, [], now, zone)).toEqual([]);
    });
});
