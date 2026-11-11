"use client";

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/error-message';
import { frontendLogger } from '@/lib/frontend-logger';
import type { UserProfile } from '@/types/api';

interface RewardSettingsProps { onSaved?: () => void }
type Preferences = { weeklyGoalDays: 3 | 4 | 5; rewardsEnabled: boolean };

/** 个人奖励设置直接位于“我的”，锚点无需打开弹窗。 */
export function RewardSettings({ onSaved }: RewardSettingsProps) {
    const { t } = useLanguage();
    const [value, setValue] = useState<Preferences>({ weeklyGoalDays: 4, rewardsEnabled: true });
    const [saved, setSaved] = useState<Preferences | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string>();
    const load = useCallback(async () => {
        setLoading(true);
        setMessage(undefined);
        try {
            const user = await apiClient.get<UserProfile>('/api/user');
            const prefs = { weeklyGoalDays: user.weeklyGoalDays ?? 4, rewardsEnabled: user.rewardsEnabled ?? true };
            setValue(prefs); setSaved(prefs);
        } catch (error) {
            setMessage(t.review.loadFailed);
            frontendLogger.error('[Settings]', '加载奖励设置失败', { error: getErrorMessage(error) });
        } finally { setLoading(false); }
    }, [t.review.loadFailed]);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 数据请求：加载个人偏好并更新加载状态
    useEffect(() => { void load(); }, [load]);
    const disabled = loading || saving || saved === null;
    async function save() {
        if (disabled) return;
        setSaving(true); setMessage(undefined);
        try {
            const user = await apiClient.patch<UserProfile>('/api/user', value);
            const prefs = { weeklyGoalDays: user.weeklyGoalDays ?? value.weeklyGoalDays, rewardsEnabled: user.rewardsEnabled ?? value.rewardsEnabled };
            setValue(prefs); setSaved(prefs); setMessage(t.importFlow.preferenceSaved);
            onSaved?.();
        } catch (error) {
            setMessage(t.importFlow.preferenceSaveFailed);
            frontendLogger.error('[Settings]', '保存奖励设置失败', { error: getErrorMessage(error) });
        } finally { setSaving(false); }
    }
    return <section id="rewards" aria-labelledby="rewards-title" className="scroll-mt-6 space-y-4 p-4">
        <h3 id="rewards-title" className="font-semibold">{t.rewards.settingsTitle}</h3>
        <fieldset disabled={disabled} className="space-y-2">
            <legend className="mb-2 text-sm">{t.rewards.weeklyGoalSetting}</legend>
            <div className="flex gap-2">{([3, 4, 5] as const).map(days => <Button key={days} type="button" variant={value.weeklyGoalDays === days ? 'default' : 'outline'}
                className="min-h-11 flex-1" aria-pressed={value.weeklyGoalDays === days} disabled={disabled}
                onClick={() => { setValue(previous => ({ ...previous, weeklyGoalDays: days })); setMessage(undefined); }}>{t.rewards.days.replace('{days}', String(days))}</Button>)}</div>
        </fieldset>
        <div className="flex min-h-11 items-center justify-between gap-3">
            <label htmlFor="show-rewards" className="text-sm">{t.rewards.showRewards}</label>
            <Switch id="show-rewards" checked={value.rewardsEnabled} disabled={disabled}
                onCheckedChange={checked => { setValue(previous => ({ ...previous, rewardsEnabled: checked })); setMessage(undefined); }} />
        </div>
        <Button type="button" variant="outline" className="min-h-11" disabled={disabled || (value.weeklyGoalDays === saved?.weeklyGoalDays && value.rewardsEnabled === saved?.rewardsEnabled)} onClick={() => void save()}>{saving ? t.common.loading : t.common.save}</Button>
        {!loading && saved === null && <Button variant="ghost" className="min-h-11" onClick={() => void load()}>{t.importFlow.retryLoad}</Button>}
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </section>;
}
