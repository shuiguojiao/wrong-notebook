"use client";

import { SvgAnimationExplainer } from "@/components/svg-animation-explainer";
import { useLanguage } from "@/contexts/LanguageContext";
import { GeogebraSection } from "./geogebra-section";
import type { ErrorItemDetail, UpdateErrorItem } from "./types";

interface GeneratedContentProps {
    item: ErrorItemDetail;
    svgEnabled: boolean;
    geogebraEnabled: boolean;
    onUpdate: UpdateErrorItem;
}

export function GeneratedContent({ item, svgEnabled, geogebraEnabled, onUpdate }: GeneratedContentProps) {
    const { language } = useLanguage();
    const svg = language === "en" ? item.svgAnimationEn : item.svgAnimation;
    return <>
        {svgEnabled && svg && <SvgAnimationExplainer key={language} errorItemId={item.id} svgAnimation={svg} hasOtherLanguage={!!(language === "en" ? item.svgAnimation : item.svgAnimationEn)} onChange={(lang, value) => onUpdate({ [lang === "en" ? "svgAnimationEn" : "svgAnimation"]: value })} />}
        {geogebraEnabled && item.geogebraCommands && <GeogebraSection errorItemId={item.id} commands={item.geogebraCommands} onUpdate={onUpdate} />}
    </>;
}
