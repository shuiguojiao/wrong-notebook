import { describe, expect, it } from 'vitest';
import { reviewVariantDifficulty, shouldUseVariant } from '@/lib/review-variant';

const eligible = { reviewKind: 'method', reviewStage: 2, answerText: 'x = 3', aiReady: true, enabled: true } as const;

describe('变式复习选题', () => {
    it.each([2, 3])('方法型第 %i 档满足全部条件时可用变式', reviewStage => {
        expect(shouldUseVariant({ ...eligible, reviewStage })).toBe(true);
    });

    it.each([
        { reviewKind: 'memory' },
        { reviewStage: 1 },
        { answerText: null },
        { answerText: ' \n ' },
        { aiReady: false },
        { enabled: false },
    ] as const)('条件不全时使用原题 %j', change => {
        expect(shouldUseVariant({ ...eligible, ...change })).toBe(false);
    });

    it.each([[1, 'easy'], [2, 'easy'], [3, 'medium'], [4, 'hard'], [5, 'hard'], [null, 'medium']])('星级 %s 使用 %s', (stars, difficulty) => {
        expect(reviewVariantDifficulty(stars)).toBe(difficulty);
    });
});
