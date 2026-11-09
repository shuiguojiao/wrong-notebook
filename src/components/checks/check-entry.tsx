"use client";

import { useRouter } from "next/navigation";
import { ReviewNeedsAttention } from "@/components/review/review-needs-attention";
import { usePendingChecks } from "@/lib/hooks/use-pending-checks";

export function CheckEntry() {
    const router = useRouter();
    const data = usePendingChecks();
    return <ReviewNeedsAttention count={data?.total ?? 0} onOpen={() => router.push("/checks")} />;
}
