import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { useExamPhoto } from '@/lib/hooks/use-exam-photo';
import type { ExamAttemptDetail } from '@/types/api';
import { examAttempt } from '../fixtures/exam-attempt';

vi.mock('@/lib/handwriting/photo', () => ({ compressAnswerPhoto: vi.fn(async (file: File) => `data:${file.name}`), rotateAnswerPhoto: vi.fn(async () => 'data:rotated') }));
vi.mock('@/lib/api-client', () => ({ apiClient: { post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
let root: Root, container: HTMLDivElement;
let latest: ReturnType<typeof useExamPhoto>;
let attempt: ExamAttemptDetail;
const submitted = vi.fn(async () => undefined);
function Probe() { const value = useExamPhoto(attempt, submitted); useEffect(() => { latest = value; }); return null; }
beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    attempt = { ...examAttempt(), kind: 'photo', status: 'answering' };
    vi.mocked(apiClient.post).mockImplementation(async (url, input) => {
        if (url.endsWith('/submit')) return {};
        const data = input as { image: string; expected: string[] };
        return { pages: [...data.expected, `ref:${data.image}`], issues: [] };
    });
    vi.mocked(apiClient.put).mockImplementation(async (_url, input) => ({ pages: (input as { pages: string[] }).pages, issues: [] }));
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await act(async () => root.render(<Probe />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('拍照逐张上传与排序', () => {
    it('交卷立即返回问题页时更新提示，丢失提交响应也重新读取服务器状态', async () => {
        await act(async () => latest.select([new File(['a'], 'one')]));
        vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('lost response'));
        await act(async () => latest.submit());
        expect(submitted).toHaveBeenCalledOnce();
        attempt = { ...attempt, pageIssues: [{ index: 0, reason: 'unreadable' }] };
        await act(async () => root.render(<Probe />));
        expect(latest.issues).toEqual([{ index: 0, reason: 'unreadable' }]);
    });
    it('继续批改与手动录入均重新读取服务器状态', async () => {
        await act(async () => latest.select([new File(['a'], 'one')]));
        await act(async () => latest.submit(true));
        expect(apiClient.post).toHaveBeenCalledWith(expect.stringContaining('/submit'), { force: true });
        await act(async () => latest.manual());
        expect(apiClient.post).toHaveBeenCalledWith(expect.stringContaining('/manual'), {});
        expect(submitted).toHaveBeenCalledTimes(2);
    });
    it('多选最多八张，按顺序逐张上传，按钮排序整体提交', async () => {
        await act(async () => latest.select(Array.from({ length: 10 }, (_, index) => new File(['a'], String(index)))));
        expect(latest.photos).toHaveLength(8);
        expect(apiClient.post).toHaveBeenCalledTimes(8);
        expect(latest.allSaved).toBe(true);
        const first = latest.photos[0].key;
        await act(async () => latest.move(0, 7));
        expect(latest.photos[7].key).toBe(first);
        expect(apiClient.put).toHaveBeenCalledWith(expect.stringContaining('/pages'), expect.objectContaining({ pages: latest.photos.map(photo => photo.ref) }));
    });
    it('上传失败保留照片，可重试，全部上传前不能交卷', async () => {
        vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('offline'));
        await act(async () => latest.select([new File(['a'], 'one')]));
        expect(latest.photos[0].status).toBe('failed');
        await act(async () => latest.submit());
        expect(submitted).not.toHaveBeenCalled();
        await act(async () => latest.retry(0));
        expect(latest.photos[0].status).toBe('saved');
        await act(async () => latest.submit());
        expect(submitted).toHaveBeenCalledOnce();
    });
});
