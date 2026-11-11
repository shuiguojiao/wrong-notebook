"use client";

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ReviewSession } from '@/components/review/review-session';

function ReviewSessionContent() {
    const params = useSearchParams();
    const mode = params.get('mode');
    return <ReviewSession initialMode={mode === 'extra' || mode === 'brave' ? mode : 'today'} initialSubjectId={params.get('subjectId') ?? ''} />;
}

export default function ReviewSessionPage() {
    return <main className="review-session-page mx-auto min-h-dvh w-full max-w-6xl px-4 py-[var(--review-page-inset)] [--review-page-inset:1rem] md:px-8 md:[--review-page-inset:1.5rem]">
        <Suspense><ReviewSessionContent /></Suspense>
    </main>;
}
