import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReviewTimer } from '@/lib/hooks/use-review-timer';

let root: Root;
let container: HTMLDivElement;
let milliseconds = 0;
let hidden = false;
let timer: ReturnType<typeof useReviewTimer>;
function Timer({ enabled }: { enabled: boolean }) {
    const value = useReviewTimer(enabled);
    useEffect(() => { timer = value; }, [value]);
    return null;
}
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    milliseconds = 0; hidden = false;
    vi.spyOn(performance, 'now').mockImplementation(() => milliseconds);
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    container = document.createElement('div'); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('复习前台作答计时', () => {
    it('题目加载完成才开始，提交后冻结，判题和确认时间不计入', async () => {
        await act(async () => root.render(<Timer enabled={false} />));
        milliseconds = 2000;
        await act(async () => root.render(<Timer enabled />));
        milliseconds = 12200;
        expect(timer.pause()).toBe(10);
        milliseconds = 120000;
        expect(timer.pause()).toBe(10);
    });
    it('隐藏时暂停，返回前台续计，多次可见事件不重复起算', async () => {
        await act(async () => root.render(<Timer enabled />));
        milliseconds = 5000; hidden = true; document.dispatchEvent(new Event('visibilitychange'));
        milliseconds = 65000; hidden = false; document.dispatchEvent(new Event('visibilitychange'));
        milliseconds = 67000; document.dispatchEvent(new Event('visibilitychange'));
        milliseconds = 70000;
        expect(timer.pause()).toBe(10);
    });
    it('在后台加载不计时，跳过或离开当前题后停止，恢复可继续', async () => {
        hidden = true;
        await act(async () => root.render(<Timer enabled />));
        milliseconds = 30000; hidden = false; document.dispatchEvent(new Event('visibilitychange'));
        milliseconds = 40000;
        await act(async () => root.render(<Timer enabled={false} />));
        milliseconds = 80000;
        expect(timer.pause()).toBe(10);
        await act(async () => root.render(<Timer enabled />));
        milliseconds = 85000; expect(timer.pause()).toBe(15);
    });
});
