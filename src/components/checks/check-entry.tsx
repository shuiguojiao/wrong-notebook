"use client";

import { useRouter } from "next/navigation";
import { ReviewNeedsAttention } from "@/components/review/review-needs-attention";
import { usePendingChecks } from "@/lib/hooks/use-pending-checks";

interface CheckEntryProps { count?: number; compact?: boolean }

export function CheckEntry({ count, compact }: CheckEntryProps) {
    return count === undefined ? <PendingCheckEntry /> : <CheckLink count={count} compact={compact} />;
}

function PendingCheckEntry() {
    const data = usePendingChecks();
    return <CheckLink count={data?.total ?? 0} />;
}

function CheckLink({ count = 0, compact }: CheckEntryProps) {
    const router = useRouter();
    return <ReviewNeedsAttention compact={compact} count={count} onOpen={() => router.push("/checks")} />;
}
