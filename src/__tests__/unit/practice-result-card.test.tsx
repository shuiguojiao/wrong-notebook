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
        ['zh', null, ['没做对', '还不太熟', '会了'], -1],
        ['zh', 'correct', ['还不太熟', '会了，下一题'], 1],
        ['zh', 'wrong', ['明天再见', '我觉得我是对的'], 0],
        ['en', null, ['Got it wrong', 'Not quite sure yet', 'Got it'], -1],
        ['en', 'correct', ['Not quite sure yet', 'Got it, next question'], 1],
        ['en', 'wrong', ['See you tomorrow', 'I think I got it right'], 0],
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
            await act(async () => buttons[0].click());
            expect(mocks.post).toHaveBeenCalledWith('/api/practice/record', expect.objectContaining({ result: 'wrong', source: 'review' }));
            expect(mocks.post.mock.calls[0][1]).not.toHaveProperty('confidence');
        }
    });
});

async function renderReview(suggested: 'correct' | 'wrong' | null, disabled = false) {
    await act(async () => root.render(<LanguageProvider>
        <PracticeResultCard errorItemId="item-1" source="review" suggested={suggested} difficulty="" disabled={disabled}
            question={{ questionText: '', answerText: '', analysis: '' }} userAnswer="本次答案" notes="" gradeReason="原始判题依据" />
    </LanguageProvider>));
}

const mappingCases = [
    ['correct', false, 0, 'correct', 'unsure'],
    ['correct', false, 1, 'correct', 'sure'],
    ['wrong', false, 0, 'wrong', undefined],
    ['wrong', true, 0, 'correct', 'unsure'],
    ['wrong', true, 1, 'correct', 'sure'],
    [null, false, 0, 'wrong', undefined],
    [null, false, 1, 'correct', 'unsure'],
    [null, false, 2, 'correct', 'sure'],
] as const;

describe.each(['click', 'keyboard'] as const)('自评保存映射 %s', method => {
    it.each(mappingCases)('建议 %s、纠正 %s、按钮 %s 保存 %s + %s', async (suggested, dispute, index, result, confidence) => {
        mocks.post.mockResolvedValue({ id: 'r1', result });
        await renderReview(suggested);
        if (dispute) {
            await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === '我觉得我是对的')!.click());
            expect(mocks.post).not.toHaveBeenCalled();
            expect([...container.querySelectorAll('button')].map(button => button.textContent)).toEqual(['还不太熟', '会了，下一题']);
        }
        expect(container.textContent).toContain('这道题你现在觉得？');
        await act(async () => {
            if (method === 'click') container.querySelectorAll('button')[index].click();
            else window.dispatchEvent(new KeyboardEvent('keydown', { key: String(index + 1) }));
        });
        expect(mocks.post).toHaveBeenCalledTimes(1);
        const [url, body] = mocks.post.mock.calls[0];
        expect(url).toBe('/api/practice/record');
        expect(body).toMatchObject({ errorItemId: 'item-1', source: 'review', result, gradeReason: '原始判题依据' });
        if (confidence) expect(body.confidence).toBe(confidence);
        else expect(body).not.toHaveProperty('confidence');
    });
});

describe('自评交互边界', () => {
    it.each(['correct', 'wrong'] as const)('建议 %s 时多余数字键不保存或切换纠正', async suggested => {
        await renderReview(suggested);
        await act(async () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
            if (suggested === 'wrong') window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
        });
        expect(mocks.post).not.toHaveBeenCalled();
        expect(container.querySelectorAll('button')).toHaveLength(2);
        if (suggested === 'wrong') expect(container.textContent).toContain('我觉得我是对的');
    });

    it.each(['input', 'textarea', 'select', 'contenteditable', 'textbox'])('%s 聚焦时忽略数字快捷键', async kind => {
        await renderReview(null);
        const field = document.createElement(['input', 'textarea', 'select'].includes(kind) ? kind : 'div');
        if (kind === 'contenteditable') field.setAttribute('contenteditable', 'true');
        if (kind === 'textbox') field.setAttribute('role', 'textbox');
        field.tabIndex = 0;
        container.appendChild(field);
        field.focus();
        await act(async () => {
            for (const key of ['1', '2', '3']) field.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        });
        expect(mocks.post).not.toHaveBeenCalled();
    });

    it('禁用时不能纠正或保存', async () => {
        await renderReview('wrong', true);
        await act(async () => {
            for (const button of container.querySelectorAll('button')) button.click();
            window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
        });
        expect(mocks.post).not.toHaveBeenCalled();
        expect(container.textContent).toContain('我觉得我是对的');
    });
});
