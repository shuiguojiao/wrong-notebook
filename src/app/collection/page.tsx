"use client";

import { Suspense } from 'react';
import { CollectionPage } from '@/components/student/collection-page';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePageTitle } from '@/lib/page-title';

export default function Collection() {
    const { t } = useLanguage();
    usePageTitle(t.nav.collection);
    return <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8 md:py-8">
        <h1 className="font-title text-3xl">{t.nav.collection}</h1>
        <Suspense fallback={null}><CollectionPage /></Suspense>
    </main>;
}
