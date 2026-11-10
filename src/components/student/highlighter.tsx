import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface HighlighterProps extends HTMLAttributes<HTMLElement> {
    color?: "yellow" | "green";
}

export function Highlighter({ color = "yellow", children, className, ...props }: HighlighterProps) {
    return <mark className={cn("student-highlighter rounded-sm bg-muted px-0.5 text-foreground", className)} data-highlight={color} {...props}>{children}</mark>;
}
