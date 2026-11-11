import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionContent } from '@/components/student/collection-page';
import { LanguageProvider } from '@/contexts/LanguageContext';
import type { StudentProgress, StudentSticker } from '@/lib/student-progress';

let root: Root;
let container: HTMLDivElement;
const sticker = (name: string, state: StudentSticker['state'], tagSet = 'default'): StudentSticker => ({ key: name + tagSet, name, state, tagSet, subjectId: 'math', subjectName: '数学', subjectKey: 'math', itemIds: [name], total: 2, remaining: state === 'earned' ? 0 : 2, earnedDay: null });
const stickers = [sticker('全掌握', 'earned'), sticker('近期全对', 'improving'), sticker('方程', 'missing'), sticker('方程', 'missing', 'cnm'), ...Array.from({ length: 12 }, (_, i) => sticker(`知识点${i}`, 'missing'))];
const data: StudentProgress = { stickers, earned: 1, weeklyNew: [], streak: 0, reviewedToday: false, day: '2026-11-10', items: {} };
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); localStorage.setItem('language', 'zh'); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('收集册三态与筛选', () => {
    it('展示全量与规则、三态；练这个严格带学科、体系和未掌握条件', async () => {
        await act(async () => root.render(<LanguageProvider><CollectionContent data={data} /></LanguageProvider>));
        expect(container.querySelectorAll('li')).toHaveLength(16);
        expect(container.textContent).toContain('已贴 1 / 16 张');
        expect(container.textContent).toContain('一个知识点的错题全部掌握，就能贴上它');
        expect(container.querySelectorAll('[data-state="earned"]')).toHaveLength(1);
        expect(container.querySelectorAll('[data-state="improving"]')).toHaveLength(1);
        expect([...container.querySelectorAll('h3')].map(heading => heading.textContent)).toEqual(['内置体系', '人教版课标体系']);
        expect(container.textContent?.match(/内置体系/g)).toHaveLength(1);
        expect(container.textContent?.match(/人教版课标体系/g)).toHaveLength(1);
        expect(container.querySelector('li p')).toBeNull();
        const links = [...container.querySelectorAll<HTMLAnchorElement>('a[aria-label^="练这个："]')];
        expect(links).toHaveLength(15);
        expect(container.querySelector('a[data-state="earned"]')).toBeNull();
        const improving = container.querySelector<HTMLAnchorElement>('a[data-state="improving"]')!;
        expect(improving.getAttribute('aria-label')).toBe('练这个：近期全对，在好转');
        expect(new URL(improving.href).searchParams.get('tag')).toBe('近期全对');
        improving.focus();
        expect(document.activeElement).toBe(improving);
        for (const link of links) {
            expect(link.classList.contains('student-sticker')).toBe(true);
            expect(link.parentElement?.tagName).toBe('LI');
            expect(link.textContent).toContain('练这个 ›');
        }
        const href = new URL(links.find(link => new URL(link.href).searchParams.get('tagSet') === 'cnm')!.href);
        expect(href.pathname).toBe('/notebooks/math');
        expect(Object.fromEntries(href.searchParams)).toEqual({ mastery: 'unmastered', tag: '方程', tagSet: 'cnm' });
        const button = [...container.querySelectorAll('button')].find(button => button.textContent === '在好转')!;
        await act(async () => button.click());
        expect(button.getAttribute('aria-pressed')).toBe('true');
        expect(container.querySelectorAll('li')).toHaveLength(1);
        expect(container.textContent).toContain('近期全对');
        expect(container.textContent).toContain('已贴 1 / 16 张');
        expect(container.querySelector('h3')?.textContent).toBe('内置体系');
    });
    it('每个学科独立判断体系数量，单体系学科隐藏名称且同体系贴纸聚在一起', async () => {
        const mixed = [stickers[0], stickers[3], stickers[2], { ...sticker('单词', 'earned', 'cnm'), subjectId: 'english', subjectName: '英语', subjectKey: 'english' }];
        await act(async () => root.render(<LanguageProvider><CollectionContent data={{ ...data, stickers: mixed }} /></LanguageProvider>));
        expect([...container.querySelectorAll('h2')].map(heading => heading.textContent)).toEqual(['数学', '英语']);
        const sections = [...container.querySelectorAll('section')];
        expect(sections).toHaveLength(3);
        expect(sections[0].querySelectorAll('li')).toHaveLength(2);
        expect(sections[1].querySelectorAll('li')).toHaveLength(1);
        expect(sections[2].querySelector('h3')).toBeNull();
        expect(sections[2].textContent).not.toContain('人教版课标体系');
        expect(container.querySelectorAll('li')).toHaveLength(4);
    });
    it('空态没有假贴纸或练习入口', async () => {
        await act(async () => root.render(<LanguageProvider><CollectionContent data={{ ...data, stickers: [], earned: 0 }} /></LanguageProvider>));
        expect(container.querySelectorAll('[data-state]')).toHaveLength(0);
        expect(container.textContent).toContain('还没有知识点');
    });
});
