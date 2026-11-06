"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";

interface AlbumChoiceProps {
    count: number;
    onChoose: (mode: "single" | "pages") => Promise<void>;
    onCancel: () => void;
}

export function AlbumChoice({ count, onChoose, onCancel }: AlbumChoiceProps) {
    const { t } = useLanguage();
    return (
        <Dialog open={count > 0} onOpenChange={(open) => { if (!open) onCancel(); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t.entry.albumTitle.replace("{count}", String(count))}</DialogTitle>
                    <DialogDescription>{t.entry.albumHint}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3">
                    <Button className="min-h-12" onClick={() => void onChoose("single")}>{t.entry.albumSingle}</Button>
                    <Button className="min-h-12" variant="outline" onClick={() => void onChoose("pages")}>{t.entry.albumPages}</Button>
                    <Button variant="ghost" onClick={onCancel}>{t.common.cancel}</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export function AlbumResultsLink() {
    const { t } = useLanguage();
    return <Link className="inline-flex min-h-11 items-center text-sm text-primary underline" href="/import-tasks">{t.entry.albumResults}</Link>;
}
