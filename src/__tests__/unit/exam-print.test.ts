import { describe, expect, it } from 'vitest';
import { buildExamPageCss, EXAM_PRINT_CSS, examPaperCode } from '@/lib/exam/exam-print';
import { translations } from '@/lib/translations';

describe('试卷卷号与页边距盒', () => {
    it('同一个 ID 在重复调用中保持同一卷号', () => {
        expect(examPaperCode('paper-2026-11-10')).toBe('AG42');
        expect(examPaperCode('paper-2026-11-10')).toBe(examPaperCode('paper-2026-11-10'));
        expect(examPaperCode('paper-2026-11-11')).not.toBe(examPaperCode('paper-2026-11-10'));
    });

    it('空串、Unicode 与多种 ID 均得到 4 位无易混字符的大写字母数字', () => {
        for (const id of ['', '试卷📝', '0000', ...Array.from({ length: 512 }, (_, index) => `paper-${index}`)]) {
            expect(examPaperCode(id)).toMatch(/^[2-9A-HJKMNP-Z]{4}$/);
        }
    });

    it.each(['zh', 'en'] as const)('%s 页眉包含卷号及页码计数器，答案页省略提示', language => {
        const t = translations[language].exam;
        const css = buildExamPageCss('K7Q2', t.printPageHeader, t.printPhotoHint);
        expect(css).toContain('@top-right');
        expect(css).toContain('K7Q2');
        expect(css).toContain('counter(page)');
        expect(css).toContain('counter(pages)');
        expect(css).not.toContain('{code}');
        expect(css).not.toContain('{page}');
        const [questions, answers] = css.split('@page exam-answers');
        expect(questions).toContain(t.printPhotoHint);
        expect(answers).toContain('@top-right');
        expect(answers).toContain('@bottom-center { content: none; }');
        expect(answers).not.toContain(t.printPhotoHint);
    });

    it('标题下卷号与题号边框样式独立于打印页边距盒', () => {
        expect(EXAM_PRINT_CSS).toContain('.exam-sheet .exam-paper-code');
        expect(EXAM_PRINT_CSS).toContain('.exam-sheet .exam-question-number');
        expect(EXAM_PRINT_CSS).toContain('border: 1.5px solid currentColor');
        expect(EXAM_PRINT_CSS).toContain('font-weight: 700');
    });

    it('页边距盒文案转义引号、反斜杠、换行与 HTML 结束标签', () => {
        const css = buildExamPageCss('ABCD', '"{code}" {page}/{pages}', '</style>\\\n');
        expect(css).toContain('\\22 ');
        expect(css).toContain('\\3c /style>\\5c \\a ');
        expect(css).not.toContain('</style>');
    });
});
