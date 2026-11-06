"use client";

import { useState } from "react";
import type { KeyboardEventHandler } from "react";
import { Eye, Edit3 } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";

interface DirectEntryFieldProps {
    id: string;
    label: string;
    value: string;
    placeholder: string;
    required?: boolean;
    disabled: boolean;
    onChange: (value: string) => void;
    onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
}

export function DirectEntryField({ id, label, value, placeholder, required, disabled, onChange, onKeyDown }: DirectEntryFieldProps) {
    const { t } = useLanguage();
    const [preview, setPreview] = useState(false);
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <Label htmlFor={id}>{label}{required && " *"}</Label>
                <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setPreview(!preview)} disabled={!value}>
                    {preview ? <Edit3 className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
                    {preview ? t.directEntry.edit : t.directEntry.preview}
                </Button>
            </div>
            {preview ? <div className="min-h-28 rounded-md border bg-muted/30 p-4"><MarkdownRenderer content={value} /></div> : (
                <Textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} onKeyDown={onKeyDown} disabled={disabled} className="min-h-28 resize-y text-base" />
            )}
        </div>
    );
}
