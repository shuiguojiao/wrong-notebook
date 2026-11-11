"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PracticeSession } from "@/components/practice/practice-session";

export const dynamic = 'force-dynamic';

function PracticeContent() {
    const errorItemId = useSearchParams().get("id");
    const router = useRouter();
    useEffect(() => {
        if (!errorItemId) router.replace("/notebooks");
    }, [errorItemId, router]);
    if (!errorItemId) return null;
    // 切换原题时重建练习，避免沿用上一题的版本、答案和保存状态。
    return <PracticeSession key={errorItemId} errorItemId={errorItemId} />;
}

export default function PracticePage() {
    return (
        <main className="min-h-screen px-4 py-6 md:px-8 md:py-8">
            <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
                <PracticeContent />
            </Suspense>
        </main>
    );
}
