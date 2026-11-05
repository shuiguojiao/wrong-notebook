import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zh } from '@/lib/i18n/zh';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), success: vi.fn() }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: zh, language: 'zh' }) }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: mocks.get, post: mocks.post } }));
vi.mock('@/lib/feedback', () => ({ toast: { success: mocks.success } }));
import { ProblemReportDialog } from '@/components/error-detail/problem-report-dialog';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    mocks.get.mockResolvedValue([]);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function openDialog() {
    await act(async () => root.render(<ProblemReportDialog errorItemId="item" />));
    await act(async () => container.querySelector('button')!.click());
}
function description() { return document.getElementById('report-description') as HTMLTextAreaElement; }
async function setDescription(value: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(description(), value);
        description().dispatchEvent(new Event('input', { bubbles: true }));
    });
}
async function fill() {
    await act(async () => {
        const select = document.getElementById('report-category') as HTMLSelectElement;
        select.value = 'formula'; select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await setDescription('  分母识别错了  ');
}
async function submit() { await act(async () => document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); }

describe('问题报告弹窗', () => {
    it('展示隐私提示，拒绝未选类别、空白和超长说明', async () => {
        await openDialog(); expect(document.body.textContent).toContain(zh.problemReports.privacy);
        await submit(); expect(document.querySelector('[role="alert"]')?.textContent).toBe(zh.problemReports.invalid);
        expect(mocks.post).not.toHaveBeenCalled();
        await fill(); await setDescription('   '); await submit(); expect(mocks.post).not.toHaveBeenCalled();
        await setDescription('a'.repeat(2001)); await submit(); expect(mocks.post).not.toHaveBeenCalled();
        expect(description().maxLength).toBe(2000);
    });
    it('校验后提交，展示已收到及新记录，清空输入', async () => {
        await openDialog(); await fill();
        mocks.post.mockResolvedValue({ id: 'r', category: 'formula', description: '分母识别错了', status: 'open', adminNote: '', createdAt: new Date().toISOString() });
        await submit();
        expect(mocks.post).toHaveBeenCalledWith('/api/problem-reports', { errorItemId: 'item', category: 'formula', description: '分母识别错了' });
        expect(document.body.textContent).toContain('分母识别错了'); expect(mocks.success).toHaveBeenCalledWith('已收到'); expect(description().value).toBe('');
    });
    it('额度错误保留输入并允许重试', async () => {
        await openDialog(); await fill(); mocks.post.mockRejectedValue({ data: { message: 'Daily report limit reached' } });
        await submit(); expect(document.body.textContent).toContain(zh.problemReports.limitReached); expect(description().value).toContain('分母识别错了');
    });
    it('打开入口读取本人报告，显示最终状态与管理员备注', async () => {
        mocks.get.mockResolvedValue([{ id: 'old', category: 'answer', description: '答案不对', status: 'wontfix', adminNote: '请核对教材版本', createdAt: new Date().toISOString() }]);
        await openDialog(); expect(document.body.textContent).toContain('不予修复'); expect(document.body.textContent).toContain('请核对教材版本');
        expect(mocks.get).toHaveBeenCalledWith('/api/problem-reports', { params: { errorItemId: 'item' } });
    });
    it('请求未完成时只提交一次，失败时显示可重试消息', async () => {
        await openDialog(); await fill();
        let reject: (reason: unknown) => void = () => undefined;
        mocks.post.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
        await submit(); await submit(); expect(mocks.post).toHaveBeenCalledTimes(1);
        await act(async () => reject(new Error('offline')));
        expect(document.body.textContent).toContain(zh.problemReports.submitFailed);
    });
});
