/**
 * 举一反三练习：读取上次生成的题目、生成新题、本地比对或 AI 判题、直接看答案
 */
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { backgroundTaskStore } from '@/lib/background-task-store';
import { ApiError } from '@/lib/api-client';
import { translations } from '@/lib/translations';
import { usePracticeSession } from '@/lib/hooks/use-practice-session';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
    apiClient: { get: mocks.get, post: mocks.post },
    ApiError: class ApiError extends Error {
        status: number;
        statusText: string;
        data: unknown;
        constructor(status: number, statusText: string, data: unknown) {
            super('ApiError');
            this.status = status;
            this.statusText = statusText;
            this.data = data;
        }
    },
}));
vi.mock('@/lib/frontend-logger', () => ({ frontendLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

type Session = ReturnType<typeof usePracticeSession>;

const generated = { practiceVersion: 'a'.repeat(64), questionText: '3 + 4 = ?', answerText: '7', analysis: '加法', subject: '数学', knowledgePoints: [], generatedAt: '2026-10-31T00:00:00Z' };
const lastPractice = { practiceVersion: 'b'.repeat(64), questionText: '上次的题', answerText: '5', analysis: '上次解析', subject: '数学', difficulty: 'hard', generatedAt: '2026-10-30T00:00:00Z' };

let root: Root;
let container: HTMLDivElement;
let session: Session;

function Probe({ id }: { id: string | null }) {
    const value = usePracticeSession(id);
    useEffect(() => { session = value; });
    return null;
}

async function render(id: string | null = 'item-1') {
    await act(async () => {
        root.render(<LanguageProvider><Probe id={id} /></LanguageProvider>);
    });
}

/** 按地址返回设置和上次练习 */
function mockGet(practice: unknown = null) {
    mocks.get.mockImplementation(async (url: string) => (
        url === '/api/settings' ? { timeouts: { analyze: 60000 } }
            : url === '/api/tasks' ? { tasks: [] }
            : { practice }
    ));
}

beforeEach(() => {
    vi.clearAllMocks();
    mockGet();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

describe('usePracticeSession', () => {
    it('进入页面时显示上次生成的题目和难度', async () => {
        mockGet(lastPractice);
        await render();

        expect(mocks.get).toHaveBeenCalledWith('/api/practice/generate?errorItemId=item-1');
        expect(session.question?.questionText).toBe('上次的题');
        expect(session.difficulty).toBe('hard');
        expect(session.generatedDifficulty).toBe('hard');
        expect(session.generatedAt).toBe(lastPractice.generatedAt);
        expect(session.loadingCached).toBe(false);
    });

    it('没有错题 ID 时不读取上次练习', async () => {
        await render(null);
        expect(mocks.get).not.toHaveBeenCalledWith(expect.stringContaining('/api/practice/generate'));
    });

    it('按所选难度生成新题，并使用设置中的超时时间', async () => {
        mocks.post.mockResolvedValueOnce(generated);
        await render();

        await act(async () => session.setDifficulty('easy'));
        await act(async () => session.generateQuestion());

        expect(mocks.post).toHaveBeenCalledWith('/api/practice/generate',
            { errorItemId: 'item-1', language: expect.any(String), difficulty: 'easy' },
            { timeout: 60000, recoverable: true });
        expect(session.question?.questionText).toBe('3 + 4 = ?');
        expect(session.generatedDifficulty).toBe('easy');
        expect(session.questionVersion).toBe(1);
        expect(session.loading).toBe(false);
    });

    it('生成失败时按错误码显示对应提示', async () => {
        mocks.post.mockRejectedValueOnce({ data: { message: 'AI_AUTH_ERROR: invalid key' } });
        await render();

        await act(async () => session.generateQuestion());

        const zh = translations.zh.errors.aiAuth;
        const en = translations.en.errors.aiAuth;
        expect([zh, en]).toContain(session.error);
    });

    it('答案与标准答案一致时本地直接判对，不调用 AI 判题', async () => {
        mocks.post.mockResolvedValueOnce(generated);
        await render();
        await act(async () => session.generateQuestion());

        await act(async () => session.setUserAnswer(' 7 '));
        await act(async () => session.submitAnswer());

        expect(mocks.post).toHaveBeenCalledTimes(1);
        expect(session.isCorrect).toBe(true);
        expect(session.suggestedResult).toBe('correct');
        expect(session.showAnswer).toBe(true);
    });

    it.each(['证明两底角相等', '说明理由并写出过程', 'Prove the two angles are equal.', 'Show that the angles are equal.'])('需要论证的题目不会因结论相同而跳过 AI：%s', async questionText => {
        mocks.post.mockResolvedValueOnce({ ...generated, questionText, answerText: '两角相等' })
            .mockResolvedValueOnce({ correct: false, reason: '缺少论证过程' });
        await render();
        await act(async () => session.generateQuestion());
        await act(async () => session.setUserAnswer('两角相等'));
        await act(async () => session.submitAnswer());
        expect(mocks.post).toHaveBeenLastCalledWith('/api/practice/grade',
            { errorItemId: 'item-1', userAnswer: '两角相等', notes: '', practiceVersion: generated.practiceVersion, language: expect.any(String) },
            { timeout: 60000, recoverable: true });
        expect(session.isCorrect).toBe(false);
        expect(session.gradeReason).toBe('缺少论证过程');
        expect(session.suggestedResult).toBe('wrong');
    });

    it('答案不一致时交给 AI 判题并显示判定依据', async () => {
        mocks.post.mockResolvedValueOnce(generated).mockResolvedValueOnce({ correct: false, reason: '计算错误' });
        await render();
        await act(async () => session.generateQuestion());

        await act(async () => session.setUserAnswer('8'));
        await act(async () => session.submitAnswer());

        expect(mocks.post).toHaveBeenLastCalledWith('/api/practice/grade',
            { errorItemId: 'item-1', userAnswer: '8', notes: '', practiceVersion: generated.practiceVersion, language: expect.any(String) },
            { timeout: 60000, recoverable: true });
        expect(session.isCorrect).toBe(false);
        expect(session.gradeReason).toBe('计算错误');
        expect(session.suggestedResult).toBe('wrong');
    });

    it('缓存题目提交时带上自己的版本及思路', async () => {
        mockGet(lastPractice);
        mocks.post.mockResolvedValueOnce({ correct: false, reason: '思路缺少步骤' });
        await render();
        await act(async () => { session.setUserAnswer('8'); session.setNotes('我的推导'); });
        await act(async () => session.submitAnswer());
        expect(mocks.post).toHaveBeenLastCalledWith('/api/practice/grade',
            expect.objectContaining({ practiceVersion: lastPractice.practiceVersion, notes: '我的推导', userAnswer: '8' }),
            expect.any(Object));
    });

    it('其他页面的后台生成结束后，不将旧题换绑成新版本或新难度', async () => {
        mockGet(lastPractice);
        await render();
        await act(async () => { session.setUserAnswer('8'); session.setNotes('保留思路'); });
        mocks.get.mockImplementation(async (url: string) => url === '/api/tasks'
            ? { tasks: [{ id: 'task-1', status: 'running', target: 'error-item:item-1:practice' }] }
            : { practice: { ...lastPractice, questionText: '另一页面的新题', practiceVersion: 'c'.repeat(64), difficulty: 'easy', generatedAt: '2026-11-05T00:00:00Z' } });
        await act(async () => backgroundTaskStore.refresh());
        mockGet({ ...lastPractice, questionText: '另一页面的新题', practiceVersion: 'c'.repeat(64), difficulty: 'easy', generatedAt: '2026-11-05T00:00:00Z' });
        await act(async () => backgroundTaskStore.refresh());
        expect(session.question?.practiceVersion).toBe(lastPractice.practiceVersion);
        expect(session.question?.questionText).toBe(lastPractice.questionText);
        expect(session.generatedDifficulty).toBe('hard');
        expect(session.generatedAt).toBe(lastPractice.generatedAt);
        expect(session.userAnswer).toBe('8');
        expect(session.notes).toBe('保留思路');
    });

    it('版本冲突保留作答并提示，不标记为答错', async () => {
        mockGet(lastPractice);
        mocks.post.mockRejectedValueOnce(new ApiError(409, 'Conflict', { code: 'PRACTICE_CHANGED' }));
        await render();
        await act(async () => { session.setUserAnswer('8'); session.setNotes('我的思路'); });
        await act(async () => session.submitAnswer());
        expect(session.userAnswer).toBe('8');
        expect(session.notes).toBe('我的思路');
        expect(session.isCorrect).toBeNull();
        expect(session.suggestedResult).toBeNull();
        expect([translations.zh.practice.questionChanged, translations.en.practice.questionChanged]).toContain(session.error);
    });

    it('AI 判题失败时不给出建议结果，由用户自己选择', async () => {
        mocks.post.mockResolvedValueOnce(generated).mockRejectedValueOnce(new Error('timeout'));
        await render();
        await act(async () => session.generateQuestion());

        await act(async () => session.setUserAnswer('8'));
        await act(async () => session.submitAnswer());

        expect(session.gradeFailed).toBe(true);
        expect(session.suggestedResult).toBeNull();
        expect(session.showAnswer).toBe(true);
    });

    it('不作答直接看答案，重新生成后清空作答状态', async () => {
        mocks.post.mockResolvedValue(generated);
        await render();
        await act(async () => session.generateQuestion());

        await act(async () => session.revealAnswer());
        expect(session.isSubmitted).toBe(true);
        expect(session.showAnswer).toBe(true);
        expect(session.suggestedResult).toBeNull();

        await act(async () => session.generateQuestion());
        expect(session.isSubmitted).toBe(false);
        expect(session.showAnswer).toBe(false);
        expect(session.questionVersion).toBe(2);
    });
});
