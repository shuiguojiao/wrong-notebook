import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BadgeArt } from '@/components/student/badge-art';
import { badgeArtTilt } from '@/lib/rewards/badge-art';
import { REWARD_BADGES } from '@/lib/rewards/badges';

describe('成就章美术', () => {
    it.each(REWARD_BADGES)('$id 有独立章面、只使用继承颜色，未获得淡显', badge => {
        const markup = renderToStaticMarkup(<BadgeArt badgeId={badge.id} category={badge.category} earned />);
        const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
        expect(svg.getAttribute('viewBox')).toBe('0 0 120 120');
        expect(svg.querySelector('text, image, foreignObject')).toBeNull();
        expect(svg.querySelector('g[opacity="1"]')?.children.length).toBeGreaterThan(0);
        for (const node of [svg, ...svg.querySelectorAll('*')]) {
            for (const attr of ['fill', 'stroke']) if (node.hasAttribute(attr)) expect(['none', 'currentColor']).toContain(node.getAttribute(attr));
        }
        const locked = renderToStaticMarkup(<BadgeArt badgeId={badge.id} category={badge.category} earned={false} concealed={badge.hidden} />);
        expect(locked).toContain('stroke-dasharray="5 5"');
        if (!badge.hidden) expect(locked).toContain('opacity="0.35"');
    });
    it.each([1, 3, 7, 14] as const)('坚持 %i 天有相同数量的圆点', days => {
        const markup = renderToStaticMarkup(<BadgeArt badgeId={`streak-${days}`} category="persistence" earned />);
        const svg = new DOMParser().parseFromString(markup, 'image/svg+xml');
        expect(svg.querySelector('g[opacity="1"]')?.querySelectorAll('circle')).toHaveLength(days);
    });
    it('30 天使用 30 个刻度，100 天使用月桂叶，隐藏章有 12 个波浪', () => {
        const parse = (badgeId: 'streak-30' | 'streak-100' | 'full-week') => new DOMParser().parseFromString(
            renderToStaticMarkup(<BadgeArt badgeId={badgeId} category={badgeId === 'full-week' ? 'hidden' : 'persistence'} earned />), 'image/svg+xml');
        expect(parse('streak-30').querySelectorAll('path[stroke-width="2"]')).toHaveLength(30);
        expect(parse('streak-100').querySelectorAll('ellipse')).toHaveLength(14);
        expect(parse('full-week').querySelector('path')?.getAttribute('d')?.match(/Q/g)).toHaveLength(12);
    });
    it('16 枚图案各异，隐藏未获得共用问号章面', () => {
        expect(new Set(REWARD_BADGES.map(badge => renderToStaticMarkup(<BadgeArt badgeId={badge.id} category={badge.category} earned />))).size).toBe(16);
        const concealed = REWARD_BADGES.filter(badge => badge.hidden).map(badge => renderToStaticMarkup(<BadgeArt badgeId={badge.id} category={badge.category} earned={false} concealed />));
        expect(new Set(concealed).size).toBe(1);
    });
    it('倾角由编号确定，落在正负 8 度内并具有变化', () => {
        const angles = REWARD_BADGES.map(badge => badgeArtTilt(badge.id));
        expect(new Set(angles).size).toBeGreaterThan(5);
        for (const badge of REWARD_BADGES) {
            expect(badgeArtTilt(badge.id)).toBe(badgeArtTilt(badge.id));
            expect(badgeArtTilt(badge.id)).toBeGreaterThanOrEqual(-8);
            expect(badgeArtTilt(badge.id)).toBeLessThanOrEqual(8);
        }
        expect(badgeArtTilt('streak-7')).toBe(5);
    });
});
