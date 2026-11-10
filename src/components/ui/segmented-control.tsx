"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
    value: T;
    label: ReactNode;
    icon?: LucideIcon;
    id?: string;
    panelId?: string;
}

interface SegmentedControlProps<T extends string> {
    options: readonly SegmentedOption<T>[];
    value: T;
    onChange: (value: T) => void;
    className?: string;
    size?: "compact" | "full";
    variant?: "default" | "student";
    "aria-label"?: string;
    "aria-labelledby"?: string;
}

/** 分段切换控件：等宽排列的选项，选中项浮起高亮 */
export function SegmentedControl<T extends string>({ options, value, onChange, className, size = "full", variant = "default", ...ariaProps }: SegmentedControlProps<T>) {
    if (!options.length) return null;
    const focusValue = options.some(option => option.value === value) ? value : options[0].value;
    return (
        <div
            className={cn("grid gap-1 rounded-xl bg-muted p-1", size === "compact" && "w-fit max-w-full", variant === "student" && "student-segmented", className)}
            style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
            role="tablist"
            {...ariaProps}
        >
            {options.map(({ value: optionValue, label, icon: Icon, id, panelId }) => {
                const active = optionValue === value;
                return (
                    <button
                        key={optionValue}
                        type="button"
                        role="tab"
                        id={id}
                        aria-controls={panelId}
                        aria-selected={active}
                        tabIndex={optionValue === focusValue ? 0 : -1}
                        className={cn(
                            "flex min-w-11 items-center justify-center gap-1.5 rounded-lg min-h-11 px-2 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                            size === "compact" && "px-3 py-1.5",
                            active ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                        )}
                        onClick={() => onChange(optionValue)}
                        onKeyDown={(event) => {
                            const index = options.findIndex((option) => option.value === optionValue);
                            const next = event.key === "ArrowRight" ? (index + 1) % options.length
                                : event.key === "ArrowLeft" ? (index - 1 + options.length) % options.length
                                : event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : null;
                            if (next === null) return;
                            event.preventDefault();
                            onChange(options[next].value);
                            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
                        }}
                    >
                        {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
                        <span className="whitespace-normal text-center leading-snug">{label}</span>
                    </button>
                );
            })}
        </div>
    );
}
