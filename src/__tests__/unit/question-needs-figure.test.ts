import { describe, expect, it } from 'vitest';
import { questionNeedsFigure } from '@/lib/question-needs-figure';

describe('题目是否需要查看图表', () => {
    it.each(['如图', '下图', '上图', '图中', '图示', '见图', '表中', '下表', '上表', '表格', '统计表'])(
        '识别题干中的提示词：%s', hint => {
            expect(questionNeedsFigure({ questionText: `请结合${hint}的数据作答` })).toBe(true);
        });
    it('显式需要图片时不依赖提示词', () => {
        expect(questionNeedsFigure({ questionText: '求面积', requiresImage: true })).toBe(true);
        expect(questionNeedsFigure({ questionText: '求面积', requiresImage: false })).toBe(false);
    });
    it.each([{ figureSvg: '<svg />' }, { figurePreviewUrl: '/figure.png' }])('已有配图时不需要查看出处：%j', figure => {
        expect(questionNeedsFigure({ questionText: '如图', requiresImage: true, ...figure })).toBe(false);
    });
    it('空配图不影响图表题判定', () => {
        expect(questionNeedsFigure({ questionText: '下表', figureSvg: ' ', figurePreviewUrl: '' })).toBe(true);
    });
    it('题干缺省时沿用 OCR 文本，已有题干时不扫描旧 OCR', () => {
        expect(questionNeedsFigure({ ocrText: '如图，求面积' })).toBe(true);
        expect(questionNeedsFigure({ questionText: '求和', ocrText: '如图，求面积' })).toBe(false);
    });
    it.each([{}, { questionText: null }, { questionText: '' }, { questionText: '求 1 + 1' }])('普通题或空文本不需要：%j', question => {
        expect(questionNeedsFigure(question)).toBe(false);
    });
});
