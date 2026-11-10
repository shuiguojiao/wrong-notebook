import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MasteryPanel } from '@/components/mastery-panel';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { TimeZoneProvider } from '@/contexts/TimeZoneContext';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: mocks.get } }));
vi.mock('@/components/mastery/practice-record-detail', () => ({ PracticeRecordDetail: () => null }));
vi.mock('@/components/practice-record-form', () => ({ PracticeRecordForm: () => null }));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div'); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
it('复习摘要中的日期链接按应用时区带上日期与记录，重复导入不跳转', async () => {
    mocks.get.mockResolvedValue({ masteryProbability: null, masteryEvaluatedAt: '2026-11-12T00:00:00Z', records: [
        { id: 'r1', createdAt: '2026-11-10T16:01:00Z', result: 'wrong', source: 'review' },
        { id: 'duplicate', createdAt: '2026-11-10T16:01:00Z', result: 'wrong', source: 'duplicate_import' },
    ] });
    await act(async () => root.render(<LanguageProvider><TimeZoneProvider initialTimeZone="Asia/Shanghai"><MasteryPanel errorItemId="q1" /></TimeZoneProvider></LanguageProvider>));
    expect(container.querySelector('a[href="/history?date=2026-11-11&record=r1"]')?.textContent).toBe('2026-11-11 00:01');
    expect(container.querySelectorAll('a[href*="/history"]')).toHaveLength(1);
    expect(container.querySelector('button a')).toBeNull();
});
