"use client";

import { useCallback, useRef } from 'react';
import type { MouseEvent, PointerEvent } from 'react';

/** 手掌点击只在落笔中及抬笔后的短窗口内拦截，键盘和笔仍可提交。 */
export function useInkGuard() {
    const pen = useRef({ down: false, ended: -Infinity });
    const pointer = useRef({ type: '', blocked: false, time: -Infinity });
    const onPenActivity = useCallback((down: boolean) => {
        pen.current = { down, ended: Date.now() };
    }, []);
    const guarded = () => pen.current.down || Date.now() - pen.current.ended < 800;
    return {
        onPenActivity,
        onPointerDown(event: PointerEvent<HTMLButtonElement>) {
            const blocked = event.pointerType === 'touch' && guarded();
            pointer.current = { type: event.pointerType, blocked, time: Date.now() };
            if (blocked) { event.preventDefault(); event.stopPropagation(); }
        },
        onClick(event: MouseEvent<HTMLButtonElement>) {
            const native = event.nativeEvent as globalThis.MouseEvent & { pointerType?: string; sourceCapabilities?: { firesTouchEvents?: boolean } };
            // Safari 的兼容 click 可能没有 pointerType，沿用此前的 pointerdown；键盘 click 的 detail 为零。
            let type = native.pointerType || '';
            if (!type && event.detail !== 0) {
                if (native.sourceCapabilities?.firesTouchEvents) type = 'touch';
                else if (Date.now() - pointer.current.time < 2000) type = pointer.current.type;
            }
            if (type === 'touch' && (guarded() || pointer.current.blocked)) {
                event.preventDefault(); event.stopPropagation();
            }
        },
    };
}
