"use client";

import { useCallback, useEffect, useRef } from 'react';

/** 只累计题目可见且仍在作答的时间；判题、确认和浏览器后台时间不计入。 */
export function useReviewTimer(enabled: boolean, initialSeconds = 0) {
    const clock = useRef({ elapsed: initialSeconds * 1000, started: null as number | null, frozen: false });
    const stop = useCallback(() => {
        if (clock.current.started !== null) clock.current.elapsed += performance.now() - clock.current.started;
        clock.current.started = null;
        return Math.max(0, Math.round(clock.current.elapsed / 1000));
    }, []);
    const pause = useCallback(() => { clock.current.frozen = true; return stop(); }, [stop]);
    const start = useCallback(() => {
        if (!document.hidden && !clock.current.frozen && clock.current.started === null) clock.current.started = performance.now();
    }, []);
    const resume = useCallback(() => {
        clock.current.frozen = false;
        start();
    }, [start]);
    useEffect(() => {
        if (!enabled) return;
        const visibility = () => { if (document.hidden) stop(); else start(); };
        resume();
        document.addEventListener('visibilitychange', visibility);
        return () => { stop(); document.removeEventListener('visibilitychange', visibility); };
    }, [enabled, resume, start, stop]);
    const elapsed = useCallback(() => Math.max(0, Math.round((clock.current.elapsed + (clock.current.started === null ? 0 : performance.now() - clock.current.started)) / 1000)), []);
    return { pause, resume, elapsed };
}
