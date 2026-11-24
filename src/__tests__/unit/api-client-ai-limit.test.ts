import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localStorageMock } from '../setup';

const fetchMock = vi.fn();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('apiClient 每日 AI 次数用完提示', () => {
    it('自动回退的调用收到额度错误时交给卡片提示', async () => {
        vi.resetModules();
        const { apiClient } = await import('@/lib/api-client');
        const { subscribeFeedback } = await import('@/lib/feedback');
        const feedback = vi.fn();
        const unsubscribe = subscribeFeedback(feedback);
        feedback.mockClear();
        fetchMock.mockResolvedValue(json(429, { code: 'AI_MONTHLY_TOKEN_LIMIT_EXCEEDED' }));
        await expect(apiClient.post('/api/practice/generate', {}, { quietAiErrors: true })).rejects.toMatchObject({ status: 429 });
        unsubscribe();
        expect(feedback).not.toHaveBeenCalled();
    });
    it('语言为 zh 时显示中文提示', async () => {
        vi.resetModules();
        const { apiClient } = await import('@/lib/api-client');
        const { subscribeFeedback } = await import('@/lib/feedback');
        localStorageMock.setItem('app-language', 'zh');
        fetchMock.mockResolvedValue(json(429, { code: 'AI_DAILY_LIMIT_EXCEEDED' }));

        const warnings: string[] = [];
        const unsubscribe = subscribeFeedback((state) => {
            warnings.push(...state.toasts.filter((t) => t.type === 'warning').map((t) => t.message));
        });

        await expect(apiClient.post('/api/x', {})).rejects.toMatchObject({ status: 429 });
        unsubscribe();
        expect(warnings).toEqual(['今天的 AI 使用次数已达上限，请明天再试，或请管理员调整额度。']);
    });

    it('语言为 en 时显示英文提示', async () => {
        vi.resetModules();
        const { apiClient } = await import('@/lib/api-client');
        const { subscribeFeedback } = await import('@/lib/feedback');
        localStorageMock.setItem('app-language', 'en');
        fetchMock.mockResolvedValue(json(429, { code: 'AI_DAILY_LIMIT_EXCEEDED' }));

        const warnings: string[] = [];
        const unsubscribe = subscribeFeedback((state) => {
            warnings.push(...state.toasts.filter((t) => t.type === 'warning').map((t) => t.message));
        });

        await expect(apiClient.post('/api/x', {})).rejects.toMatchObject({ status: 429 });
        unsubscribe();
        expect(warnings).toEqual(["You have used up today's AI allowance. Try again tomorrow or ask an administrator to raise the limit."]);
    });
});
