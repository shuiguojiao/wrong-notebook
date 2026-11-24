import type { ReviewKind } from '@/lib/review-schedule';

export const VARIANT_START_STAGE = 2;

interface VariantEligibility {
    reviewKind: ReviewKind;
    reviewStage: number;
    answerText?: string | null;
    aiReady: boolean;
    enabled: boolean;
}

export function shouldUseVariant({ reviewKind, reviewStage, answerText, aiReady, enabled }: VariantEligibility): boolean {
    return reviewKind === 'method' && reviewStage >= VARIANT_START_STAGE && !!answerText?.trim() && aiReady && enabled;
}

export function reviewVariantDifficulty(stars?: number | null): 'easy' | 'medium' | 'hard' {
    if (stars == null || stars === 3) return 'medium';
    return stars <= 2 ? 'easy' : 'hard';
}
