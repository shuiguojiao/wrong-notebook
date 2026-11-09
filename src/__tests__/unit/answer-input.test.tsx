import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnswerInput } from '@/components/handwriting/answer-input';
import { LanguageProvider } from '@/contexts/LanguageContext';
import type { InkHistory } from '@/lib/handwriting/strokes';

vi.mock('@/components/handwriting/handwriting-canvas', () => ({ HandwritingCanvas: ({ compact }: { compact: boolean }) => <div data-canvas data-compact={compact} /> }));
let root: Root;
let container: HTMLDivElement;
const history: InkHistory = { strokes: [], past: [], future: [] };
const props = { id: 'answer', value: '', onChange: vi.fn(), history, onInkChange: vi.fn(), readOnly: false };
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(value = '', variant: 'default' | 'card' = 'card', validationError?: string) {
    await act(async () => root.render(<LanguageProvider><AnswerInput {...props} value={value} variant={variant} validationError={validationError} /></LanguageProvider>));
}

describe('卡片作答输入', () => {
    it('初始三行，内容增加时长高，到约十二行封顶，清空可缩回', async () => {
        let scrollHeight = 20;
        vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(() => scrollHeight);
        await render();
        const field = container.querySelector('textarea')!;
        expect(field.rows).toBe(3); expect(field.style.height).toBe('90px');
        scrollHeight = 186; await render('多行答案'); expect(field.style.height).toBe('186px');
        scrollHeight = 900; await render('很长的答案'); expect(field.style.height).toBe('306px');
        scrollHeight = 20; await render(); expect(field.style.height).toBe('90px');
    });
    it('切换输入模式保留文字，用圆点标识内容，笔迹用紧凑工具栏', async () => {
        await render('保留的答案');
        const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        expect(tabs[0].textContent).toBe('打字');
        expect(tabs[0].querySelector('.rounded-full')).toBeTruthy();
        expect(tabs[1].querySelector('.rounded-full')).toBeNull();
        await act(async () => tabs[1].click());
        expect(tabs[1].getAttribute('aria-selected')).toBe('true');
        expect(container.querySelector('[data-canvas]')?.getAttribute('data-compact')).toBe('true');
        await act(async () => tabs[0].click());
        expect(container.querySelector('textarea')?.value).toBe('保留的答案');
    });
    it('空答案提示关联到输入框，练习页默认输入样式保持四行', async () => {
        await render('', 'card', '先写下答案');
        const field = container.querySelector('textarea')!;
        expect(field.getAttribute('aria-invalid')).toBe('true');
        expect(field.getAttribute('aria-describedby')).toBe(container.querySelector('[role="alert"]')?.id);
        await render('', 'default');
        expect(field.rows).toBe(4); expect(field.style.height).toBe(''); expect(container.querySelector('[role="tablist"]')).toBeNull();
        expect(container.querySelector('[role="group"]')?.textContent).toContain('键盘');
        expect(container.querySelector('[data-canvas]')?.getAttribute('data-compact')).toBe('false');
    });
    it('文字与笔迹并存时两侧均显示圆点，切换不会调用清空回调', async () => {
        const withInk: InkHistory = { ...history, strokes: [{ points: [[1, 2, 0.5]], size: 4, color: '#111827', pen: true }] };
        await act(async () => root.render(<LanguageProvider><AnswerInput {...props} value="文字" variant="card" history={withInk} /></LanguageProvider>));
        expect(container.querySelectorAll('[role="tab"] .rounded-full')).toHaveLength(2);
        await act(async () => container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click());
        expect(props.onChange).not.toHaveBeenCalled(); expect(props.onInkChange).not.toHaveBeenCalled();
    });

});
