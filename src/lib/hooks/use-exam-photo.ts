"use client";

import { useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { MAX_EXAM_PAGES, moveExamPage } from '@/lib/exam/exam-photo-schema';
import { compressAnswerPhoto, rotateAnswerPhoto } from '@/lib/handwriting/photo';
import type { ExamAttemptDetail } from '@/types/api';

export interface ExamPhoto { key: string; source: string; ref?: string; status: 'uploading' | 'saved' | 'failed' }
interface PageResponse { pages: string[]; issues: NonNullable<ExamAttemptDetail['pageIssues']> }
export function useExamPhoto(attempt: ExamAttemptDetail, onSubmitted: () => Promise<void>) {
    const base = `/api/exams/${attempt.paper.id}/attempts/${attempt.id}`;
    const [photos, setPhotos] = useState<ExamPhoto[]>(() => (attempt.pages ?? []).map((ref, index) => ({ key: `${index}-${ref}`, ref, source: `${base}/pages/${index}/image`, status: 'saved' })));
    const [issues, setIssues] = useState(attempt.pageIssues ?? []);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const lock = useRef(false);
    const serverPages = useRef(attempt.pages ?? []);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 交卷可能立即返回问题页，同步服务器重新读取的提示。
        if (attempt.pageIssues) setIssues(attempt.pageIssues);
    }, [attempt.pageIssues]);
    const update = (items: ExamPhoto[]) => {
        setPhotos(items.map(item => item.ref && !item.source.startsWith('data:') ? {
            ...item,
            source: `${base}/pages/${serverPages.current.indexOf(item.ref)}/image?ref=${encodeURIComponent(item.ref)}`,
        } : item));
    };
    async function action(work: () => Promise<void>) {
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setError(false);
        try { await work(); } catch { setError(true); }
        finally { lock.current = false; setBusy(false); }
    }
    const accept = (response: PageResponse) => { serverPages.current = response.pages; setIssues(response.issues); };
    async function upload(photo: ExamPhoto, items: ExamPhoto[]) {
        update(items.map(item => item.key === photo.key ? { ...item, status: 'uploading' } : item));
        try {
            const response = await apiClient.post<PageResponse>(`${base}/pages`, { image: photo.source, expected: serverPages.current });
            accept(response);
            const uploaded = items.map(item => item.key === photo.key ? { ...item, ref: response.pages.at(-1), status: 'saved' as const } : item);
            const saved = uploaded.filter(item => item.ref)
                .sort((a, b) => serverPages.current.indexOf(a.ref!) - serverPages.current.indexOf(b.ref!));
            return [...saved, ...uploaded.filter(item => !item.ref)];
        } catch {
            setError(true);
            return items.map(item => item.key === photo.key ? { ...item, status: 'failed' as const } : item);
        }
    }
    const select = (files: File[], index?: number) => action(async () => {
        if (index !== undefined) {
            if (!files[0]) return;
            const source = await compressAnswerPhoto(files[0]);
            const response = await apiClient.put<PageResponse>(`${base}/pages`, { expected: serverPages.current, pages: photos.map((photo, i) => i === index ? source : photo.ref) });
            accept(response);
            update(photos.map((photo, i) => i === index ? { ...photo, source, ref: response.pages[i] } : photo));
            return;
        }
        let items = [...photos];
        for (const file of files.slice(0, MAX_EXAM_PAGES - items.length)) {
            const photo: ExamPhoto = { key: crypto.randomUUID(), source: '', status: 'uploading' };
            try { photo.source = await compressAnswerPhoto(file); }
            catch { setError(true); continue; }
            items = await upload(photo, [...items, photo]);
            update(items);
        }
    });
    const retry = (index: number) => action(async () => update(await upload(photos[index], photos)));
    const allSaved = photos.every(photo => photo.status === 'saved');
    const replace = (items: ExamPhoto[]) => action(async () => {
        const response = await apiClient.put<PageResponse>(`${base}/pages`, { expected: serverPages.current, pages: items.map(photo => photo.ref) });
        accept(response); update(items);
    });
    const move = (from: number, to: number) => replace(moveExamPage(photos, from, to));
    const rotate = (index: number) => action(async () => {
        const photo = photos[index];
        const sourceUrl = photo.source.startsWith('data:') ? photo.source : `${base}/pages/${serverPages.current.indexOf(photo.ref!)}/image`;
        const blob = await (await fetch(sourceUrl)).blob();
        const source = await rotateAnswerPhoto(await compressAnswerPhoto(blob));
        const response = await apiClient.put<PageResponse>(`${base}/pages`, { expected: serverPages.current, pages: photos.map((item, i) => i === index ? source : item.ref) });
        accept(response); update(photos.map((item, i) => i === index ? { ...item, source, ref: response.pages[i] } : item));
    });
    const remove = (index: number) => action(async () => {
        const photo = photos[index];
        if (photo.ref) {
            // 失败照片只保存在本机，服务端下标只计算已上传照片。
            const response = await apiClient.delete<PageResponse>(`${base}/pages/${serverPages.current.indexOf(photo.ref)}?reference=${encodeURIComponent(photo.ref)}`);
            accept(response);
        }
        update(photos.filter((_, i) => i !== index));
    });
    const submit = (force = false) => action(async () => {
        if (!photos.length || !allSaved) return;
        try { await apiClient.post(`${base}/submit`, force ? { force: true } : {}); }
        finally { await onSubmitted(); }
    });
    const manual = () => action(async () => {
        try { await apiClient.post(`${base}/manual`, {}); }
        finally { await onSubmitted(); }
    });
    return { manual, photos, issues, busy, error, allSaved, select, retry, move, rotate, remove, submit };
}
