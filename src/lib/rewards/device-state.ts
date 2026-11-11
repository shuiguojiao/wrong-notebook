/** 设备上的展示记录不是奖励账本；禁用存储时仍允许正常展示。 */
export function readRewardSeen(key: string): boolean {
    try { return localStorage.getItem(`rewards:${key}`) === '1'; }
    catch { return false; }
}

export function writeRewardSeen(key: string): void {
    try { localStorage.setItem(`rewards:${key}`, '1'); }
    catch { /* 存储受限不影响学习流程。 */ }
}
