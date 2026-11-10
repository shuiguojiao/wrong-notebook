import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsDialog } from '@/components/settings-dialog';
import { LanguageProvider } from '@/contexts/LanguageContext';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'student', role: 'user' } } }) }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(async () => ({ aiProvider: 'minimax' })) } }));
vi.mock('@/contexts/TimeZoneContext', () => ({ useTimeZone: () => ({ setTimeZone: vi.fn() }) }));
vi.mock('@/components/settings/account-settings', () => ({ AccountSettings: () => <p>账户设置</p> }));
vi.mock('@/components/settings/agent-integration-settings', () => ({ AgentIntegrationSettings: () => <h3 id="agent-title">AI Agent 接入</h3> }));
vi.mock('@/components/settings/ai-consent-setting', () => ({ AiConsentSetting: () => null }));
vi.mock('@/components/settings/my-ai-usage', () => ({ MyAiUsage: () => null }));
afterEach(() => { window.location.hash = ''; vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('我的设置入口', () => {
    it.each([false, true])('文字触发和 Agent 深链均打开账户页签（深链=%s）', async deepLink => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); localStorage.setItem('app-language', 'zh');
        const scroll = vi.fn(); const original = HTMLElement.prototype.scrollIntoView;
        HTMLElement.prototype.scrollIntoView = scroll;
        if (deepLink) window.location.hash = '#agent-settings';
        const container = document.createElement('div'); document.body.appendChild(container);
        const root = createRoot(container);
        try {
            await act(async () => root.render(<LanguageProvider><SettingsDialog initialTab="account" focusAgent trigger={<button>进入接入设置</button>} /></LanguageProvider>));
            if (!deepLink) await act(async () => container.querySelector('button')!.click());
            await act(async () => { await vi.advanceTimersByTimeAsync(0); });
            await act(async () => { await vi.advanceTimersByTimeAsync(200); });
            const dialog = document.querySelector('[role="dialog"]')!;
            expect(dialog.querySelector('[role="tab"][data-state="active"]')?.textContent).toBe('账户');
            expect(dialog.textContent).toContain('AI Agent 接入');
            expect(scroll).toHaveBeenCalled();
        } finally { await act(async () => root.unmount()); container.remove(); HTMLElement.prototype.scrollIntoView = original; }
    });
});
