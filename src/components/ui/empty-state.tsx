import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
    icon: LucideIcon;
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    className?: string;
    variant?: "default" | "student";
}

/** 列表为空时的占位：图标 + 说明 + 引导操作 */
export function EmptyState({ icon: Icon, title, description, action, className, variant = "default" }: EmptyStateProps) {
    return (
        <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 px-6 py-14 text-center", variant === "student" && "student-empty", className)}>
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                <Icon className="h-7 w-7" aria-hidden="true" />
            </div>
            <p className="font-medium">{title}</p>
            {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}
