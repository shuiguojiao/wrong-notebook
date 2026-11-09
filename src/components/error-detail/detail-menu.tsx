"use client";

import { useState } from "react";
import { FixLatexButton } from "@/components/fix-latex-button";
import { RegenerateAnswerButton } from "@/components/regenerate-answer-button";
import { RegenerateFigureButton } from "@/components/regenerate-figure-button";
import { ReplaceQuestionImageButton } from "@/components/replace-question-image-button";
import { RetagItemButton } from "@/components/retag-item-button";
import { SvgAnimationExplainer } from "@/components/svg-animation-explainer";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MoreMenu } from "@/components/ui/more-menu";
import { useLanguage } from "@/contexts/LanguageContext";
import { confirmDialog, toast } from "@/lib/feedback";
import { apiClient } from "@/lib/api-client";
import { frontendLogger } from "@/lib/frontend-logger";
import { countLatexIssues, findLatexIssuesByField } from "@/lib/latex-check";
import { GeogebraSection } from "./geogebra-section";
import { ProblemReportDialog } from "./problem-report-dialog";
import type { MoreMenuItem } from "@/components/ui/more-menu";
import type { ErrorItemDetail, UpdateErrorItem } from "./types";

interface DetailMenuProps {
    item: ErrorItemDetail;
    onEdit: () => void;
    onUpdate: UpdateErrorItem;
    reload: () => Promise<void>;
    onDeleted: () => void;
    svgEnabled: boolean;
    geogebraEnabled: boolean;
}
type Tool = "image" | "figure" | "answer" | "latex" | "tags" | "svg" | "geogebra";

/** 菜单打开已有工具面板，保留确认、任务恢复与错误提示。 */
export function DetailMenu({ item, onEdit, onUpdate, reload, onDeleted, svgEnabled, geogebraEnabled }: DetailMenuProps) {
    const { t, language } = useLanguage();
    const [tool, setTool] = useState<Tool | null>(null);
    const [reportOpen, setReportOpen] = useState(false);
    const labels: Record<Tool, string> = {
        image: t.replaceImage.replace,
        figure: t.figure.regenerate,
        answer: t.reanswerItem.button,
        latex: t.fixLatex.button,
        tags: t.detail.retagKnowledge,
        svg: t.svgAnimation.generate,
        geogebra: t.geogebra.title,
    };
    const openTool = (key: Tool): MoreMenuItem => ({ label: labels[key], onClick: () => setTool(key) });
    const copyId = async () => {
        const value = item.shortId || item.id;
        try { await navigator.clipboard.writeText(value); toast.success(t.shortId.copied); }
        catch { window.prompt(t.shortId.copy, value); }
    };
    const remove = async () => {
        if (!await confirmDialog(t.common.messages.confirmDelete, { destructive: true })) return;
        try {
            await apiClient.delete(`/api/error-items/${item.id}/delete`);
            toast.success(t.common.messages.deleteSuccess);
            onDeleted();
        } catch (error) {
            frontendLogger.error('[ErrorDetail]', '删除错题失败', { error });
            toast.error(t.common.messages.deleteFailed);
        }
    };
    const items: MoreMenuItem[] = [
        { label: t.common.edit, onClick: onEdit },
        openTool("image"), openTool("figure"), openTool("answer"), openTool("latex"), openTool("tags"),
        ...(svgEnabled ? [openTool("svg")] : []),
        ...(geogebraEnabled ? [openTool("geogebra")] : []),
        { label: t.shortId.copy, onClick: () => void copyId() },
        { label: t.problemReports.title, onClick: () => setReportOpen(true) },
        { label: t.detail.delete, destructive: true, separatorBefore: true, onClick: () => void remove() },
    ];
    return <>
        <MoreMenu items={items} />
        <ProblemReportDialog errorItemId={item.id} open={reportOpen} onOpenChange={setReportOpen} />
        <Dialog open={tool !== null} onOpenChange={open => { if (!open) setTool(null); }}>
            <DialogContent aria-describedby={undefined} className="max-h-[85dvh] overflow-y-auto">
                <DialogTitle>{tool ? labels[tool] : t.common.more}</DialogTitle>
                {tool === "image" && <ReplaceQuestionImageButton
                    errorItemId={item.id} hasImage={!!item.originalImageUrl}
                    onDone={originalImageUrl => { onUpdate({ originalImageUrl }); setTool(null); }}
                />}
                {tool === "figure" && <RegenerateFigureButton errorItemId={item.id} onDone={onUpdate} />}
                {tool === "answer" && <RegenerateAnswerButton errorItemId={item.id} onReload={reload}
                    onDone={updated => onUpdate({ answerText: updated.answerText ?? "", analysis: updated.analysis ?? "" })}
                />}
                {tool === "latex" && <>
                    <FixLatexButton errorItemId={item.id} fields={item} onDone={onUpdate} onReload={reload} />
                    {countLatexIssues(findLatexIssuesByField(item)) === 0 && <p className="text-sm text-muted-foreground">{t.fixLatex.noIssues}</p>}
                </>}
                {tool === "tags" && <RetagItemButton errorItemId={item.id} onDone={() => void reload()} onReload={() => void reload()} />}
                {tool === "svg" && <SvgAnimationExplainer key={language} errorItemId={item.id}
                    svgAnimation={language === "en" ? item.svgAnimationEn : item.svgAnimation}
                    hasOtherLanguage={!!(language === "en" ? item.svgAnimation : item.svgAnimationEn)}
                    onChange={(lang, value) => onUpdate({ [lang === "en" ? "svgAnimationEn" : "svgAnimation"]: value })}
                />}
                {tool === "geogebra" && <GeogebraSection errorItemId={item.id} commands={item.geogebraCommands} onUpdate={onUpdate} />}
            </DialogContent>
        </Dialog>
    </>;
}
