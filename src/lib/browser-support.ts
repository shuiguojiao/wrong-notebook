/** Tailwind CSS 4 所需的最低 Chromium 主版本，沿用上游兼容要求。 */
export const MIN_CHROMIUM_VERSION = 111;

interface OutdatedEngine {
    kind: 'webview' | 'browser';
    version: number;
}

/** 仅检测可识别的 Chromium 内核，非 Chromium 浏览器保持原有行为。 */
export function detectOutdatedEngine(userAgent: string): OutdatedEngine | null {
    const chrome = /\bChrome\/(\d+)\./.exec(userAgent);
    if (!chrome || Number(chrome[1]) >= MIN_CHROMIUM_VERSION) return null;
    return {
        kind: /; wv\)|WrongNotebookAndroid\//.test(userAgent) ? 'webview' : 'browser',
        version: Number(chrome[1]),
    };
}
