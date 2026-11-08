import { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnswerInput } from '@/components/handwriting/answer-input';
import { PracticeRecordDetail } from '@/components/mastery/practice-record-detail';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { emptyHistory } from '@/lib/handwriting/strokes';
import type { InkHistory } from '@/lib/handwriting/strokes';
import { ANSWER_IMAGE } from '../fixtures/handwriting';

let root: Root;
let container: HTMLDivElement;
let history: InkHistory;
const context = { scale: vi.fn(), translate: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn() };
function Probe({ readOnly = false }: { readOnly?: boolean }) {
    const [ink, setInk] = useState(emptyHistory);
    const [text, setText] = useState('保留的文字');
    useEffect(() => { history = ink; }, [ink]);
    return <AnswerInput id="answer" value={text} onChange={setText} history={ink} onInkChange={setInk} readOnly={readOnly} />;
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
async function pointer(type: string, pointerType: string, id = 1, x = 100, pressure = 0.5) {
    await act(async () => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.assign(event, { pointerId: id, pointerType, button: 0, clientX: x, clientY: 100, pressure });
        canvas().dispatchEvent(event);
    });
}
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.setItem('language', 'zh');
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
    it('键盘和手写切换保留两种内容，工具有可访问名称', async () => {
        await render(); await click('手写');
        await pointer('pointerdown', 'mouse'); await pointer('pointermove', 'mouse', 1, 200); await pointer('pointerup', 'mouse');
        expect(history.strokes).toHaveLength(1);
        expect(container.querySelector('[aria-label="笔迹颜色"]')).toBeTruthy();
        await click('键盘'); expect(container.querySelector('textarea')?.value).toBe('保留的文字');
        await click('手写'); expect(history.strokes[0].points).toHaveLength(2);
        expect(button('手写').getAttribute('aria-pressed')).toBe('true');
    });
    it('Pencil 接管未完成的 touch，启用仅限 Pencil 并忽略后续手掌', async () => {
        await render(); await click('手写');
        await pointer('pointerdown', 'touch', 1);
        await pointer('pointerdown', 'pen', 2, 200, 0.2);
        await pointer('pointermove', 'touch', 1, 900);
        await pointer('pointermove', 'pen', 2, 300, 0.9);
        await pointer('pointerup', 'pen', 2);
        expect(history.strokes).toHaveLength(1);
        expect(history.strokes[0].points).toEqual([[200, 100, 0.2], [300, 100, 0.9]]);
        expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
        expect(canvas().style.touchAction).toBe('pan-x pan-y pinch-zoom');
        await pointer('pointerdown', 'touch'); await pointer('pointerup', 'touch');
        expect(history.strokes).toHaveLength(1);
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
    it('pointercancel 和失去捕获不留下未完成笔画', async () => {
        await render(); await click('手写');
        for (const event of ['pointercancel', 'lostpointercapture']) {
            await pointer('pointerdown', 'pen'); await pointer(event, 'pen'); await pointer('pointerup', 'pen');
            expect(history.strokes).toHaveLength(0);
        }
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
    it('历史详情分别显示原始手写图片、键盘文字和 AI 转写', async () => {
        await act(async () => root.render(<LanguageProvider><PracticeRecordDetail record={{ id: 'r', result: 'correct', source: 'review', wrongAnswerText: '键盘补充', answerImageUrl: ANSWER_IMAGE, recognizedAnswer: 'x = 2', createdAt: '2026-11-08', exam: null }} /></LanguageProvider>));
        expect(container.querySelector('img')?.src).toBe(ANSWER_IMAGE);
        expect(container.textContent).toContain('键盘补充');
        expect(container.textContent).toContain('x = 2');
        expect(container.textContent).toContain('手写识别结果');
    });
});
