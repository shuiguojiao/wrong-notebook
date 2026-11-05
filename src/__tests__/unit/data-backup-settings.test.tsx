import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataBackupSettings } from '@/components/settings/data-backup-settings';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { downloadFile } from '@/lib/download-file';
import { toast } from '@/lib/feedback';

vi.mock('@/lib/download-file', () => ({ downloadFile: vi.fn() }));
vi.mock('@/lib/hooks/use-running-task', () => ({ useRunningTask: () => ({ running: null, refresh: vi.fn() }) }));
vi.mock('@/lib/feedback', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() }, confirmDialog: vi.fn(async () => true) }));
vi.mock('@/lib/frontend-logger', () => ({ frontendLogger: { error: vi.fn() } }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.clearAllMocks();
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

describe('设置页导出提示', () => {
    it.each([false, true])('根据响应头提示缺图数量（全量：%s）', async (all) => {
        vi.mocked(downloadFile).mockResolvedValue(new Headers({ 'X-Missing-Images': '2' }));
        await act(async () => root.render(<LanguageProvider><DataBackupSettings isAdmin userId="u1" /></LanguageProvider>));
        const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent === (all ? '导出全部' : '导出数据'))!;
        await act(async () => button.click());
        expect(downloadFile).toHaveBeenCalledWith(all ? '/api/export?all=true' : '/api/export', expect.any(String));
        expect(toast.warning).toHaveBeenCalledWith('备份已导出，但有 2 张图片文件缺失或损坏，已跳过。');
        expect(toast.success).not.toHaveBeenCalled();
        expect(toast.error).not.toHaveBeenCalled();
    });

    it.each([null, '0'])('无缺图时保留成功提示（响应头：%s）', async (count) => {
        vi.mocked(downloadFile).mockResolvedValue(new Headers(count === null ? {} : { 'X-Missing-Images': count }));
        await act(async () => root.render(<LanguageProvider><DataBackupSettings isAdmin={false} userId="u1" /></LanguageProvider>));
        await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
        expect(toast.success).toHaveBeenCalledWith('导出成功');
        expect(toast.warning).not.toHaveBeenCalled();
    });
});
