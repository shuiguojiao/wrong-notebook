import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
    value: T;
    label: React.ReactNode;
    icon?: LucideIcon;
}

interface SegmentedControlProps<T extends string> {
    options: SegmentedOption<T>[];
    value: T;
    onChange: (value: T) => void;
    className?: string;
}

/** 分段切换控件：等宽排列的选项，选中项浮起高亮 */
export function SegmentedControl<T extends string>({ options, value, onChange, className }: SegmentedControlProps<T>) {
    return (
        <div
            className={cn("grid gap-1 rounded-xl bg-muted p-1", className)}
            style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
            role="tablist"
        >
            {options.map(({ value: optionValue, label, icon: Icon }) => {
                const active = optionValue === value;
                return (
                    <button
                        key={optionValue}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        tabIndex={active ? 0 : -1}
                        className={cn(
                            "flex items-center justify-center gap-1.5 rounded-lg min-h-11 px-2 py-2.5 text-sm font-medium transition-all",
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
                        {Icon && <Icon className="h-4 w-4 shrink-0" />}
                        <span className="whitespace-normal text-center leading-snug">{label}</span>
                    </button>
                );
            })}
        </div>
    );
}
