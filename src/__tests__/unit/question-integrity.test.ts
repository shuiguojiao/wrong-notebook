import { describe, expect, it } from 'vitest';
import { integrityCases, integrityMatch } from '@/__tests__/fixtures/integrity';
import { parseQuestionIntegrity } from '@/lib/ai/response-parser';
import { generateIntegrityRequest } from '@/lib/ai/prompts/integrity';
import { integrityIssues } from '@/lib/question/integrity-issues';
import { mergeAiCheckIssues, parseCheckIssues } from '@/lib/question/check-store';

describe('图文核对结果', () => {
    it('映射蛇形字段，兼容 JSON 代码块', () => {
        expect(parseQuestionIntegrity('```json\n' + JSON.stringify(integrityMatch) + '\n```')).toEqual({
            imageText: '原图文字', sameQuestion: 'yes', crop: 'complete', textDiffs: [], studentAnswer: 'not_given', studentAnswerDiff: '', confidence: 0.98, summary: '图文一致',
        });
    });
    it.each(['非 JSON', '{}', JSON.stringify({ ...integrityMatch, confidence: 2 }), JSON.stringify({ ...integrityMatch, text_diffs: [{ image_says: 'kěn' }] }), JSON.stringify({ ...integrityMatch, crop: 'other' })])('损坏或缺字段输出为可重试错误：%s', text => {
        expect(() => parseQuestionIntegrity(text)).toThrow('AI_RESPONSE_ERROR');
    });
    it('每一个输出字段都必须存在', () => {
        for (const field of Object.keys(integrityMatch)) {
            const incomplete = { ...integrityMatch } as Record<string, unknown>;
            delete incomplete[field];
            expect(() => parseQuestionIntegrity(JSON.stringify(incomplete))).toThrow('AI_RESPONSE_ERROR');
        }
    });
    it.each(integrityCases)('$name 的可见性为 $visibility', ({ output, code, visibility }) => {
        const issues = integrityIssues(parseQuestionIntegrity(JSON.stringify(output)));
        expect(issues).toEqual([expect.objectContaining({ code, visibility })]);
        if (code === 'text_diff') expect(issues[0]).toMatchObject({ evidence: output.text_diffs[0].image_says, suggestion: { textSays: output.text_diffs[0].text_says, imageSays: output.text_diffs[0].image_says } });
    });
    it('换图阈值包含 0.8；不报告不确定或无具体文字证据的差异', () => {
        const result = parseQuestionIntegrity(JSON.stringify({ ...integrityMatch, same_question: 'no', confidence: 0.79 }));
        expect(integrityIssues(result)).toEqual([]);
        expect(integrityIssues({ ...result, confidence: 0.8 })).toHaveLength(1);
        expect(integrityIssues({ ...result, sameQuestion: 'unsure' })).toEqual([]);
        expect(integrityIssues({ ...result, sameQuestion: 'yes', textDiffs: [{ imageSays: '', textSays: '错字', severity: 'major' }] })).toEqual([]);
        expect(integrityIssues({ ...result, sameQuestion: 'yes', studentAnswer: 'mismatch', studentAnswerDiff: 'take' })).toEqual([expect.objectContaining({ code: 'student_answer_diff', visibility: 'agent', evidence: 'take' })]);
    });
    it('规则与 AI 共存；按 code+field 记住消失过的忽略项', () => {
        const rule = { code: 'missing_answer', field: 'answerText', source: 'rules', severity: 'minor', visibility: 'agent' };
        const issue = { code: 'text_diff', field: 'questionText', source: 'ai', severity: 'major' as const, visibility: 'user' as const, dismissed: true };
        const first = mergeAiCheckIssues(JSON.stringify([rule, issue]), [], 'vision');
        const next = mergeAiCheckIssues(first.checkIssues, [issue], 'vision-2');
        expect(next.checkStatus).toBe('pass');
        expect(parseCheckIssues(next.checkIssues)).toEqual([rule, { ...issue, model: 'vision-2' }]);
        expect(mergeAiCheckIssues(null, [issue], 'vision').checkStatus).toBe('flagged');
    });
    it.each(['zh', 'en'] as const)('提示词 %s 保留 v3 规则与相对坐标', language => {
        const image = { base64: 'x', mimeType: 'image/png' };
        const prompt = generateIntegrityRequest({ image, questionText: '测试', language, sourcePages: [{ image, regions: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }] }] });
        expect(prompt.system).toContain('image_text');
        expect(prompt.system).toContain('major');
        expect(prompt.system).toContain('minor');
        expect(prompt.user).toContain('"x":0.1');
        expect(prompt.user).toContain('测试');
    });
});
