"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { toast } from '@/lib/feedback';
import { frontendLogger } from '@/lib/frontend-logger';

export function AiMonthlyLimitSetting() {
    const { t } = useLanguage();
    const [value, setValue] = useState('0');
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [saving, setSaving] = useState(false);
    const load = async () => {
        setLoading(true); setFailed(false);
        try { const data = await apiClient.get<{ aiMonthlyTokenLimit?: number }>('/api/settings'); setValue(String(data.aiMonthlyTokenLimit ?? 0)); }
        catch (error) { setFailed(true); frontendLogger.error('[AiMonthlyLimitSetting]', '读取月上限失败', { error }); }
        finally { setLoading(false); }
    };
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 设置加载后填入表单
        void load();
    }, []);
    const valid = value.trim() !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
    const save = async () => {
        setSaving(true);
        try { await apiClient.post('/api/settings', { aiMonthlyTokenLimit: Number(value) }); toast.success(t.common.success); }
        catch (error) { toast.error(t.common.error); frontendLogger.error('[AiMonthlyLimitSetting]', '保存月上限失败', { error }); }
        finally { setSaving(false); }
    };
    return <section className="space-y-3 rounded-lg border p-4">
        <Label htmlFor="ai-monthly-limit">{t.aiUsage.monthlyLimit}</Label>
        <p className="text-sm text-muted-foreground">{t.aiUsage.monthlyNote}</p>
        <div className="flex flex-wrap gap-2">
            <Input className="w-48" id="ai-monthly-limit" type="number" min={0} step={1} inputMode="numeric" value={value} aria-invalid={!valid} disabled={loading || saving || failed} onChange={event => setValue(event.target.value)} />
            <Button onClick={failed ? load : save} disabled={loading || saving || (!failed && !valid)}>{failed ? t.aiUsage.refresh : saving ? t.common.loading : t.common.save}</Button>
        </div>
        {!valid && <p role="alert" className="text-sm text-destructive">{t.aiUsage.invalidMonthlyLimit}</p>}
    </section>;
}
