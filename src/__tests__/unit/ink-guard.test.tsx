import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AnswerSubmitButton } from '@/components/handwriting/answer-submit-button';
import { useInkGuard } from '@/lib/hooks/use-ink-guard';

let root: Root;
let container: HTMLDivElement;
let guard: ReturnType<typeof useInkGuard>;
const submit = vi.fn();
function Probe() {
    const value = useInkGuard();
    useEffect(() => { guard = value; });
    return <AnswerSubmitButton guard={value} onSubmit={submit} disabled={false} label="提交" />;
}
beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers(); submit.mockClear();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await act(async () => root.render(<Probe />));
});
afterEach(async () => {
    await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});
function event(type: string, pointerType?: string, detail = 1) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, detail });
    if (pointerType) Object.assign(event, { pointerType });
    container.querySelector('button')!.dispatchEvent(event);
    return event;
}
it('落笔中及抬笔后 800ms 内忽略 touch，pen、鼠标及键盘可提交', () => {
    guard.onPenActivity(true);
    expect(event('pointerdown', 'touch').defaultPrevented).toBe(true);
    expect(event('click', 'touch').defaultPrevented).toBe(true);
    event('pointerdown', 'pen'); event('click', 'pen');
    event('pointerdown', 'mouse'); event('click', 'mouse');
    event('click', undefined, 0);
    expect(submit).toHaveBeenCalledTimes(3);
    guard.onPenActivity(false);
    vi.advanceTimersByTime(799);
    event('pointerdown', 'touch'); event('click', 'touch');
    expect(submit).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(1);
    event('pointerdown', 'touch'); event('click', 'touch');
    expect(submit).toHaveBeenCalledTimes(4);
});
it('Safari 兼容 click 沿用触摸 pointerdown，晚到的 click 仍被拦截，键盘不受影响', () => {
    guard.onPenActivity(false);
    event('pointerdown', 'touch');
    vi.advanceTimersByTime(900);
    expect(event('click').defaultPrevented).toBe(true);
    event('click', undefined, 0);
    expect(submit).toHaveBeenCalledTimes(1);
    event('pointerdown', 'pen'); event('click');
    expect(submit).toHaveBeenCalledTimes(2);
});
