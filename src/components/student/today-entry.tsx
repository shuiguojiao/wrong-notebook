"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Camera, FileUp, Images, PenLine } from "lucide-react";
import { ImportWorkspace } from "@/components/question-entry/import-workspace";
import type { EntryMode } from "@/components/question-entry/entry-panels";
import { Button } from "@/components/ui/button";
import { MoreMenu } from "@/components/ui/more-menu";
import { useLanguage } from "@/contexts/LanguageContext";

interface TodayEntryProps {
    notebookId?: string;
    notebookName?: string;
    photoEntry?: boolean;
}

/** 展开后保留工作区实例，切换入口沿用原草稿、上传队列与确认流程。 */
export function TodayEntry({ notebookId, notebookName, photoEntry = false }: TodayEntryProps) {
    const { t } = useLanguage();
    const [mode, setMode] = useState<EntryMode | null>(photoEntry ? "image" : null);
    const [source, setSource] = useState<"camera" | "album">("camera");
    const panelRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const focus = () => {
            setMode("image");
            setSource("camera");
        };
        if (photoEntry) focus();
        window.addEventListener("focus-photo-entry", focus);
        return () => window.removeEventListener("focus-photo-entry", focus);
    }, [photoEntry]);
    useEffect(() => {
        if (mode) {
            panelRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
            panelRef.current?.focus({ preventScroll: true });
        }
    }, [mode, source]);
    return <section className="space-y-3" aria-label={t.student.newQuestion}>
        <h2 className="text-base">{t.student.newQuestion}</h2>
        <div className="grid grid-cols-3 gap-2" data-testid="today-entry-actions">
            <Button variant="outline" className="min-h-12" aria-expanded={mode === "image" && source === "camera"} aria-controls="today-entry-panel" onClick={() => { setSource("camera"); setMode("image"); }}><Camera aria-hidden="true" />{t.upload.camera}</Button>
            <Button variant="outline" className="min-h-12" aria-expanded={mode === "image" && source === "album"} aria-controls="today-entry-panel" onClick={() => { setSource("album"); setMode("image"); }}><Images aria-hidden="true" />{t.upload.album}</Button>
            <MoreMenu showLabel variant="student" className="min-h-12 w-full border bg-card" items={[
                { label: t.entry.text, icon: PenLine, onClick: () => setMode("text") },
                { label: t.entry.files, icon: FileUp, onClick: () => setMode("file") },
                { label: t.entry.agent, icon: Bot, onClick: () => setMode("agent") },
            ]} />
        </div>
        {mode && <div ref={panelRef} id="today-entry-panel" tabIndex={-1} className="scroll-mt-4 space-y-3" aria-label={mode === "image" ? t.upload[source] : t.entry[mode === "file" ? "files" : mode]}>
            {notebookName && <p className="text-sm text-muted-foreground">{t.home.targetNotebook.replace("{name}", notebookName)}</p>}
            <ImportWorkspace notebookId={notebookId} notebookName={notebookName} photoEntry={photoEntry} entryMode={mode} onEntryModeChange={setMode} />
        </div>}
    </section>;
}
