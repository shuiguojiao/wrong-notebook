"use client";

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { detectOutdatedEngine } from '@/lib/browser-support';
import { useIsClient } from '@/lib/hooks/use-is-client';

/** 使用普通 CSS 显示升级提示，保证旧内核也能阅读和关闭。 */
export function OutdatedBrowserNotice() {
    const { t } = useLanguage();
    const isClient = useIsClient();
    const [dismissed, setDismissed] = useState(false);
    const engine = isClient ? detectOutdatedEngine(navigator.userAgent) : null;
    if (!engine || dismissed) return null;
    const message = engine.kind === 'webview' ? t.browserSupport.outdatedWebView : t.browserSupport.outdatedBrowser;
    return (
        <div role="alert" className="outdated-browser-notice">
            <p>{message.replace('{version}', String(engine.version))}</p>
            <button type="button" onClick={() => setDismissed(true)}>{t.common.close}</button>
        </div>
    );
}
