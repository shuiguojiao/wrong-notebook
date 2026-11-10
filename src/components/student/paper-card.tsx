import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface PaperCardProps extends HTMLAttributes<HTMLDivElement> {
    tape?: boolean;
    /** 仅装饰纸面旋转，自动限制在 ±1°，内容保持水平。 */
    rotation?: number;
    variant?: "paper" | "note";
}

export function PaperCard({ children, className, tape = false, rotation = 0, variant = "paper", ...props }: PaperCardProps) {
    const angle = Number.isFinite(rotation) ? Math.min(1, Math.max(-1, rotation)) : 0;
    return (
        <div className={cn("student-paper relative isolate min-w-0 rounded-xl border bg-card p-4 text-card-foreground shadow-xs sm:p-6", className)} data-paper={variant} {...props}>
            <div aria-hidden="true" className="student-paper-decoration" style={{ "--student-rotation": `${angle}deg` } as CSSProperties}>
                {tape && <span className="student-paper-tape" />}
            </div>
            <div className="relative min-w-0">{children}</div>
        </div>
    );
}
