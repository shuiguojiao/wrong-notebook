"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { mergeHistoryDays } from '@/lib/practice-history-view';
import type { PracticeCalendarResponse, PracticeHistoryDay, PracticeHistoryPage } from '@/types/api';

interface HistoryOptions { date?: string; subjectId: string; wrongOnly: boolean }
interface HistoryState {
    key: string; days: PracticeHistoryDay[]; loading: boolean; error: boolean;
    hasMore: boolean; nextBefore: string | null;
}

export function historyQuery(options: HistoryOptions, before?: string): string {
    const params = new URLSearchParams({ days: '7' });
    if (before) params.set('before', before);
    else if (options.date) params.set('date', options.date);
    if (options.subjectId) params.set('subjectId', options.subjectId);
    if (options.wrongOnly) params.set('result', 'wrong');
    return `/api/practice/history?${params}`;
}

/** 筛选或日期变化时隔离旧请求；加载更早失败后保留已读记录和游标。 */
export function usePracticeHistory({ date, subjectId, wrongOnly }: HistoryOptions) {
    const key = JSON.stringify([date, subjectId, wrongOnly]);
    const initial: HistoryState = { key, days: [], loading: true, error: false, hasMore: false, nextBefore: null };
    const [state, setState] = useState(initial);
    const [attempt, setAttempt] = useState(0);
    const generation = useRef(0);
    const busy = useRef(false);
    useEffect(() => {
        const version = ++generation.current;
        busy.current = true;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 日期和筛选变化后重新请求，旧数据不冒充新结果。
        setState({ key, days: [], loading: true, error: false, hasMore: false, nextBefore: null });
        const options = { date, subjectId, wrongOnly };
        async function read() {
            try {
                const selected = await apiClient.get<PracticeHistoryPage>(historyQuery(options));
                if (generation.current !== version) return;
                setState({ key, days: selected.days, loading: Boolean(date && selected.hasMore), error: false, hasMore: selected.hasMore, nextBefore: date && selected.hasMore ? date : selected.nextBefore });
                // 指定日独立置顶，下面仍按七天窗口加载更早日期。
                const earlier = date && selected.hasMore
                    ? await apiClient.get<PracticeHistoryPage>(historyQuery(options, date)) : null;
                if (generation.current !== version) return;
                const tail = earlier ?? selected;
                setState({ key, days: mergeHistoryDays(selected.days, earlier?.days ?? []), loading: false, error: false, hasMore: tail.hasMore, nextBefore: tail.nextBefore });
            } catch {
                if (generation.current === version) setState(previous => ({ ...previous, loading: false, error: true }));
            } finally {
                if (generation.current === version) busy.current = false;
            }
        }
        void read();
        return () => { generation.current = version + 1; };
    }, [key, date, subjectId, wrongOnly, attempt]);

    const loadMore = useCallback(async () => {
        if (busy.current || state.key !== key || !state.hasMore || !state.nextBefore) return;
        busy.current = true;
        const version = generation.current;
        setState(previous => ({ ...previous, loading: true, error: false }));
        try {
            const page = await apiClient.get<PracticeHistoryPage>(historyQuery({ subjectId, wrongOnly }, state.nextBefore));
            if (version === generation.current) setState(previous => ({ ...previous, days: mergeHistoryDays(previous.days, page.days), loading: false, error: false, hasMore: page.hasMore, nextBefore: page.nextBefore }));
        } catch {
            if (version === generation.current) setState(previous => ({ ...previous, loading: false, error: true }));
        } finally {
            if (version === generation.current) busy.current = false;
        }
    }, [key, state, subjectId, wrongOnly]);
    return { ...(state.key === key ? state : initial), loadMore, retry: () => {
        if (state.nextBefore) void loadMore();
        else setAttempt(value => value + 1);
    } };
}

/** 周、月各自按区间缓存；对错筛选不改变日历圆点。缓存仅存于本次挂载。 */
export function usePracticeCalendar(from: string, to: string, subjectId: string) {
    const cache = useRef(new Map<string, PracticeCalendarResponse>());
    const params = new URLSearchParams({ from, to });
    if (subjectId) params.set('subjectId', subjectId);
    const key = params.toString();
    const [state, setState] = useState<{ key: string; data?: PracticeCalendarResponse; error?: boolean }>({ key: '' });
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let cancelled = false;
        const cached = cache.current.get(key);
        if (cached) {
            setState({ key, data: cached });
            return;
        }
        setState({ key });
        apiClient.get<PracticeCalendarResponse>(`/api/practice/history/calendar?${key}`).then(data => {
            if (!cancelled) { cache.current.set(key, data); setState({ key, data }); }
        }).catch(() => { if (!cancelled) setState({ key, error: true }); });
        return () => { cancelled = true; };
    }, [key, attempt]);
    return { data: state.key === key ? state.data : undefined, error: state.key === key && state.error, retry: () => setAttempt(value => value + 1) };
}
