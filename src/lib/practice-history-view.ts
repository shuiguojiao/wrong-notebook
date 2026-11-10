import type { PracticeHistoryDay, PracticeHistoryListRecord } from '@/types/api';

/** 按日历日期显示星期，不随浏览器时区偏移。 */
export function formatHistoryDay(date: string, language: string): string {
    return new Intl.DateTimeFormat(language, { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

/** 日期运算只处理日历，不受浏览器时区和夏令时影响。 */
export function shiftHistoryDate(date: string, days: number): string {
    const value = new Date(`${date}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
}

export function historyWeekStart(date: string): string {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    return shiftHistoryDate(date, -((weekday + 6) % 7));
}

export function historyMonth(date: string, offset = 0): { from: string; to: string } {
    const value = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
    value.setUTCMonth(value.getUTCMonth() + offset);
    const from = value.toISOString().slice(0, 10);
    value.setUTCMonth(value.getUTCMonth() + 1);
    value.setUTCDate(0);
    return { from, to: value.toISOString().slice(0, 10) };
}

export function historyDayState(total: number, correct: number): 'empty' | 'answered' | 'perfect' {
    return total === 0 ? 'empty' : total === correct ? 'perfect' : 'answered';
}

export function validHistoryDate(value: string | null, today: string): string | undefined {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value && value <= today ? value : undefined;
}

export function historyHref(date: string, record?: string): string {
    const params = new URLSearchParams({ date });
    if (record) params.set('record', record);
    return `/history?${params}`;
}

export function mergeHistoryDays(previous: PracticeHistoryDay[], next: PracticeHistoryDay[]): PracticeHistoryDay[] {
    return [...new Map([...previous, ...next].map(day => [day.date, day])).values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function groupHistorySources(records: PracticeHistoryListRecord[]) {
    const groups = new Map<string, { source: string; exam: PracticeHistoryListRecord['exam']; records: PracticeHistoryListRecord[] }>();
    for (const source of ['review', 'practice', 'exam', 'manual']) {
        for (const record of records.filter(value => value.source === source)) {
            const key = source === 'exam' ? `exam:${record.exam?.paperId ?? 'unknown'}` : source;
            const group = groups.get(key) ?? { source, exam: record.exam, records: [] };
            group.records.push(record);
            groups.set(key, group);
        }
    }
    return [...groups.entries()];
}
