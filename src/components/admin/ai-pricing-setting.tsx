"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { toast } from '@/lib/feedback';
import { frontendLogger } from '@/lib/frontend-logger';
import type { ModelPrice } from '@/lib/ai-usage-stats';

interface PriceDraft { provider: string; model: string; inputPerMillion: string; outputPerMillion: string; currency: string }
const empty: PriceDraft = { provider: '', model: '', inputPerMillion: '', outputPerMillion: '', currency: '' };

export function AiPricingSetting() {
    const { t } = useLanguage();
    const [rows, setRows] = useState<PriceDraft[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [saving, setSaving] = useState(false);
    const load = async () => {
        setLoading(true); setFailed(false);
        try {
            const data = await apiClient.get<{ aiModelPrices?: ModelPrice[] }>('/api/settings');
            setRows((data.aiModelPrices ?? []).map(row => ({ ...row, inputPerMillion: String(row.inputPerMillion), outputPerMillion: String(row.outputPerMillion) })));
        } catch (error) { setFailed(true); frontendLogger.error('[AiPricingSetting]', '读取价格表失败', { error }); }
        finally { setLoading(false); }
    };
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 设置加载后填入表单
        void load();
    }, []);
    const valid = rows.every(row => row.provider.trim() && row.model.trim() && /^[a-z]{3}$/i.test(row.currency.trim()) &&
        [row.inputPerMillion, row.outputPerMillion].every(value => value.trim() && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1_000_000_000)) &&
        new Set(rows.map(row => JSON.stringify([row.provider.trim(), row.model.trim()]))).size === rows.length;
    const save = async () => {
        if (!valid) return;
        setSaving(true);
        try {
            await apiClient.post('/api/settings', { aiModelPrices: rows.map(row => ({ ...row, inputPerMillion: Number(row.inputPerMillion), outputPerMillion: Number(row.outputPerMillion) })) });
            toast.success(t.common.success);
        } catch (error) { toast.error(t.common.error); frontendLogger.error('[AiPricingSetting]', '保存价格表失败', { error }); }
        finally { setSaving(false); }
    };
    const labels = { provider: t.aiUsage.provider, model: t.aiUsage.model, inputPerMillion: t.aiUsage.inputPrice, outputPerMillion: t.aiUsage.outputPrice, currency: t.aiUsage.currency };
    return <section className="space-y-3 rounded-lg border p-4" aria-busy={loading}>
        <h3 className="font-medium">{t.aiUsage.pricing}</h3>
        <p className="text-sm text-muted-foreground">{t.aiUsage.pricingNote}</p>
        {loading && <p role="status">{t.common.loading}</p>}
        {failed && <Button variant="outline" onClick={load}>{t.aiUsage.refresh}</Button>}
        {rows.map((row, index) => <fieldset key={index} className="space-y-3 rounded-lg border p-3" disabled={loading || saving || failed}>
            <legend className="px-1 text-sm">{t.aiUsage.model} {index + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
                {(Object.keys(labels) as (keyof PriceDraft)[]).map(key => <div className="space-y-1" key={key}>
                    <Label htmlFor={`price-${index}-${key}`}>{labels[key]}</Label>
                    <Input id={`price-${index}-${key}`} value={row[key]} type={key.endsWith('PerMillion') ? 'number' : 'text'} min={0} step="any"
                        onChange={event => setRows(previous => previous.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item))} />
                </div>)}
            </div>
            <Button variant="outline" onClick={() => setRows(previous => previous.filter((_, i) => i !== index))}>{t.aiUsage.removePrice}</Button>
        </fieldset>)}
        {!valid && <p role="alert" className="text-sm text-destructive">{t.aiUsage.invalidPrice}</p>}
        <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setRows(previous => [...previous, { ...empty }])} disabled={loading || saving || failed || rows.length >= 200}>{t.aiUsage.addPrice}</Button>
            <Button onClick={save} disabled={loading || saving || failed || !valid}>{saving ? t.common.loading : t.common.save}</Button>
        </div>
    </section>;
}
