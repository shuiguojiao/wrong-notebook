import { describe, expect, it } from 'vitest';
import { isMonthlyTokenLimitReached } from '@/lib/monthly-token-limit';

describe('每人每月 token 上限口径', () => {
    it.each([[19, 20, false, false], [20, 20, false, true], [21, 20, false, true], [1000, 0, false, false], [1000, 1, true, false]])('已用 %s，上限 %s，管理员 %s', (used, limit, admin, reached) => {
        expect(isMonthlyTokenLimitReached(used, limit, admin)).toBe(reached);
    });
});
