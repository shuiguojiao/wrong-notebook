"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { BarChart3, Bot, FileText, ListTodo, LogOut, ScanText, Settings, Shield } from "lucide-react";
import { SettingsDialog } from "@/components/settings-dialog";
import { UiStyleSetting } from "@/components/settings/ui-style-setting";
import { TaskPanel } from "@/components/tasks/task-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { clearEntryDrafts } from "@/lib/import/entry-draft-store";
import { useUploadQueue } from "@/lib/hooks/use-upload-queue";
import { usePageTitle } from "@/lib/page-title";

export default function MePage() {
    const { t } = useLanguage();
    usePageTitle(t.nav.me);
    const { data: session } = useSession();
    const { queue } = useUploadQueue();
    const [tasksOpen, setTasksOpen] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const rowClass = "min-h-12 w-full justify-start gap-3 rounded-none";
    const learningLinks = [
        { href: "/stats", label: t.student.learningStats, icon: BarChart3 },
        { href: "/exams", label: t.nav.exams, icon: FileText },
        { href: "/import-tasks", label: t.importTasks.entry, icon: ScanText },
    ];
    return <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-8">
        <h1 className="font-title text-3xl">{t.nav.me}</h1>
        <p className="break-words text-muted-foreground">{session?.user?.name || session?.user?.email}</p>
        <section aria-labelledby="me-learning" className="overflow-hidden rounded-lg border bg-card">
            <h2 id="me-learning" className="border-b px-4 py-3 font-semibold">{t.student.learning}</h2>
            <div className="divide-y">
                {learningLinks.map(({ href, label, icon: Icon }) => <Button key={href} asChild variant="ghost" className={rowClass}><Link href={href}><Icon className="size-5" aria-hidden="true" />{label}</Link></Button>)}
                <Button variant="ghost" className={rowClass} onClick={() => setTasksOpen(true)}><ListTodo className="size-5" aria-hidden="true" />{t.backgroundTasks.title}</Button>
            </div>
        </section>
        <section aria-labelledby="me-settings" className="overflow-hidden rounded-lg border bg-card">
            <h2 id="me-settings" className="border-b px-4 py-3 font-semibold">{t.settings.title}</h2>
            <div className="divide-y">
                <div className="p-4"><UiStyleSetting /></div>
                <ThemeToggle showLabel />
                <SettingsDialog trigger={<Button variant="ghost" className={rowClass}><Settings className="size-5" aria-hidden="true" />{t.settings.title}</Button>} />
                <SettingsDialog initialTab="account" focusAgent trigger={<Button variant="ghost" className={rowClass}><Bot className="size-5" aria-hidden="true" />{t.agentIntegration.title}</Button>} />
            </div>
        </section>
        {session?.user?.role === "admin" && <section aria-label={t.nav.admin} className="rounded-lg border bg-card">
            <Button asChild variant="ghost" className={rowClass}><Link href="/admin"><Shield className="size-5" aria-hidden="true" />{t.nav.admin}</Link></Button>
        </section>}
        <Button variant="outline" className="min-h-12 w-full justify-start gap-3 text-destructive" disabled={loggingOut} onClick={async () => {
            setLoggingOut(true);
            try { await queue.setUser(null); clearEntryDrafts(); await signOut({ callbackUrl: "/login" }); }
            finally { setLoggingOut(false); }
        }}><LogOut className="size-5" aria-hidden="true" />{t.app.logout}</Button>
        {tasksOpen && <TaskPanel open={tasksOpen} onOpenChange={setTasksOpen} />}
    </main>;
}
