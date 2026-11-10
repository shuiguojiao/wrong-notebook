"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

/** 空态和异常页内的固定出口，不依赖浏览器历史或全局导航。 */
export function PageExits() {
    const { t } = useLanguage();
    return (
        <div className="flex flex-wrap justify-center gap-2">
            <Button asChild variant="outline" className="min-h-11"><Link href="/">{t.student.backToToday}</Link></Button>
            <Button asChild variant="outline" className="min-h-11"><Link href="/notebooks">{t.student.goToNotebooks}</Link></Button>
        </div>
    );
}
