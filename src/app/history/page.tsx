import { Suspense } from 'react';
import { HistoryPage } from '@/components/history/history-page';
import { HistorySkeleton } from '@/components/history/history-detail';

export default function Page() {
    return <Suspense fallback={<HistorySkeleton />}><HistoryPage /></Suspense>;
}
