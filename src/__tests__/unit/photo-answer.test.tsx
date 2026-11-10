import { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhotoAnswer } from '@/components/handwriting/photo-answer';
import { LanguageProvider } from '@/contexts/LanguageContext';

const mocks = vi.hoisted(() => ({ process: vi.fn(), compress: vi.fn(), rotate: vi.fn(), cropper: vi.fn() }));
vi.mock('@/lib/image-utils', () => ({ processImageFile: mocks.process }));
vi.mock('@/lib/handwriting/photo', () => ({ MAX_ANSWER_PHOTOS: 3, compressAnswerPhoto: mocks.compress, rotateAnswerPhoto: mocks.rotate }));
vi.mock('@/components/image-cropper', () => ({ ImageCropper: (props: { onCropComplete: (blob: Blob) => void; onClose: () => void; onRotate: () => void; busy: boolean }) => {
    mocks.cropper(props);
    return <div data-cropper><button disabled={props.busy} onClick={props.onRotate}>旋转裁剪</button><button disabled={props.busy} onClick={() => props.onCropComplete(new Blob(['cropped']))}>确认裁剪</button><button onClick={props.onClose}>取消裁剪</button></div>;
} }));
vi.mock('@/components/question/source-thumb', () => ({ SourceThumb: ({ src }: { src: string }) => <img src={src} alt="预览" /> }));
let root: Root;
let container: HTMLDivElement;
let photos: string[];
let busy: boolean;
function Probe() {
    const [value, setValue] = useState<string[]>([]);
    const [processing, setProcessing] = useState(false);
    useEffect(() => { photos = value; busy = processing; });
    return <PhotoAnswer photos={value} onChange={setValue} onBusyChange={setProcessing} readOnly={processing} />;
}
async function click(text: string, index = 0) {
    const button = [...container.querySelectorAll('button')].filter(node => node.textContent === text)[index];
    expect(button).toBeTruthy();
    await act(async () => button.click());
}
async function select() {
    const input = container.querySelector<HTMLInputElement>('input:not([capture])')!;
    const file = new File(['image'], 'answer.heic', { type: 'image/heic' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    return file;
}
async function add() { await click('从相册选'); await select(); await click('确认裁剪'); }
beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks(); localStorage.setItem('language', 'zh');
    mocks.process.mockResolvedValue('data:image/jpeg;base64,preview');
    mocks.compress.mockResolvedValue('data:image/jpeg;base64,photo');
    mocks.rotate.mockResolvedValue('data:image/jpeg;base64,rotated');
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await act(async () => root.render(<LanguageProvider><Probe /></LanguageProvider>));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('拍照作答面板', () => {
    it('区分相机和相册，处理后只进入单区域裁剪，确认压缩后才加入列表', async () => {
        expect(container.querySelector('input[capture]')?.getAttribute('capture')).toBe('environment');
        expect(container.querySelector('input:not([capture])')?.getAttribute('accept')).toBe('image/*');
        await click('从相册选'); const file = await select();
        expect(mocks.process).toHaveBeenCalledWith(file); expect(photos).toEqual([]); expect(busy).toBe(true);
        expect(mocks.cropper).toHaveBeenCalledWith(expect.objectContaining({ imageSrc: 'data:image/jpeg;base64,preview', allowMulti: false, hint: '只留下你的解答部分' }));
        expect(mocks.cropper.mock.lastCall?.[0]).not.toHaveProperty('onAutoSplit');
        expect(mocks.cropper.mock.lastCall?.[0]).not.toHaveProperty('onAddPart');
        await click('确认裁剪');
        expect(mocks.compress).toHaveBeenCalledWith(expect.any(Blob));
        expect(photos).toEqual(['data:image/jpeg;base64,photo']); expect(busy).toBe(false);
        expect(container.querySelector('input')?.value).toBe('');
    });
    it('裁剪中也可向右旋转，确认前保留待裁剪状态', async () => {
        await click('从相册选'); await select();
        await click('旋转裁剪');
        expect(mocks.rotate).toHaveBeenCalledWith('data:image/jpeg;base64,preview');
        expect(mocks.cropper.mock.lastCall?.[0]).toMatchObject({ imageSrc: 'data:image/jpeg;base64,rotated', busy: false });
        expect(photos).toEqual([]);
        await click('确认裁剪'); expect(photos).toHaveLength(1);
    });
    it('最多三张，满时禁止添加，删除后可继续添加', async () => {
        await add(); await add(); await add();
        expect(photos).toHaveLength(3);
        expect(container.textContent).toContain('最多 3 张');
        expect([...container.querySelectorAll('button')].find(node => node.textContent === '再加一张')?.disabled).toBe(true);
        await click('删除', 1); expect(photos).toHaveLength(2);
        await add(); expect(photos).toHaveLength(3);
    });
    it('重拍替换指定照片，取消保留旧图，旋转不改变顺序', async () => {
        await add(); mocks.compress.mockResolvedValueOnce('second'); await add();
        await click('重拍'); await select(); await click('取消裁剪');
        expect(photos).toEqual(['data:image/jpeg;base64,photo', 'second']);
        mocks.compress.mockResolvedValueOnce('replacement');
        await click('重拍', 1); await select(); await click('确认裁剪');
        expect(photos).toEqual(['data:image/jpeg;base64,photo', 'replacement']);
        await click('向右转 90°');
        expect(mocks.rotate).toHaveBeenCalledWith('data:image/jpeg;base64,photo');
        expect(photos).toEqual(['data:image/jpeg;base64,rotated', 'replacement']);
    });
    it('无效文件、压缩失败与旋转失败显示提示并保留已有照片', async () => {
        await add();
        mocks.process.mockRejectedValueOnce(new Error('decode failed'));
        await click('重拍'); await select();
        expect(container.querySelector('[role="alert"]')?.textContent).toBe('这张照片打不开，换一张试试');
        expect(busy).toBe(false);
        mocks.compress.mockRejectedValueOnce(new Error('too large'));
        await click('重拍'); await select(); await click('确认裁剪');
        mocks.rotate.mockRejectedValueOnce(new Error('canvas failed'));
        await click('向右转 90°');
        expect(photos).toEqual(['data:image/jpeg;base64,photo']); expect(busy).toBe(false);
        expect(container.querySelector('[role="alert"]')).toBeTruthy();
    });
    it('离开面板后丢弃迟到处理结果并释放忙碌状态', async () => {
        let finish!: (value: string) => void;
        mocks.process.mockReturnValueOnce(new Promise<string>(resolve => { finish = resolve; }));
        await click('从相册选'); await select(); expect(busy).toBe(true);
        await act(async () => root.render(<div />));
        await act(async () => finish('late'));
        expect(mocks.compress).not.toHaveBeenCalled(); expect(container.querySelector('[data-cropper]')).toBeNull();
    });
});
