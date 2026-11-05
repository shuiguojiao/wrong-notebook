import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReminderSettings } from '@/components/settings/reminder-settings';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
const saved = { reminderEnabled: false, reminderChannel: 'bark', reminderCredential: '••••1234', reminderTime: '09:00', reminderLastSentAt: null, reminderLastResult: null,
    available: true, hasSiteUrl: false, timeZone: 'Asia/Shanghai', allowCustomReminders: false };
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.mocked(apiClient.get).mockResolvedValue(saved); vi.mocked(apiClient.put).mockResolvedValue(saved);
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = () => act(async () => root.render(<LanguageProvider><ReminderSettings /></LanguageProvider>));
function button(text: string) { return [...container.querySelectorAll('button')].find((element) => element.textContent === text)!; }
describe('复习提醒设置表单', () => {
    it('显示打码、缺少站点提示，未修改时保存不提交凭据', async () => {
        await render();
        expect(container.textContent).toContain('••••1234'); expect(container.textContent).toContain('NEXTAUTH_URL');
        expect(container.querySelector('option[value="custom"]')).toBeNull();
        expect(container.querySelector<HTMLInputElement>('#reminder-credential')!.value).toBe('');
        await act(async () => container.querySelector<HTMLButtonElement>('#reminder-enabled')!.click());
        expect(button('发送测试消息').disabled).toBe(true);
        await act(async () => button('保存提醒设置').click());
        expect(apiClient.put).toHaveBeenCalledWith('/api/reminders', { reminderEnabled: true, reminderChannel: 'bark', reminderTime: '09:00' });
        expect(container.textContent).toContain('提醒设置已保存');
    });
    it('测试使用已保存凭据，展示服务接受边界', async () => {
        vi.mocked(apiClient.post).mockResolvedValue({ ...saved, reminderLastResult: 'accepted' });
        await render(); await act(async () => button('发送测试消息').click());
        expect(apiClient.post).toHaveBeenCalledWith('/api/reminders/test', {});
        expect(container.textContent).toContain('不代表设备已收到');
    });
    it('全局禁用时不可测试或开启；读取失败可见', async () => {
        vi.mocked(apiClient.get).mockResolvedValueOnce({ ...saved, available: false });
        await render(); expect(button('发送测试消息').disabled).toBe(true);
        expect(container.querySelector<HTMLButtonElement>('#reminder-enabled')!.disabled).toBe(true);
        expect(container.textContent).toContain('管理员已全局关闭');
    });
    it('加载失败显示可操作的刷新提示', async () => {
        vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('network'));
        await render(); expect(container.textContent).toContain('请刷新重试');
    });
});
