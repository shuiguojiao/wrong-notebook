import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewActionBar } from '@/components/review/review-action-bar';

let root: Root;
let container: HTMLDivElement;
let measure: () => void;
let barHeight: number;
let position: string;
let display: string;
const observe = vi.fn();
const disconnect = vi.fn();
function Probe({ error = false }: { error?: boolean }) {
    return <div data-review-layout>
        <p>正文与最后的类似题入口</p>
        <ReviewActionBar><button>提交或确认</button>{error && <p>错误提示增加操作栏高度</p>}</ReviewActionBar>
    </div>;
}
const reservedHeight = () => container.querySelector<HTMLElement>('[data-review-layout]')!.style.getPropertyValue('--review-action-height');
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    barHeight = 90; position = 'fixed'; display = 'block';
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({ position, display }) as CSSStyleDeclaration);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height: barHeight }) as DOMRect);
    vi.stubGlobal('ResizeObserver', class {
        constructor(callback: () => void) { measure = callback; }
        observe = observe;
        disconnect = disconnect;
    });
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
});

describe('复习固定操作栏的内容留位', () => {
    it('初始留位使用含安全区的实测高度，错误信息或字体换行后同步增高', async () => {
        await act(async () => root.render(<Probe />));
        expect(reservedHeight()).toBe('90px');
        expect(observe).toHaveBeenCalledWith(container.querySelector('[aria-busy]') ?? container.querySelector('[data-review-layout]')!.lastElementChild);
        barHeight = 142;
        await act(async () => { root.render(<Probe error />); measure(); });
        expect(reservedHeight()).toBe('142px');
        expect(container.textContent).toContain('错误提示增加操作栏高度');
    });
    it('切换宽屏内联布局后清除底部留白，回到竖屏重新测量', async () => {
        await act(async () => root.render(<Probe />));
        position = 'static'; window.dispatchEvent(new Event('resize'));
        expect(reservedHeight()).toBe('0px');
        position = 'fixed'; barHeight = 112; window.dispatchEvent(new Event('resize'));
        expect(reservedHeight()).toBe('112px');
    });
    it('md 下隐藏底部提交栏后不再占高，提示回落到屏幕底部', async () => {
        await act(async () => root.render(<div className="review-session-layout"><Probe /></div>));
        display = 'none';
        window.dispatchEvent(new Event('resize'));
        expect(reservedHeight()).toBe('0px');
        expect(container.querySelector<HTMLElement>('.review-session-layout')!.style.getPropertyValue('--review-notice-bottom')).toBe('16px');
    });
    it('作答界面切到判题界面时释放旧测量，再由新确认栏提供高度', async () => {
        await act(async () => root.render(<Probe />));
        const layout = container.querySelector<HTMLElement>('[data-review-layout]')!;
        await act(async () => root.render(<div data-review-layout />));
        expect(disconnect).toHaveBeenCalledTimes(1);
        expect(layout.style.getPropertyValue('--review-action-height')).toBe('');
        barHeight = 126;
        await act(async () => root.render(<Probe />));
        expect(reservedHeight()).toBe('126px');
    });
    it('撤销浮层按当前可见操作栏避让，横屏内联与滚动后同步位置', async () => {
        let top = 680;
        vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(() => ({ height: barHeight, top }) as DOMRect);
        await act(async () => root.render(<div className="review-session-layout">
            <div data-review-question="a"><Probe /></div>
            <div className="review-undo-notice">已记录</div>
        </div>));
        const session = container.querySelector<HTMLElement>('.review-session-layout')!;
        expect(session.style.getPropertyValue('--review-notice-bottom')).toBe(`${window.innerHeight - top + 12}px`);
        position = 'static'; top = 600;
        window.dispatchEvent(new Event('scroll'));
        expect(session.style.getPropertyValue('--review-notice-bottom')).toBe(`${window.innerHeight - top + 12}px`);
        container.querySelector<HTMLElement>('[data-review-question]')!.hidden = true;
        top = 0; window.dispatchEvent(new Event('resize'));
        expect(session.style.getPropertyValue('--review-notice-bottom')).toBe(`${window.innerHeight - 600 + 12}px`);
    });

});
