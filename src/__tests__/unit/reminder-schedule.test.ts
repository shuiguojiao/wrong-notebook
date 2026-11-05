// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/config', () => ({ getAppConfig: () => ({}), getAppTimeZone: () => 'Asia/Shanghai' }));
import { reminderDue, remindersEnabled, reviewUrl } from '@/lib/reminders/service';
const state = { reminderTime: '09:00', reminderDay: null, reminderAttempts: 0, reminderCompletedDay: null, reminderLeaseUntil: null };
afterEach(() => vi.unstubAllEnvs());
describe('提醒日期与发送资格', () => {
    it('按应用时区判断到点，允许当天补发', () => {
        expect(reminderDue(state, new Date('2026-11-05T00:59:00Z'), 'Asia/Shanghai')).toBe(false);
        expect(reminderDue(state, new Date('2026-11-05T01:00:00Z'), 'Asia/Shanghai')).toBe(true);
        expect(reminderDue(state, new Date('2026-11-05T01:00:00Z'), 'America/New_York')).toBe(true);
        expect(reminderDue(state, new Date('2026-11-05T13:59:00Z'), 'America/New_York')).toBe(false);
    });
    it('成功后当天改时间也不重复；失败初次加两次重试，隔日重置', () => {
        const now = new Date('2026-11-05T04:00:00Z');
        expect(reminderDue({ ...state, reminderCompletedDay: '2026-11-05', reminderTime: '10:00' }, now, 'Asia/Shanghai')).toBe(false);
        for (const attempts of [1, 2]) expect(reminderDue({ ...state, reminderDay: '2026-11-05', reminderAttempts: attempts }, now, 'Asia/Shanghai')).toBe(true);
        expect(reminderDue({ ...state, reminderDay: '2026-11-05', reminderAttempts: 3 }, now, 'Asia/Shanghai')).toBe(false);
        expect(reminderDue({ ...state, reminderDay: '2026-11-04', reminderAttempts: 3 }, now, 'Asia/Shanghai')).toBe(true);
        expect(reminderDue({ ...state, reminderLeaseUntil: new Date('2026-11-05T04:01:00Z') }, now, 'Asia/Shanghai')).toBe(false);
    });
    it('支持夏令时跳过的钟点，到点后补发', () => {
        expect(reminderDue({ ...state, reminderTime: '02:30' }, new Date('2026-03-08T07:00:00Z'), 'America/New_York')).toBe(true);
    });
    it('失败后租约限制重试时间，第三次失败后当天停止', () => {
        const failed = { ...state, reminderDay: '2026-11-05', reminderAttempts: 1, reminderLeaseUntil: new Date('2026-11-05T04:30:00Z') };
        expect(reminderDue(failed, new Date('2026-11-05T04:29:00Z'), 'Asia/Shanghai')).toBe(false);
        expect(reminderDue(failed, new Date('2026-11-05T04:30:00Z'), 'Asia/Shanghai')).toBe(true);
        expect(reminderDue({ ...failed, reminderAttempts: 3 }, new Date('2026-11-05T05:30:00Z'), 'Asia/Shanghai')).toBe(false);
    });
    it('站点缺省不带链接，全局关闭包含测试消息', () => {
        vi.stubEnv('NEXTAUTH_URL', ''); expect(reviewUrl()).toBeUndefined();
        vi.stubEnv('NEXTAUTH_URL', 'https://notebook.example'); expect(reviewUrl()).toBe('https://notebook.example/review');
        vi.stubEnv('NEXTAUTH_URL', 'javascript:bad'); expect(reviewUrl()).toBeUndefined();
        vi.stubEnv('REVIEW_REMINDERS_ENABLED', 'false'); expect(remindersEnabled()).toBe(false);
    });
});
