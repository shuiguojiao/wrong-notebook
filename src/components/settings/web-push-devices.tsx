'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/date-time';

interface Device {
    id: string;
    createdAt: string;
    needsRenewal: boolean;
}

interface DeviceList {
    publicKey: string | null;
    devices: Device[];
}

interface BrowserPush {
    registration: ServiceWorkerRegistration;
    subscription: PushSubscription | null;
    id: string | null;
}

interface WebPushDevicesProps {
    timeZone: string;
    disabled: boolean;
}

const devicesUrl = '/api/reminders/devices';

function workerSupportsPush(worker: ServiceWorker | null) {
    if (!worker) return Promise.resolve(false);
    return new Promise<boolean>(resolve => {
        const channel = new MessageChannel();
        const finish = (supported: boolean) => {
            window.clearTimeout(timer);
            channel.port1.close();
            resolve(supported);
        };
        const timer = window.setTimeout(() => finish(false), 2000);
        channel.port1.onmessage = ({ data }) => finish(data === true);
        try { worker.postMessage('review-push-ready', [channel.port2]); }
        catch { finish(false); }
    });
}

async function readBrowserPush(registration: ServiceWorkerRegistration): Promise<BrowserPush> {
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return { registration, subscription: null, id: null };
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(subscription.endpoint));
    const id = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    return { registration, subscription, id };
}

function decodeKey(key: string) {
    return Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
}

export function WebPushDevices({ timeZone, disabled }: WebPushDevicesProps) {
    const { t } = useLanguage();
    const text = t.reminders.webPush;
    const [list, setList] = useState<DeviceList | null>(null);
    const [browser, setBrowser] = useState<BrowserPush | null>(null);
    const [support, setSupport] = useState<'install' | 'unsupported' | 'available' | null>(null);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');

    useEffect(() => {
        let active = true;
        void apiClient.get<DeviceList>(devicesUrl)
            .then(value => { if (active) setList(value); })
            .catch(() => { if (active) setNotice(text.loadFailed); });

        const loadBrowser = async () => {
            const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent)
                || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            const standalone = matchMedia('(display-mode: standalone)').matches
                || (navigator as Navigator & { standalone?: boolean }).standalone === true;
            if (appleMobile && !standalone) {
                if (active) setSupport('install');
            } else if (!window.isSecureContext || !('serviceWorker' in navigator)
                || !('Notification' in window) || (!appleMobile && navigator.vendor !== 'Apple Computer, Inc.')) {
                if (active) setSupport('unsupported');
            } else {
                const registration = await navigator.serviceWorker.ready;
                if (!('pushManager' in registration)) {
                    if (active) setSupport('unsupported');
                    return;
                }
                // 已安装的旧版本可能正在更新，等到支持推送的 Worker 激活后才允许开启。
                if (!await workerSupportsPush(registration.active)) return;
                const current = await readBrowserPush(registration);
                if (active) {
                    setBrowser(current);
                    setSupport('available');
                }
            }
        };
        const checkBrowser = () => { void loadBrowser().catch(() => { if (active) setSupport('unsupported'); }); };
        checkBrowser();
        navigator.serviceWorker?.addEventListener('controllerchange', checkBrowser);
        return () => {
            active = false;
            navigator.serviceWorker?.removeEventListener('controllerchange', checkBrowser);
        };
    }, [text.loadFailed]);

    const current = list?.devices.find(device => device.id === browser?.id);
    const refresh = async () => setList(await apiClient.get<DeviceList>(devicesUrl));

    const run = async (action: () => Promise<void>, error: string) => {
        setBusy(true);
        setNotice('');
        try { await action(); }
        catch {
            setNotice(typeof Notification !== 'undefined' && Notification.permission === 'denied' ? text.denied : error);
        } finally { setBusy(false); }
    };

    const enable = () => {
        if (!browser || !list?.publicKey) return;
        const vapidKey = list.publicKey;
        void run(async () => {
            const applicationServerKey = decodeKey(vapidKey);
            const storedKey = browser.subscription?.options.applicationServerKey;
            const previousKey = storedKey && new Uint8Array(storedKey);
            if (previousKey && (previousKey.length !== applicationServerKey.length
                || !applicationServerKey.every((byte, index) => byte === previousKey[index]))) {
                if (browser.id) await apiClient.delete(`${devicesUrl}?id=${browser.id}`);
                await browser.subscription?.unsubscribe();
                setBrowser(await readBrowserPush(browser.registration));
                await refresh();
                setNotice(text.renew);
                return;
            }
            // 在点击事件内直接请求订阅，避免异步加载使 Safari 丢失用户手势。
            const subscription = browser.subscription ?? await browser.registration.pushManager.subscribe({
                userVisibleOnly: true, applicationServerKey,
            });
            await apiClient.post(devicesUrl, { ...subscription.toJSON(), vapidKey });
            setBrowser(await readBrowserPush(browser.registration));
            await refresh();
            setNotice(text.enabled);
        }, text.enableFailed);
    };

    const remove = (id: string) => {
        void run(async () => {
            await apiClient.delete(`${devicesUrl}?id=${id}`);
            if (browser?.id === id) {
                await browser.subscription?.unsubscribe().catch(() => undefined);
                setBrowser(await readBrowserPush(browser.registration));
            }
            await refresh();
            setNotice(text.removed);
        }, text.removeFailed);
    };

    const test = () => {
        if (!current) return;
        void run(async () => {
            const { result } = await apiClient.post<{ result: 'accepted' | 'failed' }>('/api/reminders/test', { deviceId: current.id });
            setNotice(result === 'accepted' ? t.reminders.accepted : t.reminders.failed);
            if (result === 'failed') await refresh();
        }, t.reminders.testFailed);
    };

    const denied = support === 'available' && Notification.permission === 'denied';
    return <div className="space-y-3 rounded-md border p-3">
        <p className="text-sm text-muted-foreground">{text.description}</p>
        {list && !list.publicKey && <p className="text-sm">{text.unavailable}</p>}
        {list?.publicKey && support === null && <p role="status" className="text-sm">{text.preparing}</p>}
        {support === 'install' && <p className="text-sm">{text.install}</p>}
        {support === 'unsupported' && <p className="text-sm">{text.unsupported}</p>}
        {denied && <p className="text-sm">{text.denied}</p>}
        {browser && list?.publicKey && !denied && (!current || current.needsRenewal) && <Button
            type="button" variant="outline" className="min-h-11" onClick={enable} disabled={disabled || busy}
        >{text.enable}</Button>}
        {current && !current.needsRenewal && !denied && list?.publicKey && <Button
            type="button" variant="outline" className="min-h-11" onClick={test} disabled={disabled || busy}
        >{text.test}</Button>}
        {!!list?.devices.length && <ul className="divide-y">
            {list.devices.map(device => <li key={device.id} className="flex flex-wrap items-center justify-between gap-2 py-1 text-sm">
                <span>{device.id === current?.id ? text.current : text.other}
                    {' · '}{formatDateTime(device.createdAt, 'yyyy-MM-dd HH:mm', timeZone)}
                    {device.needsRenewal && ` · ${text.needsRenewal}`}
                </span>
                <Button type="button" variant="ghost" className="min-h-11" onClick={() => remove(device.id)} disabled={disabled || busy}>
                    {device.id === current?.id ? text.disable : text.remove}
                </Button>
            </li>)}
        </ul>}
        {(busy || notice) && <p role="status" className="text-sm">{busy ? t.reminders.working : notice}</p>}
    </div>;
}
