import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '@/lib/config';
const state = vi.hoisted(() => ({ config: {} as AppConfig, active: { id: 'active', name: 'active', apiKey: 'test-only', model: 'recognition' }, options: undefined as unknown }));
vi.mock('@/lib/config', () => ({ getAppConfig: () => state.config, getActiveOpenAIConfig: () => state.active }));
vi.mock('@/lib/ai/openai-provider', () => ({ DEFAULT_OPENAI_MODEL: 'default-openai', OpenAIProvider: class { constructor(options: unknown) { state.options = options; } } }));
vi.mock('@/lib/ai/azure-provider', () => ({ AzureOpenAIProvider: class { constructor(options: unknown) { state.options = options; } } }));
vi.mock('@/lib/ai/anthropic-provider', () => ({ DEFAULT_ANTHROPIC_MODEL: 'default-anthropic', AnthropicProvider: class { constructor(options: unknown) { state.options = options; } } }));
vi.mock('@/lib/ai/gemini-provider', () => ({ GeminiProvider: class { constructor(options: unknown) { state.options = options; } } }));
vi.mock('@/lib/ai/minimax-code-provider', () => ({ MiniMaxCodeProvider: class { constructor(options: unknown) { state.options = options; } } }));
import { getAIService, getIntegrityAIService } from '@/lib/ai';
beforeEach(() => {
    state.config = { aiProvider: 'openai', integrityCheckModel: '  vision  ',
        gemini: { apiKey: 'test-only', model: 'recognition' }, anthropic: { apiKey: 'test-only', model: 'recognition' },
        azure: { apiKey: 'test-only', endpoint: 'https://test.example', deploymentName: 'recognition', model: 'recognition' }, minimaxCode: { model: 'recognition' },
        qwen: { apiKey: 'test-only', model: 'recognition' },
    };
    state.active.model = 'recognition';
});
describe('单独核对模型', () => {
    it.each(['openai', 'gemini', 'anthropic', 'azure', 'minimax-code', 'qwen'] as const)('%s 覆盖模型且不修改识别配置', provider => {
        state.config.aiProvider = provider;
        const original = JSON.stringify(state.config);
        expect(getIntegrityAIService().model).toBe('vision');
        expect(state.options).toMatchObject({ model: 'vision' });
        if (provider === 'azure') expect(state.options).toMatchObject({ deploymentName: 'vision', endpoint: 'https://test.example' });
        expect(JSON.stringify(state.config)).toBe(original);
        getAIService();
        expect(state.options).toMatchObject({ model: 'recognition' });
        expect(state.active.model).toBe('recognition');
    });
    it('空核对模型沿用当前识别模型', () => {
        state.config.integrityCheckModel = ' ';
        expect(getIntegrityAIService().model).toBe('recognition');
    });
});
