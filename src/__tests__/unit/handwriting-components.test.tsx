import { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnswerSubmitButton } from '@/components/handwriting/answer-submit-button';
import { useInkGuard } from '@/lib/hooks/use-ink-guard';
import { AnswerInput } from '@/components/handwriting/answer-input';
import { PracticeRecordDetail } from '@/components/mastery/practice-record-detail';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { autoExtendPaper, canvasPixelRatio, emptyHistory } from '@/lib/handwriting/strokes';
import type { InkHistory } from '@/lib/handwriting/strokes';
import { ANSWER_IMAGE } from '../fixtures/handwriting';

let root: Root;
let container: HTMLDivElement;
let history: InkHistory;
const submit = vi.fn();
const context = { setTransform: vi.fn(), drawImage: vi.fn(), scale: vi.fn(), translate: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn() };
function Probe({ readOnly = false, variant = 'default' }: { readOnly?: boolean; variant?: 'default' | 'review' }) {
    const guard = useInkGuard();
    const [ink, setInk] = useState(emptyHistory);
    const [photos, setPhotos] = useState<string[]>([]);
    const [text, setText] = useState('保留的文字');
    useEffect(() => { history = ink; }, [ink]);
    return <AnswerInput question={{ text: '求 $1+1$', figureSvg: '<svg xmlns="http://www.w3.org/2000/svg" />' }} onPenActivity={guard.onPenActivity} topAction={<AnswerSubmitButton guard={guard} disabled={false} onSubmit={submit} label="测试提交" />} photos={photos} onPhotosChange={setPhotos} variant={variant} id="answer" value={text} onChange={setText} history={ink} onInkChange={setInk} readOnly={readOnly} />;
}
async function render(readOnly = false) {
    await act(async () => root.render(<LanguageProvider><Probe readOnly={readOnly} /></LanguageProvider>));
}
function button(text: string) {
    const result = [...container.querySelectorAll('button')].find(node => node.textContent?.startsWith(text));
    expect(result).toBeTruthy(); return result!;
}
async function click(text: string) { await act(async () => button(text).click()); }
function canvas() { return container.querySelector('canvas')!; }
async function pointer(type: string, pointerType: string, id = 1, x = 100, pressure = 0.5, y = 100) {
    await act(async () => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.assign(event, { pointerId: id, pointerType, button: 0, clientX: x, clientY: y, pressure });
        canvas().dispatchEvent(event);
    });
}
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.setItem('language', 'zh');
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = true; }) });
    Object.defineProperty(HTMLDialogElement.prototype, 'show', { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = true; }) });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = false; }) });
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, toJSON: () => ({}) });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    Object.defineProperties(HTMLCanvasElement.prototype, {
        setPointerCapture: { configurable: true, value: vi.fn() },
        hasPointerCapture: { configurable: true, value: () => false },
        releasePointerCapture: { configurable: true, value: vi.fn() },
    });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('作答画布', () => {
    it.each(['default', 'review'] as const)('%s 场景默认纸张隔离，复习工具位于纸张上方并保留更多工具', async variant => {
        await act(async () => root.render(<LanguageProvider><Probe variant={variant} /></LanguageProvider>));
        await click('手写');
        expect(container.querySelector<HTMLSelectElement>('[aria-label="纸张背景"]')?.value).toBe(variant === 'review' ? 'lines' : 'blank');
        if (variant === 'review') {
            expect(container.querySelector('h3')?.textContent).toBe('我的答案');
            const paper = container.querySelector('.review-ink-paper')!;
            const toolbar = container.querySelector('.review-ink-tools')!;
            expect(paper.closest('.ink-paper-frame')?.previousElementSibling).toBe(toolbar);
            for (const label of ['笔', '橡皮', '撤销']) {
                const control = toolbar.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
                expect(control.className).toContain('h-11');
                expect(control.className).toContain('w-11');
            }
            expect(toolbar.querySelector('details summary')?.textContent).toBe('手写工具');
        }
    });
    it('复习横线纸在手机、竖屏和平板横屏间切换保留逻辑笔迹与打字草稿', async () => {
        await act(async () => root.render(<LanguageProvider><Probe variant="review" /></LanguageProvider>));
        await click('手写');
        await pointer('pointerdown', 'pen'); await pointer('pointermove', 'pen', 1, 200); await pointer('pointerup', 'pen');
        const strokes = JSON.stringify(history.strokes);
        for (const width of [390, 834, 1180]) {
            vi.stubGlobal('innerWidth', width);
            vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width, height: 300 } as DOMRect);
            await act(async () => { window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('orientationchange')); });
            expect(JSON.stringify(history.strokes)).toBe(strokes);
            expect(container.querySelector<HTMLSelectElement>('[aria-label="纸张背景"]')?.value).toBe('lines');
        }
        await click('打字');
        expect(container.querySelector('textarea')?.value).toBe('保留的文字');
    });
    it('键盘和手写切换保留两种内容，工具有可访问名称', async () => {
        await render(); await click('手写');
        await pointer('pointerdown', 'mouse'); await pointer('pointermove', 'mouse', 1, 200); await pointer('pointerup', 'mouse');
        expect(history.strokes).toHaveLength(1);
        expect(container.querySelector('[aria-label="笔迹颜色"]')).toBeTruthy();
        await click('键盘'); expect(container.querySelector('textarea')?.value).toBe('保留的文字');
        await click('手写'); expect(history.strokes[0].points).toHaveLength(2);
        expect(button('手写').getAttribute('aria-pressed')).toBe('true');
    });
    it('Pencil 落下时丢弃手掌笔画，保存卡住的旧笔迹，启用仅限 Pencil 并忽略后续手掌', async () => {
        await render(); await click('手写');
        await pointer('pointerdown', 'touch', 1);
        await pointer('pointerdown', 'pen', 2, 200, 0.2);
        await pointer('pointermove', 'touch', 1, 900);
        await pointer('pointermove', 'pen', 2, 300, 0.9);
        // 模拟抬笔事件丢失：新的一笔落下时，上一笔 Pencil 仍要保存。
        await pointer('pointerdown', 'pen', 3, 500, 0.5);
        await pointer('pointerup', 'pen', 3);
        expect(history.strokes).toHaveLength(2);
        expect(history.strokes[0].points).toEqual([[200, 100, 0.48], [300, 100, 0.935]]);
        expect(history.strokes[1].points).toEqual([[500, 100, 0.675]]);
        expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
        expect(canvas().style.touchAction).toBe('pan-x pan-y pinch-zoom');
        await pointer('pointerdown', 'touch'); await pointer('pointerup', 'touch');
        expect(history.strokes).toHaveLength(2);
        expect(localStorage.getItem('handwriting:pen-detected')).toBe('true');
    });
    it('同一次渲染内连续两笔不会互相覆盖', async () => {
        await render(); await click('手写');
        await act(async () => {
            for (const [id, x] of [[1, 100], [2, 300]]) {
                for (const type of ['pointerdown', 'pointerup']) {
                    const event = new Event(type, { bubbles: true, cancelable: true });
                    Object.assign(event, { pointerId: id, pointerType: 'pen', button: 0, clientX: x, clientY: 100, pressure: 0.5 });
                    canvas().dispatchEvent(event);
                }
            }
        });
        expect(history.strokes).toHaveLength(2);
    });
    it('指针捕获失败时仍记录笔迹', async () => {
        Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', { configurable: true, value: () => { throw new DOMException('No active pointer', 'NotFoundError'); } });
        await render(); await click('手写');
        await pointer('pointerdown', 'pen'); await pointer('pointermove', 'pen', 1, 200); await pointer('pointerup', 'pen');
        expect(history.strokes).toHaveLength(1);
    });
    it('检测过笔后新画布默认防误触，手动关闭后可用手指写字', async () => {
        localStorage.setItem('handwriting:pen-detected', 'true');
        await render(); await click('手写');
        const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
        expect(checkbox.checked).toBe(true);
        await act(async () => checkbox.click());
        expect(canvas().style.touchAction).toBe('none');
        await pointer('pointerdown', 'touch'); await pointer('pointerup', 'touch');
        expect(history.strokes).toHaveLength(1);
    });
    it('撤销、重做、清空和按笔画橡皮可恢复', async () => {
        await render(); await click('手写');
        await pointer('pointerdown', 'mouse'); await pointer('pointerup', 'mouse');
        await click('撤销'); expect(history.strokes).toHaveLength(0);
        await click('重做'); expect(history.strokes).toHaveLength(1);
        await click('清空'); expect(history.strokes).toHaveLength(0);
        await click('撤销'); expect(history.strokes).toHaveLength(1);
        await click('橡皮'); await pointer('pointerdown', 'mouse'); await pointer('pointerup', 'mouse');
        expect(history.strokes).toHaveLength(0);
        await click('撤销'); expect(history.strokes).toHaveLength(1);
    });
    it('pointercancel 和失去捕获保存已采集笔画且只保存一次', async () => {
        await render(); await click('手写');
        for (const [index, event] of ['pointercancel', 'lostpointercapture'].entries()) {
            await pointer('pointerdown', 'pen'); await pointer(event, 'pen'); await pointer('pointerup', 'pen');
            expect(history.strokes).toHaveLength(index + 1);
        }
    });
    it.each(['touchstart', 'touchmove'])('%s 仅拦截 stylus，不影响手指滚动', async type => {
        await render(); await click('手写');
        for (const touchType of ['direct', 'stylus']) {
            const event = new Event(type, { bubbles: true, cancelable: true });
            Object.assign(event, { changedTouches: [{ touchType }] });
            canvas().dispatchEvent(event);
            expect(event.defaultPrevented).toBe(touchType === 'stylus');
        }
        await render(true);
        const event = new Event(type, { cancelable: true });
        Object.assign(event, { changedTouches: [{ touchType: 'stylus' }] });
        canvas().dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
    });
    it('丢失抬笔后下一笔保存旧笔并继续书写', async () => {
        await render(); await click('手写');
        await pointer('pointerdown', 'pen', 1);
        await pointer('pointermove', 'pen', 1, 200);
        await pointer('pointerdown', 'pen', 2, 300);
        await pointer('pointerup', 'pen', 1);
        await pointer('pointermove', 'pen', 2, 400);
        await pointer('pointerup', 'pen', 2);
        expect(history.strokes.map(stroke => stroke.points.map(point => point[0]))).toEqual([[100, 200], [300, 400]]);
    });
    it.each(['pointerup', 'pointercancel'])('window %s 只结束相同 pointerId，后续落笔可继续', async type => {
        await render(); await click('手写');
        await pointer('pointerdown', 'pen', 1);
        for (const id of [2, 1]) {
            const event = new Event(type);
            Object.assign(event, { pointerId: id });
            await act(async () => window.dispatchEvent(event));
            expect(history.strokes).toHaveLength(id === 2 ? 0 : 1);
        }
        await pointer('pointerdown', 'pen', 3); await pointer('pointerup', 'pen', 3);
        expect(history.strokes).toHaveLength(2);
    });
    it('切入后台保存当前笔画，返回后继续书写', async () => {
        await render(); await click('手写');
        await pointer('pointerdown', 'pen');
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        await act(async () => document.dispatchEvent(new Event('visibilitychange')));
        expect(history.strokes).toHaveLength(1);
        await pointer('pointerdown', 'pen', 2); await pointer('pointerup', 'pen', 2);
        expect(history.strokes).toHaveLength(2);
    });
    it('提交后只读，仍可切换查看两种内容', async () => {
        await render(); await click('手写');
        await pointer('pointerdown', 'mouse'); await pointer('pointerup', 'mouse');
        await render(true);
        await pointer('pointerdown', 'mouse'); await pointer('pointerup', 'mouse');
        expect(history.strokes).toHaveLength(1);
        expect(container.querySelector('fieldset')?.disabled).toBe(true);
        expect(canvas().getAttribute('aria-disabled')).toBe('true');
        await click('键盘'); expect(container.querySelector('textarea')?.disabled).toBe(true);
    });
    it('高 DPI 重绘及方向变化不改变向量', async () => {
        vi.stubGlobal('devicePixelRatio', 2);
        await render(); await click('手写');
        await pointer('pointerdown', 'pen'); await pointer('pointerup', 'pen');
        const before = JSON.stringify(history.strokes);
        await act(async () => { window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('orientationchange')); });
        expect(canvas().width).toBe(2000); expect(canvas().height).toBe(1600);
        expect(JSON.stringify(history.strokes)).toBe(before);
    });

    it('按钮续纸到上限后跳到拍照，撤销和转屏不缩回纸张', async () => {
        await render(); await click('手写');
        await pointer('pointerdown', 'pen'); await pointer('pointerup', 'pen');
        await click('再来一页');
        const height = history.paperHeight!;
        await click('撤销');
        expect(history.paperHeight).toBe(height);
        await act(async () => window.dispatchEvent(new Event('resize')));
        expect(history.paperHeight).toBe(height);
        for (let i = 0; i < 4 && history.paperHeight! < 3000; i++) await click('再来一页');
        expect(history.paperHeight).toBe(3000);
        await click('纸写满了');
        expect(button('拍照').getAttribute('aria-pressed')).toBe('true');
        expect(container.querySelector('[role="dialog"]')).toBeNull();
    });

    it('初始纸高来自可视区域，横竖屏只改变投影而不改纸高和点', async () => {
        let width = 1000, height = 800;
        vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ left: 0, top: 0, width, height }) as DOMRect);
        await render(); await click('手写');
        await act(async () => window.dispatchEvent(new Event('resize')));
        expect(history.paperHeight).toBe(800);
        await pointer('pointerdown', 'pen'); await pointer('pointerup', 'pen');
        const points = JSON.stringify(history.strokes);
        width = 390; height = 700;
        await act(async () => window.dispatchEvent(new Event('resize')));
        expect(history.paperHeight).toBe(800);
        expect(canvas().style.height).toBe('312px');
        expect(JSON.stringify(history.strokes)).toBe(points);
        await click('再来一页'); expect(history.paperHeight).toBe(1550);
        await click('撤销'); await click('重做');
        expect(history.paperHeight).toBe(1550);
    });
    it('手指书写模式的 24px 轨道支持触摸拖动和键盘滚动', async () => {
        await render(); await click('手写');
        const scrollbar = container.querySelector<HTMLDivElement>('[role="scrollbar"]')!;
        const viewport = document.getElementById(scrollbar.getAttribute('aria-controls')!)!;
        const scrollTo = vi.fn(({ top }: ScrollToOptions) => { viewport.scrollTop = top!; viewport.dispatchEvent(new Event('scroll')); });
        Object.defineProperties(viewport, { scrollHeight: { configurable: true, value: 1600 }, clientHeight: { configurable: true, value: 800 }, scrollTo: { configurable: true, value: scrollTo } });
        Object.defineProperties(scrollbar, { setPointerCapture: { configurable: true, value: vi.fn() }, hasPointerCapture: { configurable: true, value: () => true } });
        vi.spyOn(scrollbar, 'getBoundingClientRect').mockReturnValue({ top: 0, height: 800 } as DOMRect);
        expect(scrollbar.className).toContain('w-6');
        await act(async () => {
            const event = new Event('pointerdown', { bubbles: true, cancelable: true });
            Object.assign(event, { pointerId: 2, pointerType: 'touch', clientY: 400 });
            scrollbar.dispatchEvent(event);
        });
        expect(viewport.scrollTop).toBe(400);
        await act(async () => scrollbar.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
        expect(viewport.scrollTop).toBe(800);
        await pointer('pointerdown', 'pen'); await pointer('pointerup', 'pen');
        expect(container.querySelector('[role="scrollbar"]')).toBeNull();
    });
    it('靠近底部自动续纸，撤销后高度保留', async () => {
        await render(); await click('手写');
        await pointer('pointerdown', 'pen', 1, 100, 0.5, 700);
        await pointer('pointerup', 'pen');
        expect(history.paperHeight).toBe(1550);
        await click('撤销');
        expect(history.paperHeight).toBe(1550);
        expect(history.strokes).toHaveLength(0);
        expect(autoExtendPaper(3000, 2999)).toBe(3000);
        expect(autoExtendPaper(800, 679)).toBe(800);
    });
    it('笔划出纸面底边再抬笔不会连续续纸，下一笔照常书写', async () => {
        await render(); await click('手写');
        await pointer('pointerdown', 'pen', 1, 100, 0.5, 300);
        // 纸面底边在 800：笔划到纸外，多次移动都不能触发续纸。
        for (const y of [900, 1000, 1200, 1500]) await pointer('pointermove', 'pen', 1, 100, 0.5, y);
        await pointer('pointerup', 'pen', 1, 100, 0.5, 1500);
        expect(history.paperHeight ?? 800).toBe(800);
        expect(history.strokes).toHaveLength(1);
        await pointer('pointerdown', 'pen', 2, 200, 0.5, 200);
        await pointer('pointermove', 'pen', 2, 300, 0.5, 220);
        await pointer('pointerup', 'pen', 2);
        expect(history.strokes).toHaveLength(2);
    });
    it('一笔在纸面内靠近底边最多续纸一次', async () => {
        await render(); await click('手写');
        await pointer('pointerdown', 'pen', 1, 100, 0.5, 700);
        for (const y of [720, 750, 790]) await pointer('pointermove', 'pen', 1, 100, 0.5, y);
        await pointer('pointerup', 'pen');
        expect(history.paperHeight).toBe(1550);
    });
    it('专心写使用同一画布，保留工具、纸高和笔迹，Esc 收起并恢复焦点和滚动', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1000);
        await render(); await click('手写');
        await act(async () => {
            const color = container.querySelector<HTMLSelectElement>('[aria-label="笔迹颜色"]')!;
            color.value = '#1d4ed8'; color.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await pointer('pointerdown', 'pen'); await pointer('pointerup', 'pen');
        await click('再来一页');
        const before = JSON.stringify(history);
        const originalCanvas = canvas();
        const expand = button('展开'); expand.focus();
        await click('展开');
        const dialog = container.querySelector<HTMLDialogElement>('[role="dialog"]')!;
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(document.body.style.overflow).toBe('hidden');
        expect(canvas()).toBe(originalCanvas);
        const submitButton = dialog.querySelectorAll<HTMLButtonElement>('button')[2];
        await act(async () => {
            const down = new Event('pointerdown', { bubbles: true, cancelable: true });
            Object.assign(down, { pointerType: 'touch' }); submitButton.dispatchEvent(down);
            const click = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });
            Object.assign(click, { pointerType: 'touch' }); submitButton.dispatchEvent(click);
        });
        expect(submit).not.toHaveBeenCalled();
        await act(async () => submitButton.click()); expect(submit).toHaveBeenCalledOnce();
        await click('求 $1+1$');
        expect(dialog.querySelector('.katex')).toBeTruthy();
        expect(dialog.querySelector('figure img')).toBeTruthy();
        await click('收起全文');
        await act(async () => dialog.dispatchEvent(new Event('cancel', { cancelable: true })));
        expect(container.querySelector('[role="dialog"]')).toBeNull();
        expect(canvas()).toBe(originalCanvas);
        expect(container.querySelector<HTMLSelectElement>('[aria-label="笔迹颜色"]')?.value).toBe('#1d4ed8');
        expect(JSON.stringify(history)).toBe(before);
        expect(document.body.style.overflow).toBe('');
        expect(document.activeElement).toBe(expand);
        expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    });

    it('更换题目 key 后退出专心写并清空当前题纸张', async () => {
        await act(async () => root.render(<LanguageProvider><Probe key="first" /></LanguageProvider>));
        await click('手写'); await click('再来一页'); await click('展开');
        expect(container.querySelector('[role="dialog"]')).toBeTruthy();
        await act(async () => root.render(<LanguageProvider><Probe key="second" /></LanguageProvider>));
        expect(container.querySelector('[role="dialog"]')).toBeNull();
        expect(history.strokes).toHaveLength(0);
        expect(history.paperHeight).toBeUndefined();
        expect(document.body.style.overflow).toBe('');
    });
    it('画布降低 DPR 后始终不超过约 16M 像素', () => {
        const ratio = canvasPixelRatio(1180, 3540, 3);
        expect(Math.floor(1180 * ratio) * Math.floor(3540 * ratio)).toBeLessThanOrEqual(16_000_000);
        expect(ratio).toBeLessThan(3);
    });
    it('历史详情分别显示原始手写图片、键盘文字和 AI 转写', async () => {
        await act(async () => root.render(<LanguageProvider><PracticeRecordDetail record={{ id: 'r', result: 'correct', source: 'review', wrongAnswerText: '键盘补充', answerImageUrl: ANSWER_IMAGE, recognizedAnswer: 'x = 2', createdAt: '2026-11-08', exam: null }} /></LanguageProvider>));
        expect(container.querySelector('img')?.src).toBe(ANSWER_IMAGE);
        expect(container.textContent).toContain('键盘补充');
        expect(container.textContent).toContain('x = 2');
        expect(container.textContent).toContain('手写识别结果');
        await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
        expect(document.querySelector('[role="dialog"] img')?.getAttribute('src')).toBe(ANSWER_IMAGE);
    });
});
