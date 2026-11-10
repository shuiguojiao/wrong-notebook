"use client";

import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

interface SubmitUndoNoticeProps { onUndo: () => void }

/** 提交撤回与自评保存后的撤销提示分开，位置随当前操作栏避让。 */
export function SubmitUndoNotice({ onUndo }: SubmitUndoNoticeProps) {
    const { t } = useLanguage();
    return <div className="submit-undo-notice" role="status">
        <Button variant="outline" className="min-h-11 bg-background shadow-lg" onClick={onUndo}>{t.review.undoSubmit}</Button>
    </div>;
}
