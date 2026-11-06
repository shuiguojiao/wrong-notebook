"use client";

import { useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Camera, FileUp, PenLine } from "lucide-react";
import { DirectTextEditor } from "@/components/direct-text-editor";
import { FileImportPanel } from "@/components/file-import/file-import-panel";
import { AlbumChoice, AlbumResultsLink } from "@/components/question-entry/album-choice";
import { QuestionPartsBar } from "@/components/question-parts-bar";
import { TextInputZone } from "@/components/text-input-zone";
import { UploadZone } from "@/components/upload-zone";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PageLoading } from "@/components/ui/page-loading";
import { useLanguage } from "@/contexts/LanguageContext";
import { entryDraftKey } from "@/lib/import/entry-draft-store";
import type { useQuestionImport } from "@/lib/hooks/use-question-import";

interface EntryPanelsProps {
    flow: ReturnType<typeof useQuestionImport>;
    notebookId?: string;
    notebookName?: string;
    active?: boolean;
}

/** 保留文字与文件面板，切换入口不卸载草稿；图片粘贴监听只在图片入口启用。 */
export function EntryPanels({ flow, notebookId, notebookName, active = true }: EntryPanelsProps) {
    const { t } = useLanguage();
    const { data: session } = useSession();
    const [mode, setMode] = useState<"image" | "text" | "file">("image");
    const [textMode, setTextMode] = useState<"ai" | "direct">("ai");
    const [directVisited, setDirectVisited] = useState(false);
    const textRef = useRef<{ importFile: (file: File) => Promise<void> }>(null);
    const fileRef = useRef<{ importFile: (file: File) => Promise<void> }>(null);
    const draftKey = session?.user?.id ? entryDraftKey(session.user.id, notebookId || "home") : undefined;
    const importBankFile = (file: File) => { setMode("file"); void fileRef.current?.importFile(file); };
    const importTextFile = (file: File) => { setMode("text"); setTextMode("ai"); void textRef.current?.importFile(file); };

    // 会话确定后才允许输入，避免从匿名临时状态切换到账号草稿时覆盖刚输入的内容。
    if (!session?.user?.id) return <PageLoading />;

    return (
        <div className="space-y-4">
            <SegmentedControl value={mode} onChange={setMode} options={[
                { value: "image", icon: Camera, label: t.entry.images },
                { value: "text", icon: PenLine, label: t.entry.text },
                { value: "file", icon: FileUp, label: t.entry.files },
            ]} />
            {active && mode === "image" && (
                <>
                    {flow.parts.length > 0 && <QuestionPartsBar parts={flow.parts.map((part) => part.dataUrl)} busy={flow.isBusy} onFinish={() => void flow.finishParts()} onDiscard={flow.discardParts} />}
                    <UploadZone onImageSelect={flow.selectImage} onImagesSelect={flow.selectImages} submittedCount={flow.submittedCount} canContinueCamera={flow.canContinueCamera} isAnalyzing={flow.isBusy} />
                    {flow.submittedCount > 0 && <AlbumResultsLink />}
                </>
            )}
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
