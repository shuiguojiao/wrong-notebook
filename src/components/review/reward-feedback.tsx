"use client";

import { useLanguage } from '@/contexts/LanguageContext';
import type { RewardEntryResponse } from '@/types/api';

interface RewardFeedbackProps { entries?: RewardEntryResponse[]; result: string; enabled: boolean }

export function RewardFeedback({ entries = [], result, enabled }: RewardFeedbackProps) {
    const { t } = useLanguage();
    if (!enabled || !entries.length) return null;
    const labels = entries.flatMap(entry => {
        const template = ['review', 'practice', 'exam'].includes(entry.type) ? t.rewards.earnedReview
            : entry.type === 'correction' ? t.rewards.earnedCorrection
                : entry.type === 'brave' ? result === 'correct' ? t.rewards.earnedBrave : t.rewards.earnedBraveWrong : null;
        return template ? [template.replace('{points}', String(entry.points))] : [];
    });
    return labels.length ? <p className="text-sm text-muted-foreground" data-reward-feedback>{labels.join(t.rewards.separator)}</p> : null;
}
