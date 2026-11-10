"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Bot, Camera, FileUp, PenLine } from "lucide-react";
import { DirectTextEditor } from "@/components/direct-text-editor";
import { FileImportPanel } from "@/components/file-import/file-import-panel";
import { AlbumChoice, AlbumResultsLink } from "@/components/question-entry/album-choice";
import { AgentGuide } from "@/components/question-entry/agent/agent-guide";
import { QuestionPartsBar } from "@/components/question-parts-bar";
import { TextInputZone } from "@/components/text-input-zone";
import { UploadZone } from "@/components/upload-zone";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PageLoading } from "@/components/ui/page-loading";
import { useLanguage } from "@/contexts/LanguageContext";
import { entryDraftKey } from "@/lib/import/entry-draft-store";
import type { useQuestionImport } from "@/lib/hooks/use-question-import";

export type EntryMode = "image" | "text" | "file" | "agent";

interface EntryPanelsProps {
    entryMode?: EntryMode;
    onEntryModeChange?: (mode: EntryMode) => void;
    flow: ReturnType<typeof useQuestionImport>;
    notebookId?: string;
    notebookName?: string;
    active?: boolean;
    photoEntry?: boolean;
}

/** 保留文字与文件面板，切换入口不卸载草稿；图片粘贴监听只在图片入口启用。 */
export function EntryPanels({ flow, notebookId, notebookName, active = true, photoEntry = false, entryMode, onEntryModeChange }: EntryPanelsProps) {
    const { t } = useLanguage();
    const { data: session } = useSession();
    const [localMode, setLocalMode] = useState<EntryMode>("image");
    const mode = entryMode ?? localMode;
    const setMode = onEntryModeChange ?? setLocalMode;
    const [textMode, setTextMode] = useState<"ai" | "direct">("ai");
    const [directVisited, setDirectVisited] = useState(false);
    const textRef = useRef<{ importFile: (file: File) => Promise<void> }>(null);
    const fileRef = useRef<{ importFile: (file: File) => Promise<void> }>(null);
    const draftKey = session?.user?.id ? entryDraftKey(session.user.id, notebookId || "home") : undefined;
    const importBankFile = (file: File) => { setMode("file"); void fileRef.current?.importFile(file); };
    const importTextFile = (file: File) => { setMode("text"); setTextMode("ai"); void textRef.current?.importFile(file); };

    const selectPhoto = useEffectEvent(() => setMode("image"));
    const entryRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!session?.user?.id || !active) return;
        const focusPhoto = () => {
            selectPhoto();
            entryRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
            entryRef.current?.focus({ preventScroll: true });
        };
        // 聚焦录入面板，不自动打开系统文件选择器，以保留浏览器手势限制。
        const timer = photoEntry ? window.setTimeout(focusPhoto, 0) : undefined;
        window.addEventListener("focus-photo-entry", focusPhoto);
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener("focus-photo-entry", focusPhoto);
        };
    }, [photoEntry, session?.user?.id, active]);

    // 会话确定后才允许输入，避免从匿名临时状态切换到账号草稿时覆盖刚输入的内容。
    if (!session?.user?.id) return <PageLoading />;

    return (
        <div ref={entryRef} id="question-entry" tabIndex={-1} aria-label={t.entry.images} className="scroll-mt-4 space-y-4">
            <SegmentedControl value={mode} onChange={setMode} options={[
                { value: "image", icon: Camera, label: t.entry.images },
                { value: "text", icon: PenLine, label: t.entry.text },
                { value: "file", icon: FileUp, label: t.entry.files },
                { value: "agent", icon: Bot, label: t.entry.agent },
            ]} />
            {active && mode === "image" && (
                <>
                    {flow.parts.length > 0 && <QuestionPartsBar parts={flow.parts.map((part) => part.dataUrl)} busy={flow.isBusy} onFinish={() => void flow.finishParts()} onDiscard={flow.discardParts} />}
                    <UploadZone onImageSelect={flow.selectImage} onImagesSelect={flow.selectImages} submittedCount={flow.submittedCount} canContinueCamera={flow.canContinueCamera} isAnalyzing={flow.isBusy} />
                    {flow.submittedCount > 0 && <AlbumResultsLink />}
                </>
            )}
            {active && mode === "agent" && <AgentGuide notebookName={notebookName} />}
            <AlbumChoice count={flow.pendingAlbum.length} onChoose={flow.submitAlbum} onCancel={flow.cancelAlbum} />
            <div hidden={mode !== "text"} data-entry-panel="text" className="space-y-4">
                <SegmentedControl value={textMode} onChange={(next) => { setTextMode(next); if (next === "direct") setDirectVisited(true); }} options={[
                    { value: "ai", label: t.entry.solve },
                    { value: "direct", label: t.entry.haveAnswer },
                ]} />
                <p className="text-xs text-muted-foreground">{t.entry.draftHint}</p>
                <div hidden={textMode !== "ai"}>
                    <TextInputZone ref={textRef} draftKey={draftKey && `${draftKey}:text`} onSubmit={flow.submitText} isAnalyzing={flow.isBusy} defaultNotebookName={notebookName} onCreateBatch={flow.createTextBatch} creatingBatch={flow.creatingBatch} onSwitchToFileImport={importBankFile} />
                </div>
                <div hidden={textMode !== "direct"}>
                    {directVisited && <DirectTextEditor draftKey={draftKey && `${draftKey}:direct`} defaultNotebookId={notebookId} defaultNotebookName={notebookName} isSaving={flow.analysisStep === "saving"} onSubmit={async (data) => {
                        flow.setAnalysisStep("saving");
                        try { return await flow.saveQuestion({ ...data, originalImageUrl: "" }); }
                        finally { flow.setAnalysisStep("idle"); }
                    }} />}
                </div>
            </div>
            <div hidden={mode !== "file"} data-entry-panel="file">
                <FileImportPanel ref={fileRef} defaultNotebookId={notebookId} onTextFile={importTextFile} />
            </div>
        </div>
    );
}
