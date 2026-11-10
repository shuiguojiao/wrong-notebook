"use client";

import { AnswerInput } from '@/components/handwriting/answer-input';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import type { ExamAnswerDraft } from '@/lib/exam/exam-answering-draft';
import { useHandwrittenAnswer } from '@/lib/hooks/use-handwritten-answer';
import type { ExamAttemptQuestion } from '@/types/api';

interface ExamAnswerEditorProps {
    draft: ExamAnswerDraft; question: ExamAttemptQuestion; paperId: string; attemptId: string; busy: boolean;
    onChange: (draft: ExamAnswerDraft) => void; onPenActivity: (down: boolean) => void; onPhotoBusy: (busy: boolean) => void;
}
/** 每道已访问的题保持挂载，切题沿用同一个画布与 Pencil 偏好。 */
export function ExamAnswerEditor({ draft, question, paperId, attemptId, busy, onChange, onPenActivity, onPhotoBusy }: ExamAnswerEditorProps) {
    const { t } = useLanguage();
    const handwriting = useHandwrittenAnswer(draft);
    const hasLocalImages = draft.ink.strokes.length > 0 || draft.photos.length > 0;
    const remoteImage = draft.serverImage && !hasLocalImages;
    return <div className="exam-answer-editor flex min-w-0 flex-col gap-3 lg:min-h-0 lg:overflow-y-auto">
        {remoteImage && <section className="space-y-2 rounded-md border p-3">
            <p className="text-sm">{t.examAnswering.remoteImage}</p>
            <a href={`/api/exams/${paperId}/attempts/${attemptId}/answers/${question.id}/image`} target="_blank" rel="noreferrer" className="block min-h-11 focus-visible:ring-2 focus-visible:ring-ring" aria-label={t.examAttempt.viewImage}>
                <img src={`/api/exams/${paperId}/attempts/${attemptId}/answers/${question.id}/image`} alt={t.examAttempt.imageAlt} className="max-h-72 w-full object-contain" />
            </a>
            <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => onChange({ ...draft, serverImage: false })}>{t.examAnswering.rewrite}</Button>
        </section>}
        <AnswerInput id={`exam-answer-${question.id}`} value={draft.text} onChange={text => onChange({ ...draft, text })}
            history={handwriting.ink} onInkChange={ink => { handwriting.setInk(ink); onChange({ ...draft, ink }); }}
            photos={handwriting.photos} onPhotosChange={photos => { handwriting.setPhotos(photos); onChange({ ...draft, photos }); }}
            onPhotoBusyChange={onPhotoBusy} mode={handwriting.answerMode} onModeChange={mode => { handwriting.setAnswerMode(mode); onChange({ ...draft, mode }); }}
            onPenActivity={onPenActivity} readOnly={busy || remoteImage} variant="review"
            question={{ text: question.questionText ?? '', figureSvg: question.figureSvg, figureScale: question.figureScale, figureAlign: question.figureAlign }} />
    </div>;
}
