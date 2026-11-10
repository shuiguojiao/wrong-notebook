"use client";

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { MAX_EXAM_PAGES } from '@/lib/exam/exam-photo-schema';
import { useExamPhoto } from '@/lib/hooks/use-exam-photo';
import type { ExamAttemptDetail } from '@/types/api';

interface ExamPhotoProps { attempt: ExamAttemptDetail; onSubmitted: () => Promise<void> }
export function ExamPhoto({ attempt, onSubmitted }: ExamPhotoProps) {
    const { t } = useLanguage();
    const state = useExamPhoto(attempt, onSubmitted);
    const camera = useRef<HTMLInputElement>(null);
    const library = useRef<HTMLInputElement>(null);
    const target = useRef<number | undefined>(undefined);
    const dragged = useRef<number | null>(null);
    const [confirm, setConfirm] = useState(false);
    const locateFailed = state.issues.some(issue => issue.reason === 'locate_failed');
    const hasPageIssues = state.issues.some(issue => issue.reason !== 'locate_failed');
    const submitLabel = locateFailed ? t.examPhoto.resubmit : t.examPhoto.submit;
    const full = state.photos.length >= MAX_EXAM_PAGES;
    const choose = (input: HTMLInputElement | null, index?: number) => { target.current = index; input?.click(); };
    const select = (input: HTMLInputElement) => { const files = Array.from(input.files ?? []); input.value = ''; void state.select(files, target.current); };
    return <main aria-busy={state.busy} className="mx-auto min-h-screen max-w-6xl space-y-6 p-4 pb-[max(2rem,env(safe-area-inset-bottom))] md:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild variant="outline" className="min-h-11" disabled={state.busy}><Link href={`/exams/${attempt.paper.id}`} aria-disabled={state.busy} onClick={event => { if (state.busy) event.preventDefault(); }}>{t.examAnswering.exit}</Link></Button>
            <h1 className="min-w-0 break-words text-xl font-semibold">{attempt.paper.title} · {t.examPhoto.title}</h1>
        </header>
        {attempt.gradingNotice && <p role="alert" className="rounded-md border p-4">{t.examAnswering.gradeFailed}</p>}
        {state.issues.map(issue => <p key={issue.index} role="alert" className="rounded-md border bg-muted p-4">{issue.reason === 'locate_failed' ? t.examPhoto.locateFailed : (issue.reason === 'unreadable' ? t.examPhoto.unreadable : t.examPhoto.wrongPaper).replace('{n}', String(issue.index + 1))}</p>)}
        <p>{t.examPhoto.hint}</p>
        <p className="text-sm text-muted-foreground">{t.examPhoto.limit}</p>
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label={t.handwriting.takePhoto} disabled={state.busy} onChange={event => select(event.target)} />
        <input ref={library} type="file" accept="image/*" multiple hidden aria-label={t.handwriting.choosePhoto} disabled={state.busy} onChange={event => select(event.target)} />
        <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="min-h-11 [@media(pointer:fine)]:hidden" disabled={state.busy || full} onClick={() => choose(camera.current)}>{t.handwriting.takePhoto}</Button>
            <Button variant="outline" className="min-h-11" disabled={state.busy || full} onClick={() => choose(library.current)}><span className="[@media(pointer:fine)]:hidden">{t.handwriting.choosePhoto}</span><span className="[@media(pointer:coarse)]:hidden">{t.handwriting.uploadPhoto}</span></Button>
        </div>
        <ol className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label={t.examPhoto.pages}>
            {state.photos.map((photo, index) => <li key={photo.key} className="min-w-0 space-y-3 rounded-lg border bg-card p-3" draggable={!state.busy && state.allSaved}
                onDragStart={() => { dragged.current = index; }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (dragged.current !== null && state.allSaved && !state.busy) void state.move(dragged.current, index); dragged.current = null; }}>
                <h2 className="font-medium">{t.examPhoto.page.replace('{n}', String(index + 1))}</h2>
                <img src={photo.source} alt={t.examPhoto.page.replace('{n}', String(index + 1))} className="h-52 w-full rounded object-contain" />
                <p role="status" className="text-sm">{t.examPhoto[photo.status]}</p>
                <div className="flex flex-wrap gap-2">
                    {photo.status === 'failed' && <Button variant="outline" className="min-h-11" disabled={state.busy} onClick={() => void state.retry(index)}>{t.review.retry}</Button>}
                    <Button variant="outline" className="min-h-11" disabled={state.busy || !state.allSaved || index === 0} onClick={() => void state.move(index, index - 1)}>{t.examPhoto.previous}</Button>
                    <Button variant="outline" className="min-h-11" disabled={state.busy || !state.allSaved || index === state.photos.length - 1} onClick={() => void state.move(index, index + 1)}>{t.examPhoto.next}</Button>
                    <Button variant="outline" className="min-h-11" disabled={state.busy || !state.allSaved} onClick={() => void state.rotate(index)}>{t.handwriting.rotatePhoto}</Button>
                    <Button variant="outline" className="min-h-11" disabled={state.busy || !state.allSaved} onClick={() => choose(camera.current, index)}>{t.handwriting.retake}</Button>
                    <Button variant="outline" className="min-h-11" disabled={state.busy} onClick={() => void state.remove(index)}>{t.common.delete}</Button>
                </div>
            </li>)}
        </ol>
        {state.busy && <p role="status">{t.common.loading}</p>}
        {state.error && <p role="alert" className="text-destructive">{t.examAttempt.networkError}</p>}
        {/* 操作固定在底部，照片多时不用滚到最下面才能交卷。 */}
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:-mx-8 md:px-8">
            <Button className="min-h-11" disabled={state.busy || !state.photos.length || !state.allSaved} onClick={() => setConfirm(true)}>{submitLabel}</Button>
            {hasPageIssues && !locateFailed && <Button variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={state.busy || !state.photos.length || !state.allSaved} onClick={() => void state.submit(true)}>{t.examPhoto.forceSubmit}</Button>}
            {locateFailed && <Button variant="outline" className="min-h-11" disabled={state.busy || !state.allSaved} onClick={() => void state.manual()}>{t.examAttempt.manualEntry}</Button>}
        </div>
        <Dialog open={confirm} onOpenChange={open => { if (!state.busy) setConfirm(open); }}>
            <DialogContent aria-describedby={undefined} className="[&>button]:min-h-11 [&>button]:min-w-11">
                <DialogTitle>{t.examPhoto.confirm.replace('{n}', String(state.photos.length))}</DialogTitle>
                <Button className="min-h-11" disabled={state.busy} onClick={() => { void state.submit().then(() => setConfirm(false)); }}>{submitLabel}</Button>
            </DialogContent>
        </Dialog>
    </main>;
}
