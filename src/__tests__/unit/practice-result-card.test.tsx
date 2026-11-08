import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PracticeResultCard } from '@/components/practice-result-card';
import { PracticeRecordDetail } from '@/components/mastery/practice-record-detail';
import { LanguageProvider, loadEnTranslations } from '@/contexts/LanguageContext';

const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: { post: mocks.post } }));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.setItem('app-language', 'zh');
    mocks.post.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

describe('练习作答快照', () => {
    it('确认保存时提交用户答案、解题思路和判题依据，保存失败后仍可重试', async () => {
        mocks.post.mockRejectedValueOnce(new Error('网络中断')).mockResolvedValueOnce({ id: 'record-1' });
        await act(async () => root.render(
            <LanguageProvider>
                <PracticeResultCard errorItemId="item-1" suggested="wrong" difficulty="hard"
                    question={{ questionText: '题目', answerText: '标准答案', analysis: '解析' }}
                    userAnswer="我的答案" notes={'第一步\n第二步'} gradeReason="缺少一个解" />
            </LanguageProvider>,
        ));
        const save = () => [...container.querySelectorAll('button')].find(button => /保存结果|Save Result/.test(button.textContent ?? ''))!;
        await act(async () => save().click());
        expect(save().disabled).toBe(false);
        await act(async () => save().click());
        expect(mocks.post).toHaveBeenLastCalledWith('/api/practice/record', expect.objectContaining({
            errorItemId: 'item-1', result: 'wrong', userAnswer: '我的答案', notes: '第一步\n第二步', gradeReason: '缺少一个解',
        }));
        expect(mocks.post).toHaveBeenCalledTimes(2);
        expect(container.textContent).toMatch(/结果已保存|Result saved/);
    });

    it('展开历史时区分用户作答、思路、判题依据和标准答案', async () => {
        await act(async () => root.render(
            <LanguageProvider>
                <PracticeRecordDetail record={{ id: 'r1', source: 'practice', result: 'correct', questionText: '题目',
                    wrongAnswerText: '我的答案', notes: '我的推导', gradeReason: 'AI 原始判断',
                    answerText: '标准答案', createdAt: '2026-11-05T00:00:00Z', exam: null }} />
            </LanguageProvider>,
        ));
        for (const text of ['我的答案', '我的推导', 'AI 原始判断', '标准答案']) expect(container.textContent).toContain(text);
    });
});


describe('复习确认按钮的判题建议', () => {
    it.each([
        ['zh', null, ['对，不太确定', '对，有把握', '做错了'], -1],
        ['zh', 'correct', ['对，不太确定', '对，有把握', '其实做错了'], 1],
        ['zh', 'wrong', ['对，不太确定', '对，有把握', '做错了'], 2],
        ['en', null, ['Correct, not sure', 'Correct, confident', 'Got it wrong'], -1],
        ['en', 'correct', ['Correct, not sure', 'Correct, confident', 'Actually incorrect'], 1],
        ['en', 'wrong', ['Correct, not sure', 'Correct, confident', 'Got it wrong'], 2],
    ] as const)('%s 建议为 %s 时文案与主按钮匹配', async (language, suggested, labels, primaryIndex) => {
        localStorage.setItem('app-language', language);
        if (language === 'en') await loadEnTranslations();
        await act(async () => root.render(<LanguageProvider>
            <PracticeResultCard errorItemId="item-1" source="review" suggested={suggested} difficulty=""
                question={{ questionText: '', answerText: '', analysis: '' }} userAnswer="本次答案" notes="" gradeReason={null} />
        </LanguageProvider>));
        const buttons = [...container.querySelectorAll('button')];
        expect(buttons.map(button => button.textContent)).toEqual(labels);
        expect(buttons.map(button => button.classList.contains('bg-primary'))).toEqual(buttons.map((_, index) => index === primaryIndex));
        if (suggested === null) {
            // 同时约束普通、悬停与深色样式，防止指针停在原提交位置时产生推荐结果的错觉。
            for (const button of buttons) {
                expect(button.classList.contains('bg-background')).toBe(true);
                expect(button.classList.contains('hover:bg-accent')).toBe(false);
                expect(button.classList.contains('hover:bg-background')).toBe(true);
                expect(button.classList.contains('dark:bg-background')).toBe(true);
                expect(button.classList.contains('dark:hover:bg-background')).toBe(true);
            }
            mocks.post.mockResolvedValueOnce({ id: 'r1', result: 'wrong' });
            await act(async () => buttons[2].click());
            expect(mocks.post).toHaveBeenCalledWith('/api/practice/record', expect.objectContaining({ result: 'wrong', source: 'review' }));
            expect(mocks.post.mock.calls[0][1]).not.toHaveProperty('confidence');
        }
    });
});
