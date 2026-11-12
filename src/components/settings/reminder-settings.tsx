'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { WebPushDevices } from '@/components/settings/web-push-devices';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/date-time';
import { REMINDER_CHANNELS } from '@/lib/reminders/schema';
import type { ReminderChannel } from '@/lib/reminders/schema';

interface ReminderView {
    reminderEnabled: boolean; reminderChannel: ReminderChannel | null; reminderCredential: string | null;
    reminderTime: string; reminderLastSentAt: string | null; reminderLastResult: 'accepted' | 'failed' | 'no_due' | null;
    available: boolean; hasSiteUrl: boolean; timeZone: string; allowCustomReminders: boolean;
}

export function ReminderSettings() {
    const { t } = useLanguage();
    const text = t.reminders;
    const [data, setData] = useState<ReminderView | null>(null);
    const [credential, setCredential] = useState('');
    const [busy, setBusy] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [message, setMessage] = useState('');
    const usesWebPush = data?.reminderChannel === 'web_push';
    useEffect(() => {
        let cancelled = false;
        void apiClient.get<ReminderView>('/api/reminders').then((value) => { if (!cancelled) setData(value); })
            .catch(() => { if (!cancelled) setMessage(text.loadFailed); });
        return () => { cancelled = true; };
    }, [text.loadFailed]);
    const submit = async (test: boolean) => {
        if (!data) return;
        setBusy(true); setMessage('');
        try {
            const saved = test ? await apiClient.post<ReminderView>('/api/reminders/test', {})
                : await apiClient.put<ReminderView>('/api/reminders', {
                    reminderEnabled: data.reminderEnabled, reminderChannel: data.reminderChannel,
                    reminderTime: data.reminderTime, ...(credential ? { reminderCredential: credential } : {}),
                });
            setData(saved); setCredential(''); setDirty(false);
            setMessage(test ? (saved.reminderLastResult === 'accepted' ? text.accepted : text.failed) : text.saved);
        } catch { setMessage(test ? text.testFailed : text.saveFailed); }
        finally { setBusy(false); }
    };
    return <section className="space-y-3 border-t pt-4" aria-labelledby="reminder-heading">
        <h3 id="reminder-heading" className="font-medium">{text.title}</h3>
        <p className="text-sm text-muted-foreground">{text.description}</p>
        {!data ? <p role="status">{message || text.loading}</p> : <>
            {!data.available && <p role="status" className="text-sm text-muted-foreground">{text.globalDisabled}</p>}
            {!data.hasSiteUrl && <p className="text-sm text-muted-foreground">{text.noSiteUrl}</p>}
            <div className="flex items-center justify-between gap-4">
                <Label htmlFor="reminder-enabled" className="flex min-h-11 flex-1 items-center">{text.enabled}</Label>
                <Switch id="reminder-enabled" checked={data.reminderEnabled} disabled={busy || !data.available}
                    onCheckedChange={(value) => { setData({ ...data, reminderEnabled: value }); setDirty(true); }} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="reminder-channel">{text.channel}</Label>
                    <select id="reminder-channel" className="min-h-11 w-full rounded-md border bg-background px-3 text-sm" value={data.reminderChannel ?? ''} disabled={busy}
                        onChange={(event) => { setData({ ...data, reminderChannel: event.target.value as ReminderChannel, reminderCredential: null }); setCredential(''); setDirty(true); }}>
                        <option value="" disabled>{text.choose}</option>
                        {REMINDER_CHANNELS.filter((channel) => channel !== 'custom' || data.allowCustomReminders || data.reminderChannel === 'custom')
                            .map((channel) => <option key={channel} value={channel}>{text.channels[channel]}</option>)}
                    </select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="reminder-time">{text.time} ({data.timeZone})</Label>
                    <Input id="reminder-time" type="time" className="min-h-11" value={data.reminderTime} disabled={busy}
                        onChange={(event) => { setData({ ...data, reminderTime: event.target.value }); setDirty(true); }} />
                </div>
            </div>
            {usesWebPush ? <WebPushDevices timeZone={data.timeZone} disabled={busy} /> : <div className="space-y-2">
                <Label htmlFor="reminder-credential">{text.credential}{data.reminderCredential ? ` (${data.reminderCredential})` : ''}</Label>
                <Input id="reminder-credential" type="password" autoComplete="new-password" className="min-h-11" value={credential} disabled={busy}
                    aria-describedby="reminder-credential-hint" onChange={(event) => { setCredential(event.target.value); setDirty(true); }} />
                <p id="reminder-credential-hint" className="text-xs text-muted-foreground">{text.credentialHint}</p>
            </div>}
            <div className="flex flex-wrap gap-3">
                <Button type="button" className="min-h-11" disabled={busy || !dirty} onClick={() => void submit(false)}>{busy ? text.working : text.save}</Button>
                {!usesWebPush && <Button type="button" variant="outline" className="min-h-11" disabled={busy || dirty || !data.available || !data.reminderCredential} onClick={() => void submit(true)}>{text.test}</Button>}
            </div>
            {!usesWebPush && <p className="text-xs text-muted-foreground">{text.testHint}</p>}
            <p className="break-words text-sm">{text.lastResult}: {data.reminderLastResult ? text[data.reminderLastResult] : text.never}
                {data.reminderLastSentAt ? ` · ${formatDateTime(data.reminderLastSentAt, 'yyyy-MM-dd HH:mm', data.timeZone)}` : ''}</p>
            {message && <p role="status" className="text-sm">{message}</p>}
        </>}
    </section>;
}
