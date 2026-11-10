"use client";

import { BatchImportPanel } from "@/components/batch-import-panel";
import { CorrectionEditor } from "@/components/correction-editor";
import { ImageCropper } from "@/components/image-cropper";
import { ImportResultBanner } from "@/components/import-result-banner";
import { PendingImportTask } from "@/components/import-tasks/pending-import-task";
import type { EntryMode } from "@/components/question-entry/entry-panels";
import { EntryPanels } from "@/components/question-entry/entry-panels";
import { QuestionSaveError } from "@/components/question-save-error";
import { ProgressFeedback } from "@/components/ui/progress-feedback";
import { MAX_QUESTION_PARTS, useQuestionImport } from "@/lib/hooks/use-question-import";

interface ImportWorkspaceProps {
    entryMode?: EntryMode;
    onEntryModeChange?: (mode: EntryMode) => void;
    notebookId?: string;
    notebookName?: string;
    fixedNotebook?: boolean;
    photoEntry?: boolean;
}

/** 首页和错题本内共用同一录入流程。 */
export function ImportWorkspace({ notebookId, notebookName, fixedNotebook, photoEntry, entryMode, onEntryModeChange }: ImportWorkspaceProps) {
    const flow = useQuestionImport({
        logPrefix: "[QuestionEntry]",
        analyzeSubjectId: notebookId,
        importSubjectId: notebookId,
        fixedSubjectId: fixedNotebook ? notebookId : undefined,
        textNotebook: notebookId ? { id: notebookId, name: notebookName || "" } : undefined,
    });
    return (
        <>
            <ProgressFeedback status={flow.analysisStep} completed={flow.completedStages} />
            <QuestionSaveError message={flow.saveError} onDismiss={flow.dismissSaveError} />
            <div hidden={flow.step !== "upload"} className="space-y-4">
                {flow.pendingTask && <PendingImportTask task={flow.pendingTask} onRefresh={flow.refreshPendingTask} onDismiss={flow.dismissPendingTask} />}
                {flow.lastImported && <ImportResultBanner imported={flow.lastImported} onDismiss={flow.dismissImported} />}
                {flow.batchImages && <BatchImportPanel images={flow.batchImages} subjectId={notebookId} onClose={flow.closeBatch} />}
                <div hidden={!!flow.batchImages}>
                    <EntryPanels entryMode={entryMode} onEntryModeChange={onEntryModeChange} photoEntry={photoEntry} flow={flow} notebookId={notebookId} notebookName={notebookName} active={flow.step === "upload" && !flow.batchImages} />
                </div>
            </div>
            {flow.croppingImage && <ImageCropper imageSrc={flow.croppingImage} open={flow.isCropperOpen} onClose={flow.closeCropper} onRegionsSelected={flow.cropRegions} allowMulti={flow.parts.length === 0} onAutoSplit={flow.parts.length === 0 ? flow.autoSplitImage : undefined} onAddPart={flow.parts.length < MAX_QUESTION_PARTS - 1 ? flow.addPart : undefined} partCount={flow.parts.length} />}
            {flow.step === "review" && flow.parsedData && <CorrectionEditor initialData={flow.parsedData} onSave={flow.saveReviewed} onCancel={flow.cancelReview} imagePreview={flow.currentImage} initialSubjectId={notebookId} aiTimeout={flow.aiTimeout} />}
        </>
    );
}
