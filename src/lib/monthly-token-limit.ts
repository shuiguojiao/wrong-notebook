/** 仅比较已回填的本月输入与输出总量；最后一次调用可以越过上限。 */
export function isMonthlyTokenLimitReached(usedTokens: number, limit: number, admin = false): boolean {
    return !admin && limit > 0 && usedTokens >= limit;
}
