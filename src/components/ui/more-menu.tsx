"use client";

import { Fragment } from "react";
import { Ellipsis } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

export interface MoreMenuItem {
    label: string;
    icon?: LucideIcon;
    onClick: () => void;
    destructive?: boolean;
    /** 在此项前显示分隔线，首项忽略。 */
    separatorBefore?: boolean;
}

interface MoreMenuProps {
    items: readonly MoreMenuItem[];
    className?: string;
    variant?: "default" | "student";
}

export function MoreMenu({ items, className, variant = "default" }: MoreMenuProps) {
    const { t } = useLanguage();
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className={cn("size-11", className)} aria-label={t.common.more}>
                    <Ellipsis className="size-5" aria-hidden="true" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={variant === "student" ? "student-menu" : undefined}>
                {items.map(({ label, icon: Icon, onClick, destructive, separatorBefore }, index) => (
                    <Fragment key={`${index}-${label}`}>
                        {index > 0 && separatorBefore && <DropdownMenuSeparator />}
                        <DropdownMenuItem
                            onSelect={onClick}
                            className={cn("min-h-11 gap-2", destructive && "text-destructive focus:bg-destructive/10 focus:text-destructive")}
                        >
                            {Icon && <Icon className="size-4" aria-hidden="true" />}
                            {label}
                        </DropdownMenuItem>
                    </Fragment>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
