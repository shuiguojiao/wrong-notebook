"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/lib/page-title";

export default function CollectionPage() {
    const { t } = useLanguage();
    usePageTitle(t.nav.collection);
    return <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-8">
        <h1 className="font-title text-3xl">{t.nav.collection}</h1>
        <section className="space-y-4 rounded-lg border bg-card p-6 text-center">
            <Star className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xl">{t.student.collectionPreparing}</h2>
            <Button asChild><Link href="/notebooks">{t.student.goToNotebooks}</Link></Button>
        </section>
    </main>;
}
