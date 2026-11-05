import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PracticeResultCard } from '@/components/practice-result-card';
import { PracticeRecordDetail } from '@/components/mastery/practice-record-detail';
import { LanguageProvider } from '@/contexts/LanguageContext';

const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: { post: mocks.post } }));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.setItem('language', 'zh');
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
