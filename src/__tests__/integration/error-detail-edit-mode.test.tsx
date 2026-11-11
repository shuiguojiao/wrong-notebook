import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DetailContent } from '@/components/error-detail/detail-content';
import type { ErrorItemDetail } from '@/components/error-detail/types';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { confirmDialog } from '@/lib/feedback';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(async () => []), patch: vi.fn() } }));
vi.mock('@/lib/feedback', () => ({ toast: { success: vi.fn(), error: vi.fn() }, confirmDialog: vi.fn() }));
vi.mock('@/components/error-detail/detail-menu', () => ({ DetailMenu: ({ onEdit }: { onEdit: () => void }) => <button onClick={onEdit}>编辑</button> }));
vi.mock('@/components/error-detail/review-summary', () => ({ ReviewSummary: () => null }));
vi.mock('@/components/error-detail/generated-content', () => ({ GeneratedContent: () => null }));
vi.mock('@/components/error-detail/figure-scale-editor', () => ({ FigureScaleEditor: () => null }));
vi.mock('@/components/markdown-renderer', () => ({ MarkdownRenderer: ({ content }: { content: string }) => <p>{content}</p> }));
vi.mock('@/components/notebook-selector', () => ({ NotebookSelector: () => null }));
vi.mock('@/components/tag-input', () => ({ TagInput: () => null }));
vi.mock('@/components/retag-item-button', () => ({
    RetagItemButton: ({ onSuggested }: { onSuggested: (tags: string[]) => void }) => <button onClick={() => onSuggested(['AI 建议知识点'])}>AI 推荐</button>,
}));

let container: HTMLDivElement;
let root: Root;
const saveFields = vi.fn();
const onUpdate = vi.fn();
const item: ErrorItemDetail = { id: 'e1', questionText: '原题', answerText: '原答案', analysis: '原解析', knowledgePoints: '[]', tags: [], masteryLevel: 0, originalImageUrl: '', userNotes: null, gradeSemester: '大学拓展课程', paperLevel: 'inactive-group' };

beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    saveFields.mockResolvedValue(undefined);
    vi.mocked(apiClient.patch).mockResolvedValue({});
    await act(async () => root.render(<LanguageProvider><DetailContent item={item} saveFields={saveFields} onUpdate={onUpdate} reload={async () => undefined} onDeleted={vi.fn()} svgEnabled={false} geogebraEnabled={false} /></LanguageProvider>));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

async function click(label: string) {
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === label)!.click());
}
async function fill(id: string, value: string) {
    await act(async () => {
        const element = container.querySelector<HTMLTextAreaElement | HTMLSelectElement>(`#${id}`)!;
        const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLTextAreaElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
        element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    });
}

describe('详情统一编辑完整交互', () => {
    it('仅编辑模式可调整难度，点星只改草稿，保存后提交，仍可清除星级', async () => {
        expect(container.querySelector('button[aria-label="设为 3 星"]')).toBeNull();
        await click('编辑');
        const star = () => container.querySelector<HTMLButtonElement>('button[aria-label="设为 3 星"]')!;
        await act(async () => star().click());
        expect(star().getAttribute('aria-pressed')).toBe('true');
        expect(saveFields).not.toHaveBeenCalled();
        await act(async () => star().click());
        expect(star().getAttribute('aria-pressed')).toBe('false');
        await act(async () => star().click());
        await click('保存');
        expect(saveFields).toHaveBeenCalledExactlyOnceWith({ difficultyStars: 3 });
        expect(container.querySelector('button[aria-label="设为 3 星"]')).toBeNull();
    });
    it('从编辑入口进入，同时修改多个字段，一次保存变更集', async () => {
        expect(container.querySelector('form')).toBeNull();
        await click('编辑');
        expect(container.querySelector('form[aria-label="编辑错题"]')).not.toBeNull();
        expect(container.querySelector<HTMLSelectElement>('#detail-grade-semester')!.value).toBe('大学拓展课程');
        expect(container.querySelector<HTMLSelectElement>('#detail-paper-level')!.value).toBe('inactive-group');
        await fill('edit-questionText', '新题目');
        await fill('edit-answerText', '新答案');
        await fill('detail-grade-semester', '高二下');
        await click('保存');
        expect(saveFields).toHaveBeenCalledExactlyOnceWith({ questionText: '新题目', answerText: '新答案', gradeSemester: '高二下' });
        expect(apiClient.patch).not.toHaveBeenCalled();
        expect(container.querySelector('form')).toBeNull();
    });
    it('新增错答时自动记录做错了，笔记独立提交', async () => {
        await click('编辑');
        await fill('edit-wrongAnswerText', '错误推导');
        await fill('edit-notes', '注意单位');
        await click('保存');
        expect(saveFields).toHaveBeenCalledExactlyOnceWith({ wrongAnswerText: '错误推导', mistakeStatus: 'wrong_attempt' });
        expect(apiClient.patch).toHaveBeenCalledExactlyOnceWith('/api/error-items/e1/notes', { userNotes: '注意单位' });
        expect(onUpdate).toHaveBeenCalledWith({ userNotes: '注意单位' });
    });
    it('AI 知识点建议只进入草稿，确认保存后再提交', async () => {
        await click('编辑');
        await click('AI 推荐');
        expect(saveFields).not.toHaveBeenCalled();
        await click('保存');
        expect(saveFields).toHaveBeenCalledExactlyOnceWith({ knowledgePoints: '["AI 建议知识点"]' });
    });
    it('无修改取消直接退出，未保存修改需要确认并可继续编辑', async () => {
        await click('编辑'); await click('取消');
        expect(confirmDialog).not.toHaveBeenCalled();
        await click('编辑'); await fill('edit-analysis', '待确认解析');
        vi.mocked(confirmDialog).mockResolvedValueOnce(false);
        await click('取消');
        expect(confirmDialog).toHaveBeenCalledWith('有未保存的修改，确定放弃吗？');
        expect(container.querySelector<HTMLTextAreaElement>('#edit-analysis')!.value).toBe('待确认解析');
        vi.mocked(confirmDialog).mockResolvedValueOnce(true);
        await click('取消');
        expect(container.querySelector('form')).toBeNull();
        expect(saveFields).not.toHaveBeenCalled();
        expect(apiClient.patch).not.toHaveBeenCalled();
    });
    it('笔记失败后保留草稿，重试只保存尚未成功的笔记', async () => {
        vi.mocked(apiClient.patch).mockRejectedValueOnce(new Error('离线'));
        await click('编辑'); await fill('edit-analysis', '新解析'); await fill('edit-notes', '新笔记'); await click('保存');
        expect(container.querySelector('[role="alert"]')!.textContent).toContain('部分字段已保存');
        await click('保存');
        expect(saveFields).toHaveBeenCalledTimes(1);
        expect(apiClient.patch).toHaveBeenCalledTimes(2);
        expect(container.querySelector('form')).toBeNull();
    });
    it('接口失败保留所有草稿，重试完整提交', async () => {
        saveFields.mockRejectedValueOnce(new Error('离线'));
        await click('编辑'); await fill('edit-questionText', '新题'); await click('保存');
        expect(container.querySelector<HTMLTextAreaElement>('#edit-questionText')!.value).toBe('新题');
        await click('保存');
        expect(saveFields).toHaveBeenNthCalledWith(2, { questionText: '新题' });
    });
});
