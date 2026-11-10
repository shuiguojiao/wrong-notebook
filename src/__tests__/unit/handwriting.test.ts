import { describe, expect, it } from 'vitest';
import { acceptsPointer, appendPoint, changeStrokes, emptyHistory, eraseAt, exportDimensions, inkBounds, pageTransform, paperSize, penPressure, redoInk, strokeOutline, undoInk } from '@/lib/handwriting/strokes';
import type { InkStroke } from '@/lib/handwriting/strokes';
import { answerImageSchema, MAX_ANSWER_IMAGE_BYTES, parseAnswerImage } from '@/lib/handwriting/image';
import { parseAnswerGrading } from '@/lib/ai/response-parser';
import { ANSWER_IMAGE } from '../fixtures/handwriting';

const stroke: InkStroke = { points: [[20, 30, 0.5], [120, 30, 0.8]], size: 7, color: '#111827', pen: true };

describe('手写向量与历史', () => {
    it.each([[-1, 0.35], [0, 0.35], [0.5, 0.675], [1, 1], [2, 1]])('笔压力 %s 映射为 %s', (input, expected) => {
        expect(penPressure(input)).toBeCloseTo(expected);
    });
    it('过滤重复点和无效坐标，但保留压感变化', () => {
        const points = appendPoint([], [10, 20, 0.5]);
        expect(appendPoint(points, [10.1, 20.1, 0.5])).toBe(points);
        expect(appendPoint(points, [NaN, 20, 0.5])).toBe(points);
        expect(appendPoint(points, [10, 20, 0.8])).toEqual([[10, 20, 0.5], [10, 20, 0.8]]);
        expect(appendPoint([], [1, 2, 8])[0][2]).toBe(1);
    });
    it('撤销、重做和清空都保留旧快照，分叉时清除重做', () => {
        const initial = emptyHistory();
        const first = changeStrokes(initial, [stroke]);
        const cleared = changeStrokes(first, []);
        expect(undoInk(cleared).strokes).toEqual([stroke]);
        expect(redoInk(undoInk(cleared)).strokes).toEqual([]);
        expect(changeStrokes(undoInk(cleared), [stroke, stroke]).future).toEqual([]);
        expect(initial.strokes).toEqual([]);
        expect(undoInk(initial)).toBe(initial);
        expect(redoInk(initial)).toBe(initial);
    });
    it('撤销栈限制为 50 次操作', () => {
        let state = emptyHistory();
        for (let i = 0; i < 100; i++) state = changeStrokes(state, [stroke]);
        expect(state.past).toHaveLength(50);
    });
    it('擦除命中稀疏采样点之间的线段，未命中保持引用', () => {
        const strokes = [stroke];
        expect(eraseAt(strokes, [70, 31, 0.5])).toEqual([]);
        expect(eraseAt(strokes, [70, 300, 0.5])).toBe(strokes);
    });
    it('单点也有有效轮廓，包围盒包含笔宽和边距', () => {
        const dot = { ...stroke, points: [stroke.points[0]] };
        expect(strokeOutline(dot).length).toBeGreaterThan(3);
        const bounds = inkBounds([stroke])!;
        for (const [x, y] of strokeOutline(stroke)) {
            expect(x - bounds.x).toBeGreaterThanOrEqual(19.99);
            expect(y - bounds.y).toBeGreaterThanOrEqual(19.99);
            expect(bounds.x + bounds.width - x).toBeGreaterThanOrEqual(19.99);
        }
        expect(inkBounds([])).toBeNull();
    });
    it('真实压感影响轮廓宽度', () => {
        const low = inkBounds([{ ...stroke, points: [[20, 30, 0.1], [120, 30, 0.1]] }], 0)!;
        const high = inkBounds([{ ...stroke, points: [[20, 30, 1], [120, 30, 1]] }], 0)!;
        expect(high.height).toBeGreaterThan(low.height);
    });
    it.each([[3200, 800, 1600, 400], [800, 3200, 400, 1600], [30, 20, 30, 20]])('按比例限制导出 %s × %s', (width, height, expectedWidth, expectedHeight) => {
        expect(exportDimensions({ x: 0, y: 0, width, height })).toMatchObject({ width: expectedWidth, height: expectedHeight });
    });
    it('横竖屏投影可逆，不改动向量坐标', () => {
        for (const [width, height] of [[1024, 500], [375, 600], [2048, 900]]) {
            const view = pageTransform(width, height);
            expect((120 * view.scale + view.x - view.x) / view.scale).toBeCloseTo(120);
            expect(view.scale * 1000).toBeLessThanOrEqual(width);
            expect(view.scale * view.paper.height).toBeCloseTo(height);
            expect(view.scale * view.paper.width).toBeCloseTo(width);
            expect((300 * view.scale + view.y - view.y) / view.scale).toBeCloseTo(300);
        }
        expect(stroke.points[1]).toEqual([120, 30, 0.8]);
    });
    it.each([[1000, 600, 600], [500, 1000, 2000], [2000, 400, 200], [200, 1000, 5000]])('纸张 %s × %s 完整覆盖且极端比例无死区', (width, height, expected) => {
        expect(paperSize(width, height)).toEqual({ width: 1000, height: expected });
        const view = pageTransform(width, height);
        expect(view.x).toBe(0);
        expect(view.y).toBe(0);
        expect(height / view.scale).toBeCloseTo(expected);
    });
    it('无效容器尺寸有有限正数回退，视区外的笔迹仍参与导出', () => {
        expect(paperSize(0, 0)).toEqual({ width: 1000, height: 1000 });
        expect(paperSize(NaN, Infinity)).toEqual({ width: 1000, height: 1000 });
        const long = { ...stroke, points: [[100, 1800, 0.8], [200, 1900, 0.8]] as typeof stroke.points };
        const bounds = inkBounds([stroke, long])!;
        expect(bounds.y + bounds.height).toBeGreaterThan(1900);
        expect(pageTransform(1000, 300).paper.height).toBe(300);
        expect(long.points[1]).toEqual([200, 1900, 0.8]);
    });
    it('Pencil 模式让手指滚动，活动笔优先于触控，鼠标仍可作答', () => {
        expect(acceptsPointer('touch', true)).toBe(false);
        expect(acceptsPointer('touch', false, 'pen')).toBe(false);
        expect(acceptsPointer('touch', false)).toBe(true);
        expect(acceptsPointer('pen', true)).toBe(true);
        expect(acceptsPointer('mouse', true)).toBe(true);
    });
});

describe('手写图片验证', () => {
    it('保留真实 MIME，传输时拆出 Base64', () => {
        expect(parseAnswerImage(ANSWER_IMAGE)).toEqual({ mimeType: 'image/png', base64: ANSWER_IMAGE.split(',')[1] });
        expect(answerImageSchema.safeParse(ANSWER_IMAGE).success).toBe(true);
    });
    it.each(['https://example.com/a.png', 'local-image:abcd.png', 'data:image/svg+xml;base64,PHN2Zz4=',
        'data:image/png;base64,aGVsbG8=', 'data:image/jpeg;base64,iVBORw0KGgo=', 'data:image/png;base64,@@@', 'data:image/png;base64,', 'data:image/png;base64,a'])('拒绝无效图片 %s', value => {
        expect(parseAnswerImage(value)).toBeNull();
    });
    it('拒绝大于 1.5MB 的图片，不因长 Base64 正则而栈溢出', () => {
        const bytes = Buffer.alloc(MAX_ANSWER_IMAGE_BYTES + 1);
        Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes);
        expect(parseAnswerImage(`data:image/png;base64,${bytes.toString('base64')}`)).toBeNull();
        const atLimit = bytes.subarray(0, MAX_ANSWER_IMAGE_BYTES);
        expect(parseAnswerImage(`data:image/png;base64,${atLimit.toString('base64')}`)?.mimeType).toBe('image/png');
    });
});


describe('手写判题结果解析', () => {
    it('兼容旧的纯文字结果，新识别文本保留换行', () => {
        expect(parseAnswerGrading('{"correct":true,"reason":"正确"}')).toEqual({ correct: true, reason: '正确' });
        expect(parseAnswerGrading(JSON.stringify({ correct: false, reason: '第二步符号错', recognizedAnswer: '第一步\n第二步' }))).toEqual({ correct: false, reason: '第二步符号错', recognizedAnswer: '第一步\n第二步' });
    });
    it.each([{}, ['答案'], 'x'.repeat(20001)])('拒绝无效识别文本 %#', recognizedAnswer => {
        expect(() => parseAnswerGrading(JSON.stringify({ correct: false, reason: '错误', recognizedAnswer }))).toThrow();
    });
});
