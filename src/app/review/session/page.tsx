"use client";

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ReviewSession } from '@/components/review/review-session';

function ReviewSessionContent() {
    const params = useSearchParams();
    return <ReviewSession initialSubjectId={params.get('subjectId') ?? ''} initialLimit={params.get('limit')} autostart={params.get('autostart') === '1'} />;
}

export default function ReviewSessionPage() {
    return <main className="mx-auto min-h-dvh w-full max-w-4xl px-4 py-4 pb-[max(2rem,env(safe-area-inset-bottom))] md:px-8 md:py-8">
        <Suspense><ReviewSessionContent /></Suspense>
    </main>;
}
