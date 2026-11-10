"use client";

import { useId } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUiStyle } from "@/contexts/UiStyleContext";
import type { UiStyle } from "@/lib/ui-style";

/** 本机界面风格切换，立即生效，无需提交全局设置。 */
export function UiStyleSetting() {
    const { t } = useLanguage();
    const { preference, setPreference } = useUiStyle();
    const labelId = useId();
    return (
        <div className="space-y-2">
            <p id={labelId} className="text-sm font-medium">{t.settings.uiStyle.label}</p>
            <SegmentedControl<UiStyle>
                aria-labelledby={labelId}
                value={preference}
                onChange={setPreference}
                options={[
                    { value: "notebook", label: t.settings.uiStyle.notebook },
                    { value: "simple", label: t.settings.uiStyle.simple },
                ]}
            />
            <p className="text-xs text-muted-foreground">{t.settings.uiStyle.description}</p>
        </div>
    );
}
