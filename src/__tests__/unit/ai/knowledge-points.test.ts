import { describe, expect, it } from 'vitest';
import { normalizeAiQuestionTags } from '@/lib/ai/knowledge-points';

describe('AI 知识点候选集合校验', () => {
    it('过滤自创、翻译及其他学科标签，并去重和清理空白', () => {
        expect(normalizeAiQuestionTags({ subject: '数学', knowledgePoints: [' 加法 ', '自创标签', 'Addition', '加法', '力学'] }, { candidateTags: { subjectName: '数学', tags: ['加法'] } }).knowledgePoints).toEqual(['加法']);
    });
    it('空候选集合保持空结果，不退回自由造标签', () => {
        expect(normalizeAiQuestionTags({ knowledgePoints: ['自创'] }, { candidateTags: { subjectName: '数学', tags: [] } }).knowledgePoints).toEqual([]);
    });
    it('未指定错题本时，按实际识别的学科选择预取清单', () => {
        expect(normalizeAiQuestionTags({ subject: '物理', knowledgePoints: ['加法', '力学'] }, { prefetchedMathTags: ['加法'], prefetchedPhysicsTags: ['力学'] }).knowledgePoints).toEqual(['力学']);
    });
    it('语文标签按本学科候选保留', () => {
        expect(normalizeAiQuestionTags({ subject: '语文', knowledgePoints: ['声母', '一元一次方程'] }, { prefetchedChineseTags: ['声母'], prefetchedMathTags: ['一元一次方程'] }).knowledgePoints).toEqual(['声母']);
    });
    it('没有课程库的学科允许自行命名', () => {
        expect(normalizeAiQuestionTags({ subject: '历史', knowledgePoints: ['辛亥革命'] }, { prefetchedHistoryTags: [] }).knowledgePoints).toEqual(['辛亥革命']);
        expect(normalizeAiQuestionTags({ subject: '数学', knowledgePoints: ['集合'] }, { candidateTags: { subjectName: '数学', tags: [], allowCustom: true } }).knowledgePoints).toEqual(['集合']);
    });
    it('即使没有提供候选集合，AI 标签也最多五个且不重复', () => {
        expect(normalizeAiQuestionTags({ knowledgePoints: ['1', '1', '2', '3', '4', '5', '6'] }, {}).knowledgePoints).toEqual(['1', '2', '3', '4', '5']);
    });
});
