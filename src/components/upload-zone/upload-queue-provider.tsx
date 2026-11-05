"use client";

import type { ReactNode } from "react";
import { UploadQueueContext, useUploadQueueLifecycle } from "@/lib/hooks/use-upload-queue";

interface UploadQueueProviderProps { children: ReactNode }

export function UploadQueueProvider({ children }: UploadQueueProviderProps) {
    const queue = useUploadQueueLifecycle();
    return <UploadQueueContext.Provider value={queue}>{children}</UploadQueueContext.Provider>;
}
