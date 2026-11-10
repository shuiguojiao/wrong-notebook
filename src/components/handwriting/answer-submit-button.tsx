"use client";

import { Button } from '@/components/ui/button';
import type { useInkGuard } from '@/lib/hooks/use-ink-guard';

interface AnswerSubmitButtonProps {
    guard: ReturnType<typeof useInkGuard>;
    onSubmit: () => void;
    disabled: boolean;
    label: string;
    mobile?: boolean;
}

export function AnswerSubmitButton({ guard, onSubmit, disabled, label, mobile = false }: AnswerSubmitButtonProps) {
    return <Button type="button" disabled={disabled} className={mobile ? 'min-h-11 w-full' : 'min-h-11 shrink-0'}
        onPointerDown={guard.onPointerDown} onClick={event => {
            guard.onClick(event);
            if (!event.defaultPrevented) onSubmit();
        }}>{label}</Button>;
}
