import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalysisTabs } from '@/components/error-detail/analysis-tabs';
import { AnswerCard } from '@/components/error-detail/answer-card';
import { DetailMenu } from '@/components/error-detail/detail-menu';
import { GeneratedContent } from '@/components/error-detail/generated-content';
import type { ErrorItemDetail } from '@/components/error-detail/types';
import type { MoreMenuItem } from '@/components/ui/more-menu';
import { LanguageProvider } from '@/contexts/LanguageContext';

vi.mock('@/components/ui/more-menu', () => ({ MoreMenu: ({ items }: { items: MoreMenuItem[] }) => <nav>{items.map(item => <button key={item.label} data-destructive={item.destructive} onClick={item.onClick}>{item.label}</button>)}</nav> }));
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
        expect(labels).toEqual(['编辑', '替换原题图片', 'AI 重新生成配图', '重新生成完整解答', '修复 LaTeX', 'AI 重新识别知识点', '生成动画讲解', 'GeoGebra 动态演示', '复制 ID', '报告问题', '删除']);
        expect(container.querySelector('button[data-destructive="true"]')!.textContent).toBe('删除');
        await act(async () => container.querySelector<HTMLButtonElement>('nav button')!.click());
        expect(props.onEdit).toHaveBeenCalledOnce();
        await render(<DetailMenu {...props} svgEnabled={false} geogebraEnabled={false} />);
        expect(container.querySelectorAll('nav button')).toHaveLength(9);
    });
});
