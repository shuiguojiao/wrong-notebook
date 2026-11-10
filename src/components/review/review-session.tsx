"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReviewQuestionState } from '@/components/review/original-review';
import { ReviewQuestion } from '@/components/review/review-question';
import { ReviewSummary } from '@/components/review/review-summary';
import { Button } from '@/components/ui/button';
import { useReleaseFocusShell } from '@/contexts/FocusShellContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { confirmDialog } from '@/lib/feedback';
import { useReviewSession } from '@/lib/hooks/use-review-session';
import { usePageTitle } from '@/lib/page-title';
import type { ReviewOutcome } from '@/lib/review-session';

interface ReviewSessionProps { initialSubjectId: string; initialMode?: 'today' | 'extra' }

export function ReviewSession({ initialSubjectId, initialMode = 'today' }: ReviewSessionProps) {
    const { t } = useLanguage();
    usePageTitle(t.review.sessionTitle);
    const session = useReviewSession();
    useReleaseFocusShell(session.items?.length === 0 || (!session.items && !!session.error));
    const router = useRouter();
    const started = useRef(false);
    const undoLock = useRef(false);
    const [state, setState] = useState<ReviewQuestionState>({ busy: false, submitted: false, dirty: false });
    const [notice, setNotice] = useState<ReviewOutcome | null>(null);
    const [undoing, setUndoing] = useState(false);
    const [undoError, setUndoError] = useState(false);
    const [revisions, setRevisions] = useState<Record<string, number>>({});
    useEffect(() => {
        if (started.current) return;
        started.current = true;
        const query = new URLSearchParams(window.location.search);
        query.delete('autostart');
        router.replace(`/review/session${query.size ? `?${query}` : ''}`, { scroll: false });
        void session.start(initialSubjectId, initialMode);
    }, [router, session, initialSubjectId, initialMode]);
    useEffect(() => {
        if (!notice || undoing) return;
        const timer = window.setTimeout(() => setNotice(null), 5000);
        return () => window.clearTimeout(timer);
    }, [notice, undoing]);
    function complete(outcome: ReviewOutcome) {
        if (undoLock.current) return;
        session.complete(outcome);
        if (outcome.recordId) setNotice(outcome);
        setUndoError(false);
        window.scrollTo({ top: 0, behavior: 'instant' });
    }
    const close = useCallback(() => {
        sessionStorage.setItem('review-completed', String(session.completed));
        router.push('/review');
    }, [router, session.completed]);
    async function undo() {
        if (!notice?.recordId || undoLock.current || (session.current && state.busy)) return;
        undoLock.current = true;
        setUndoing(true);
        try {
            if (session.current && state.dirty && !await confirmDialog(t.review.discardAnswer, { destructive: true })) return;
            await apiClient.delete(`/api/review/undo?${new URLSearchParams({ recordId: notice.recordId })}`);
            session.undo(notice.id);
            setRevisions(previous => ({ ...previous, [notice.id]: (previous[notice.id] ?? 0) + 1 }));
            setNotice(null);
            setUndoError(false);
            window.scrollTo({ top: 0, behavior: 'instant' });
        } catch { setUndoError(true); }
        finally { undoLock.current = false; setUndoing(false); }
    }
    const remainingItems = session.items?.slice(session.completed) ?? [];
    const hasEstimates = remainingItems.every(entry => typeof entry.estimatedSec === 'number' && Number.isFinite(entry.estimatedSec) && entry.estimatedSec > 0);
    const remainingMinutes = hasEstimates && remainingItems.length
        ? Math.ceil(remainingItems.reduce((sum, entry) => sum + (entry.estimatedSec ?? 0), 0) / 60) : undefined;
    return <div className="review-session-layout space-y-4">
        {!session.items && <div className="space-y-4 py-6">
            {session.error ? <><p role="alert">{session.error}</p><Button onClick={() => session.start(initialSubjectId, initialMode)}>{t.review.retry}</Button></>
                : <p role="status">{t.common.loading}</p>}
            <Button asChild variant="ghost"><Link href="/review">{t.review.backHome}</Link></Button>
        </div>}
        {session.items?.length === 0 && <div className="space-y-4 py-6"><p>{t.review.empty}</p><Button asChild><Link href="/review">{t.review.backHome}</Link></Button></div>}
        {/* 已访问的题保持挂载，使撤销可恢复原判题界面；不加载尚未访问的题。 */}
        {session.items?.slice(0, session.completed + 1).map((item, index) => <div key={`${session.generation}:${item.id}`} data-review-question={item.id} hidden={session.current?.id !== item.id}>
            <ReviewQuestion item={item} index={index} total={session.total}
                remainingMinutes={remainingMinutes}
                active={session.current?.id === item.id}
                revision={revisions[item.id] ?? 0} disabled={undoing} onComplete={complete} onClose={close} onStateChange={setState} />
        </div>)}
        {session.error && !!session.items && <p role="alert">{session.error}</p>}
        {!!session.items?.length && !session.current && <ReviewSummary items={session.items} outcomes={session.outcomes} onExtra={() => { setNotice(null); setState({ busy: false, submitted: false, dirty: false }); void session.start(initialSubjectId, 'extra'); }} loading={session.loading} />}
        {notice && <div role="status" className="review-undo-notice fixed z-40 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 shadow-lg">
            <span>{notice.result === 'correct' ? t.review.recordedCorrect : t.review.recordedWrong}</span>
            <Button variant="link" aria-label={t.review.undoResult} className="min-h-11" disabled={undoing || (!!session.current && state.busy)} onClick={() => void undo()}>{t.review.undo}</Button>
            {undoError && <p role="alert" className="w-full text-sm text-destructive">{t.review.undoFailed}</p>}
        </div>}
    </div>;
}
