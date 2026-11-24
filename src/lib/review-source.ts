export const REVIEW_SOURCES = ['review', 'variant_review'] as const;
type ReviewSource = typeof REVIEW_SOURCES[number];

export function isReviewSource(source: string | undefined): source is ReviewSource {
    return REVIEW_SOURCES.some(reviewSource => reviewSource === source);
}
