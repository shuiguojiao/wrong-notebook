"use client";

import { useState } from 'react';
import { PhotoAnswer } from '@/components/handwriting/photo-answer';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { examRegionSchema } from '@/lib/exam/exam-photo-schema';
import type { ExamAttemptAnswer } from '@/types/api';

interface AttemptPhotoToolsProps {
    paperId: string; attemptId: string; answer?: ExamAttemptAnswer;
    pageCount?: number;
    canSupplement: boolean; pending: boolean;
    onSupplement?: (photos: string[]) => void;
}
export function AttemptPhotoTools({ paperId, attemptId, answer, pageCount = 0, canSupplement, pending, onSupplement }: AttemptPhotoToolsProps) {
    const { t } = useLanguage();
    const [viewPage, setViewPage] = useState(answer?.pageIndex ?? 0);
    const [whole, setWhole] = useState(false);
    const [supplement, setSupplement] = useState(false);
    const [photos, setPhotos] = useState<string[]>([]);
    const [processing, setProcessing] = useState(false);
    let region;
    try { region = examRegionSchema.safeParse(JSON.parse(answer?.region ?? 'null')); } catch { region = undefined; }
    const box = region?.success ? region.data : null;
    const pageIndex = answer?.pageIndex;
    return <div className="space-y-3">
        {(pageCount > 0 || pageIndex !== null && pageIndex !== undefined) && <Button variant="outline" className="min-h-11" onClick={() => { setViewPage(pageIndex ?? 0); setWhole(true); }}>{t.examPhoto.wholePage}</Button>}
        {canSupplement && <Button variant="outline" className="min-h-11" disabled={pending || (answer?.gradingRetries ?? 0) >= 2} onClick={() => setSupplement(true)}>{t.examPhoto.supplement}</Button>}
        <Dialog open={whole} onOpenChange={setWhole}>
            <DialogContent aria-describedby={undefined} className="max-w-4xl [&>button]:min-h-11 [&>button]:min-w-11">
                <DialogTitle>{t.examPhoto.wholePage}</DialogTitle>
                {pageCount > 1 && <div className="flex flex-wrap gap-2" role="group" aria-label={t.examPhoto.pages}>
                    {Array.from({ length: pageCount }, (_, index) => <Button key={index} variant="outline" className="min-h-11" aria-pressed={viewPage === index} onClick={() => setViewPage(index)}>{t.examPhoto.page.replace('{n}', String(index + 1))}</Button>)}
                </div>}
                <div className="max-h-[75dvh] overflow-auto">
                    <div className="relative">
                        <img src={`/api/exams/${paperId}/attempts/${attemptId}/pages/${viewPage}/image`} alt={t.examPhoto.wholePage} className="block h-auto w-full" />
                        {box && viewPage === pageIndex && <div aria-hidden="true" className="pointer-events-none absolute border-2 border-amber-600 bg-amber-300/25" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }} />}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
        <Dialog open={supplement} onOpenChange={open => { if (!pending && !processing) setSupplement(open); }}>
            <DialogContent aria-describedby={undefined} className="max-h-[90dvh] overflow-auto [&>button]:min-h-11 [&>button]:min-w-11">
                <DialogTitle>{t.examPhoto.supplement}</DialogTitle>
                <PhotoAnswer photos={photos} onChange={setPhotos} onBusyChange={setProcessing} readOnly={pending} />
                <Button className="min-h-11" disabled={!photos.length || processing || pending} onClick={() => { onSupplement?.(photos); setSupplement(false); }}>{t.examAnswering.regrade}</Button>
            </DialogContent>
        </Dialog>
    </div>;
}
