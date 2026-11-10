import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { SessionProvider } from 'next-auth/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalysisTabs } from '@/components/error-detail/analysis-tabs';
import { AnswerCard } from '@/components/error-detail/answer-card';
import { DetailMenu } from '@/components/error-detail/detail-menu';
import { GeneratedContent } from '@/components/error-detail/generated-content';
import { QuestionCard } from '@/components/error-detail/question-card';
import type { ErrorItemDetail } from '@/components/error-detail/types';
import type { MoreMenuItem } from '@/components/ui/more-menu';
import { LanguageProvider } from '@/contexts/LanguageContext';

vi.mock('@/components/ui/more-menu', () => ({ MoreMenu: ({ items }: { items: MoreMenuItem[] }) => <nav>{items.map(item => <button key={item.label} data-group={item.groupLabel} data-separator={item.separatorBefore} data-destructive={item.destructive} onClick={item.onClick}>{item.label}</button>)}</nav> }));
vi.mock('@/components/error-detail/problem-report-dialog', () => ({ ProblemReportDialog: () => null }));
vi.mock('@/components/markdown-renderer', () => ({ MarkdownRenderer: ({ content }: { content: string }) => <p>{content}</p> }));
vi.mock('@/components/svg-animation-explainer', () => ({ SvgAnimationExplainer: () => <div>已生成动画</div> }));
vi.mock('@/components/error-detail/geogebra-section', () => ({ GeogebraSection: () => <div>已生成 GeoGebra</div> }));

let container: HTMLDivElement;
let root: Root;
const item: ErrorItemDetail = { id: 'e1', questionText: '题目', answerText: '答案', analysis: '详细解析', knowledgePoints: '[]', tags: [], masteryLevel: 0, originalImageUrl: '', userNotes: null };
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

async function render(element: ReactNode) {
    await act(async () => root.render(<LanguageProvider>{element}</LanguageProvider>));
}

describe('错题详情阅读界面', () => {
    it('默认解析，空错因和笔记仍可切换，键盘切换同步选中项', async () => {
        await render(<AnalysisTabs item={item} />);
        expect(container.querySelector('[role="tabpanel"]')!.textContent).toBe('详细解析');
        const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        await act(async () => tabs[1].click());
        expect(tabs[1].getAttribute('aria-selected')).toBe('true');
        expect(container.querySelector('[role="tabpanel"]')!.textContent).toBe('暂无，点编辑补充');
        await act(async () => tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
        expect(tabs[2].getAttribute('aria-selected')).toBe('true');
    });
    it('没有错答只展示正确答案，有错答图片时保留错答行和参考图片', async () => {
        await render(<AnswerCard item={item} />);
        expect(container.querySelectorAll('dt')).toHaveLength(1);
        expect(container.textContent).toContain('正确答案');
        await render(<AnswerCard item={{ ...item, wrongAnswerText: '错答原文', wrongAnswerImageUrl: '/wrong.png', referenceImageUrl: '/reference.png', mistakeStatus: 'wrong_attempt' }} />);
        expect(container.querySelectorAll('dt')).toHaveLength(2);
        expect(container.textContent).toContain('错答原文');
        expect(container.querySelector('img[src="/wrong.png"]')).not.toBeNull();
        expect(container.querySelector('img[src="/reference.png"]')).not.toBeNull();
        // 错题默认就是做错了，不再重复显示；其他作答状态仍提示
        expect(container.textContent).not.toContain('做错了');
        await render(<AnswerCard item={{ ...item, mistakeStatus: 'not_attempted' }} />);
        expect(container.textContent).toMatch(/作答状态/);
    });
    it('无生成内容不占位，双语言版本跟随语言及开关显示', async () => {
        await render(<GeneratedContent item={item} svgEnabled geogebraEnabled onUpdate={vi.fn()} />);
        expect(container.textContent).toBe('');
        await render(<GeneratedContent item={{ ...item, svgAnimationEn: '<svg/>', geogebraCommands: '["A=(0,0)"]' }} svgEnabled geogebraEnabled onUpdate={vi.fn()} />);
        expect(container.textContent).toBe('已生成 GeoGebra');
        await render(<GeneratedContent item={{ ...item, svgAnimation: '<svg/>' }} svgEnabled geogebraEnabled={false} onUpdate={vi.fn()} />);
        expect(container.textContent).toBe('已生成动画');
    });
    it('更多菜单保留全部入口并标记危险删除，开关隐藏相应 AI 入口', async () => {
        const props = { item, onEdit: vi.fn(), onUpdate: vi.fn(), reload: async () => undefined, onDeleted: vi.fn() };
        await render(<DetailMenu {...props} svgEnabled geogebraEnabled />);
        const labels = [...container.querySelectorAll('nav button')].map(button => button.textContent);
        expect(labels).toEqual(['编辑题目', '替换原题图片', '重新生成解答', '重新识别知识点', '重新生成配图', '动画讲解', 'GeoGebra 演示', '复制题号', '报告问题', '删除']);
        expect([...container.querySelectorAll('[data-separator="true"]')].map(button => button.textContent)).toEqual(['重新生成解答', '动画讲解', '复制题号']);
        expect([...container.querySelectorAll('[data-group]')].map(button => button.getAttribute('data-group'))).toEqual(['让 AI 重做', '讲解']);
        expect(container.querySelector('button[data-destructive="true"]')!.textContent).toBe('删除');
        await act(async () => container.querySelector<HTMLButtonElement>('nav button')!.click());
        expect(props.onEdit).toHaveBeenCalledOnce();
        await render(<DetailMenu {...props} svgEnabled={false} geogebraEnabled={false} />);
        expect(container.querySelectorAll('nav button')).toHaveLength(8);
    });
    it.each([
        ['普通反斜杠 \\ 与正常公式 $x^2$', false],
        ['错误公式 $\\unknowncommand{x}$', true],
        ['未配对公式 $x', true],
    ])('仅检测到公式问题才提供修复入口 %s', async (questionText, visible) => {
        await render(<DetailMenu item={{ ...item, questionText }} onEdit={vi.fn()} onUpdate={vi.fn()} reload={async () => undefined} onDeleted={vi.fn()} svgEnabled={false} geogebraEnabled />);
        const labels = [...container.querySelectorAll('nav button')].map(button => button.textContent);
        expect(labels.includes('修复 LaTeX')).toBe(visible);
        expect(container.querySelector('[data-group="讲解"]')?.textContent).toBe('GeoGebra 演示');
        expect(container.querySelectorAll('[data-separator="true"]')).toHaveLength(3);
    });
    it('错因短字段显示贴纸，长分析保留正文，长错误类型不做贴纸', async () => {
        const mistakeAnalysis = '完整错因分析。'.repeat(60);
        await render(<AnalysisTabs item={{ ...item, errorType: '符号看错', mistakeAnalysis }} />);
        await act(async () => container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click());
        expect(container.querySelector('.student-sticker')?.textContent).toBe('符号看错');
        expect(container.querySelector('[role="tabpanel"]')?.textContent).toContain(mistakeAnalysis);
        await render(<AnalysisTabs item={{ ...item, errorType: mistakeAnalysis }} />);
        expect(container.querySelector('.student-sticker')).toBeNull();
        expect(container.querySelector('[role="tabpanel"]')?.textContent).toContain(mistakeAnalysis);
    });
    it.each(['C (-1014)', 'C（-1014）', '答案：AC'])('选择项单独排卡并根据确定的答案标记正确项 %s', async answerText => {
        const questionText = '求值 $x$\nA. -1012\nB. -1013\nC. -1014\nD. -2024';
        await render(<QuestionCard item={{ ...item, questionText, answerText }} onDifficultyChange={vi.fn()} savingDifficulty={false} />);
        expect(container.querySelectorAll('li')).toHaveLength(4);
        const correct = [...container.querySelectorAll('[data-correct="true"]')];
        expect(correct).toHaveLength(answerText.includes('AC') ? 2 : 1);
        expect(correct.at(-1)?.textContent).toContain('-1014');
        expect(correct[0].className).toContain('border-green-600');
    });
    it('没有参考答案时仍完整显示题干和选项，不猜测正确项', async () => {
        const questionText = '求值\nA. 1\nB. 2\nC. 3\nD. 4';
        await render(<><QuestionCard item={{ ...item, questionText, answerText: null }} onDifficultyChange={vi.fn()} savingDifficulty={false} /><AnswerCard item={{ ...item, answerText: null }} /></>);
        expect(container.querySelectorAll('li')).toHaveLength(4);
        expect(container.textContent).toContain('求值');
        expect(container.querySelector('[data-correct="true"]')).toBeNull();
        expect(container.textContent).toContain('正确答案');
    });
    it('无原图与无法拆分的长题完整显示，不猜测正确项', async () => {
        const questionText = '很长的材料与题目。'.repeat(200);
        await render(<QuestionCard item={{ ...item, questionText }} onDifficultyChange={vi.fn()} savingDifficulty={false} />);
        expect(container.textContent).toContain(questionText);
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('[data-correct="true"]')).toBeNull();
    });
    it.each(['admin', 'user'])('%s 账号保留编辑、报告与删除入口，能力开关独立生效', async role => {
        await render(<SessionProvider session={{ user: { id: 'u1', role }, expires: '2099-01-01' }} refetchOnWindowFocus={false}>
            <DetailMenu item={item} onEdit={vi.fn()} onUpdate={vi.fn()} reload={async () => undefined} onDeleted={vi.fn()} svgEnabled geogebraEnabled={false} />
        </SessionProvider>);
        const labels = [...container.querySelectorAll('nav button')].map(button => button.textContent);
        expect(labels).toContain('编辑题目');
        expect(labels).toContain('报告问题');
        expect(labels).toContain('动画讲解');
        expect(labels).not.toContain('GeoGebra 演示');
        expect(labels.at(-1)).toBe('删除');
    });
});
