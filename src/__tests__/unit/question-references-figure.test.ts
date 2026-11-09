import { describe, expect, it } from 'vitest';
import { questionReferencesFigure } from '@/lib/question/question-references-figure';

describe('题干引用图形', () => {
    it.each(['如图，求角度', '观察下图', '图中阴影面积', '右图所示', '左图是一个三角形', '由上图可知', '参见附图', '图示电路', '图 2 中的点 A', '图（一）中的直线', 'See the diagram below', 'As shown in Figure 1'])('识别显式引用：%s', text => {
        expect(questionReferencesFigure(text)).toBe(true);
    });
    it.each(['', '求 1+1', '三角形的面积公式是什么？', '画出函数图像', '图书馆有多少本书？'])('普通文本不触发原图入口：%s', text => {
        expect(questionReferencesFigure(text)).toBe(false);
    });
});
