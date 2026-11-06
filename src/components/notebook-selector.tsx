"use client";

import { useEffect, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { CreateNotebookDialog } from "@/components/create-notebook-dialog";
import type { CreateNotebookInput } from "@/components/create-notebook-dialog";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/error-message";
import { toast } from "@/lib/feedback";
import { frontendLogger } from "@/lib/frontend-logger";
import type { Notebook } from "@/types/api";
import { useLanguage } from "@/contexts/LanguageContext";

interface NotebookSelectorProps {
    value?: string;
    onChange: (value: string) => void;
    className?: string;
    allowCreate?: boolean;
}

export function NotebookSelector({ value, onChange, className, allowCreate = false }: NotebookSelectorProps) {
    const [notebooks, setNotebooks] = useState<Notebook[]>([]);
    const [open, setOpen] = useState(false);
    const [failed, setFailed] = useState(false);
    const [reload, setReload] = useState(0);
    const { t } = useLanguage();

    useEffect(() => {
        const fetchNotebooks = async () => {
            try {
                const data = await apiClient.get<Notebook[]>("/api/notebooks");
                setNotebooks(data);
                setFailed(false);
            } catch (error) {
                setFailed(true);
                frontendLogger.error('[NotebookSelector]', 'Failed to fetch notebooks', { error });
            }
        };

        fetchNotebooks();
    }, [reload]);

    useEffect(() => {
        if (allowCreate && !value && notebooks.length === 1) onChange(notebooks[0].id);
    }, [allowCreate, value, notebooks, onChange]);

    const create = async (input: CreateNotebookInput) => {
        try {
            const notebook = await apiClient.post<Notebook>("/api/notebooks", input);
            setNotebooks((current) => [...current, notebook]);
            onChange(notebook.id);
        } catch (error) {
            toast.error(getApiErrorMessage(error) || t.notebooks.createError);
            throw error;
        }
    };

    return (
        <div className="space-y-2">
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className={className}>
                <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder={t.notebooks?.selector?.placeholder || "Select Notebook"} />
                </div>
            </SelectTrigger>
            <SelectContent>
                {notebooks.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                        {t.notebooks?.selector?.empty || "No notebooks available"}
                    </div>
                ) : (
                    notebooks.map((notebook) => (
                        <SelectItem key={notebook.id} value={notebook.id}>
                            {notebook.name}
                        </SelectItem>
                    ))
                )}
            </SelectContent>
        </Select>
        {failed && <p role="alert" className="text-sm text-destructive">{t.entry.loadNotebooksFailed}<Button type="button" variant="link" onClick={() => setReload((current) => current + 1)}>{t.importTasks.retry}</Button></p>}
        {allowCreate && <Button type="button" variant="ghost" className="min-h-11" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />{t.notebooks.dialog.title}</Button>}
        {allowCreate && <CreateNotebookDialog open={open} onOpenChange={setOpen} onCreate={create} />}
        </div>
    );
}
