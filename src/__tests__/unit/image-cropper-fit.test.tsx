import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ImageCropper } from '@/components/image-cropper';
import { LanguageProvider } from '@/contexts/LanguageContext';

it('按实际图片区高度适应长图并预留下边手柄，容器变高或变矮时重测', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const observers: Array<{ callback: ResizeObserverCallback; target?: Element; disconnect: ReturnType<typeof vi.fn<() => void>> }> = [];
    vi.stubGlobal('ResizeObserver', class {
        record: (typeof observers)[number];
        constructor(callback: ResizeObserverCallback) {
            this.record = { callback, disconnect: vi.fn() };
            observers.push(this.record);
        }
        observe(target: Element) { this.record.target = target; }
        disconnect() { this.record.disconnect(); }
        unobserve() {}
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
        await act(async () => root.render(<LanguageProvider><ImageCropper imageSrc="data:image/png;base64,AA==" open onClose={vi.fn()} onCropComplete={vi.fn()} /></LanguageProvider>));
        const image = document.querySelector<HTMLImageElement>('img[alt="Crop me"]')!;
        const notifyHeight = async (height: number) => act(async () => {
            for (const observer of observers) {
                if (observer.target?.contains(image)) observer.callback([{ contentRect: { height } } as ResizeObserverEntry], {} as ResizeObserver);
            }
        });
        await notifyHeight(300);
        expect(image.style.maxHeight).toBe('284px');
        await notifyHeight(200);
        expect(image.style.maxHeight).toBe('184px');
        await notifyHeight(500);
        expect(image.style.maxHeight).toBe('484px');
    } finally {
        await act(async () => root.unmount());
        host.remove();
        vi.unstubAllGlobals();
    }
    expect(observers.some(observer => observer.disconnect.mock.calls.length > 0)).toBe(true);
});
