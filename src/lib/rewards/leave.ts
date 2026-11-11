import { computeCurrentStreak } from '@/lib/stats/stats-streak';
import { REWARD_RULES_VERSION, shiftDay } from './rules';
import type { Award } from './rules';

/** 从启用日回放；已经获得或用掉的卡是事实，撤回作答也不收回。 */
export function settleLeave(realDays: ReadonlySet<string>, existing: readonly Award[], today: string): Award[] {
    const awards: Award[] = [];
    const add = (type: string, day: string, refKey: string) => awards.push({ type, day, refKey, points: 0,
        meta: JSON.stringify({ rulesVersion: REWARD_RULES_VERSION }) });
    const start = existing.find(entry => entry.type === 'leave_start' && entry.refKey === 'leave-start')?.day ?? today;
    if (!existing.some(entry => entry.type === 'leave_start' && entry.refKey === 'leave-start')) add('leave_start', today, 'leave-start');
    const usedDays = new Set(existing.filter(entry => entry.type === 'leave_use').map(entry => entry.day));
    const completed = new Set([...realDays, ...usedDays]);
    const earned = new Set(existing.filter(entry => entry.type === 'leave_earn').map(entry => entry.day));
    // 持卡数随日期推进：只能用当时已经攒到的卡，后来攒到的卡不能倒回去补更早的缺口。已写入的卡在它的日期计入。
    let held = [...earned].filter(day => day < start).length - [...usedDays].filter(day => day < start).length;
    // 传入 start 以便从 start - 1 精确倒数，不把更早的缺口当成待补日期。
    let run = computeCurrentStreak(new Set([...completed].filter(day => day < start)), start);
    for (let day = start; day <= today; day = shiftDay(day, 1)) {
        if (completed.has(day)) {
            if (usedDays.has(day)) held--;
            run++;
        } else {
            if (day === today) continue;
            if (realDays.has(shiftDay(day, -1)) && (realDays.has(shiftDay(day, 1)) || shiftDay(day, 1) === today) && held > 0) {
                add('leave_use', day, `leave:${day}`);
                held--;
                completed.add(day);
                run++;
            } else run = 0;
        }
        if (earned.has(day)) held++;
        else if (run > 0 && run % 7 === 0 && held < 2) {
            add('leave_earn', day, `leave-earn:${day}`);
            held++;
            earned.add(day);
        }
    }
    return awards;
}

/** 温和归零只展示最近一段，不能误用历史最长连续。 */
export function lastStreak(completed: ReadonlySet<string>, today: string, streak: number): number | null {
    if (streak > 0) return null;
    const latest = [...completed].filter(day => day <= today).sort().at(-1);
    return latest ? computeCurrentStreak(completed, latest) : 0;
}
