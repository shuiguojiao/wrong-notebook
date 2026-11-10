import { describe, expect, it } from 'vitest';
import { changedFields, createEditValues } from '@/components/error-detail/edit-values';
import { sourceCaption } from '@/components/error-detail/question-card';
import type { ErrorItemDetail } from '@/components/error-detail/types';

const item: ErrorItemDetail = { id: 'e1', questionText: '题目', answerText: '答案', analysis: '', knowledgePoints: '["旧知识点"]', tags: [], masteryLevel: 0, originalImageUrl: '', userNotes: null, paperLevel: 'inactive-group' };

describe('详情统一编辑的变更集', () => {
    it('空参考答案以空编辑值展示，只调整年级不会改写空答案', () => {
        const value = createEditValues({ ...item, answerText: null });
        expect(value.answerText).toBe('');
        expect(changedFields(value, { ...value, gradeSemester: '初二上' })).toEqual({ gradeSemester: '初二上' });
    });
    it('保留旧标签和停用卷别，无修改时不提交任何字段', () => {
        const value = createEditValues(item);
        expect(JSON.parse(value.knowledgePoints)).toEqual(['旧知识点']);
        expect(changedFields(value, { ...value })).toEqual({});
    });
    it('修改多个字段只提交改动，清空题型与卷别使用 null', () => {
        const value = createEditValues({ ...item, questionType: 'choice' });
        expect(changedFields(value, { ...value, questionText: '新题目', analysis: '新解析', paperLevel: '', questionType: '' })).toEqual({ questionText: '新题目', analysis: '新解析', paperLevel: null, questionType: null });
    });
    it('新增错答沿用原有规范化规则，单独编辑年级不改旧错答状态', () => {
        const value = createEditValues({ ...item, wrongAnswerText: '原错答', mistakeStatus: 'unknown' });
        expect(changedFields(value, { ...value, gradeSemester: '大学拓展课程' })).toEqual({ gradeSemester: '大学拓展课程' });
        expect(changedFields(value, { ...value, wrongAnswerText: '新错答', mistakeStatus: 'not_attempted' })).toEqual({ wrongAnswerText: '新错答', mistakeStatus: 'wrong_attempt' });
    });
    it('出处取第一段，兼容空白与多行来源', () => {
        expect(sourceCaption('  期中试卷\n第 3 页\n\n其他说明 ')).toBe('期中试卷\n第 3 页');
        expect(sourceCaption(null)).toBeUndefined();
    });
});
