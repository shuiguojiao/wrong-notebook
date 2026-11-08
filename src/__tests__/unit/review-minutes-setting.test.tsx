import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewMinutesSetting } from '@/components/settings/review-minutes-setting';
import { LanguageProvider } from '@/contexts/LanguageContext';

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: mocks }));
let root: Root;
let container: HTMLDivElement;
const render = () => act(async () => root.render(<LanguageProvider><ReviewMinutesSetting /></LanguageProvider>));
const save = () => [...container.querySelectorAll('button')].find(button => button.textContent?.includes('保存'))!;
async function input(value: string) {
    await act(async () => {
        const field = container.querySelector('input')!;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
        field.dispatchEvent(new Event('input', { bubbles: true }));
    });
}
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); localStorage.setItem('app-language', 'zh');
    mocks.get.mockReset().mockResolvedValue({ reviewDailyMinutes: 30 }); mocks.patch.mockReset().mockResolvedValue({ reviewDailyMinutes: 45 });
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('通用设置中的复习分钟数', () => {
    it('读取个人设置，合法变更独立保存', async () => {
        await render(); expect(container.querySelector('input')?.value).toBe('30'); expect(save().disabled).toBe(true);
        await input('45'); expect(save().disabled).toBe(false);
        await act(async () => save().click());
        expect(mocks.patch).toHaveBeenCalledWith('/api/user', { reviewDailyMinutes: 45 });
        expect(container.querySelector('input')?.value).toBe('45'); expect(save().disabled).toBe(true);
    });
    it.each(['', '9', '11', '181', '30.5'])('非法分钟数 %s 显示错误且不能保存', async value => {
        await render(); await input(value);
        expect(container.querySelector('[role="alert"]')).toBeTruthy(); expect(save().disabled).toBe(true);
        expect(mocks.patch).not.toHaveBeenCalled();
    });
    it('加载失败禁用保存，重试成功后恢复，不覆盖服务器偏好', async () => {
        mocks.get.mockRejectedValueOnce(new Error('离线')); await render();
        expect(container.querySelector('input')?.disabled).toBe(true);
        const retry = [...container.querySelectorAll('button')].find(button => button.textContent === '重新加载')!;
        expect(retry).toBeTruthy(); await act(async () => retry.click());
        expect(container.querySelector('input')?.disabled).toBe(false); expect(mocks.patch).not.toHaveBeenCalled();
    });
    it('保存失败保留输入且允许重试', async () => {
        await render(); await input('45'); mocks.patch.mockRejectedValueOnce(new Error('失败'));
        await act(async () => save().click());
        expect(container.querySelector('input')?.value).toBe('45'); expect(save().disabled).toBe(false);
        await act(async () => save().click()); expect(mocks.patch).toHaveBeenCalledTimes(2);
    });
});
