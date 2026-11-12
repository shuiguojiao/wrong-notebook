import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FunStickerArt } from '@/components/student/fun-sticker-art';
import { FUN_STICKERS, funStickerArtSrc } from '@/lib/rewards/fun-stickers';

describe('趣味贴纸美术资源', () => {
    it('36 个编号各有独立的本地 SVG', () => {
        expect(FUN_STICKERS).toHaveLength(36);
        expect(new Set(FUN_STICKERS.map(sticker => sticker.id)).size).toBe(36);
    });
    it.each(FUN_STICKERS)('$id 画布、大小与安全元素符合约定', ({ id }) => {
        const source = readFileSync(join(process.cwd(), 'public', funStickerArtSrc(id)), 'utf8');
        expect(Buffer.byteLength(source)).toBeLessThanOrEqual(6 * 1024);
        const document = new DOMParser().parseFromString(source, 'image/svg+xml');
        expect(document.querySelector('parsererror')).toBeNull();
        const svg = document.documentElement;
        expect(svg.tagName).toBe('svg');
        expect(svg.getAttribute('viewBox')).toBe('0 0 160 160');
        expect(svg.getAttributeNames().sort()).toEqual(['viewBox', 'xmlns']);
        expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
        expect(svg.querySelector('script, foreignObject, image, text, linearGradient, radialGradient, filter, style')).toBeNull();
        const patterns = svg.querySelectorAll('pattern');
        expect(patterns).toHaveLength(1);
        const pattern = patterns[0];
        expect(pattern.getAttribute('width')).toBe('6');
        expect(pattern.getAttribute('height')).toBe('6');
        expect(pattern.getAttribute('patternUnits')).toBe('userSpaceOnUse');
        const dot = pattern.querySelector('circle')!;
        expect(dot.getAttribute('r')).toBe('1.4');
        expect(Number(dot.getAttribute('fill-opacity'))).toBe(0.3);
        const localFill = `url(#${pattern.id})`;
        expect(svg.querySelectorAll(`[fill="${localFill}"]`)).toHaveLength(1);
        for (const element of [svg, ...svg.querySelectorAll('*')]) {
            for (const attribute of element.attributes) {
                expect(attribute.name).not.toMatch(/href|^on|filter|style/i);
                if (/url\s*\(/i.test(attribute.value)) {
                    expect(attribute.name).toBe('fill');
                    expect(attribute.value).toBe(localFill);
                }
            }
        }
    });
    it('装饰图片预留尺寸、隐藏可访问名称并按需加载，揭晓立即加载', () => {
        const markup = renderToStaticMarkup(<FunStickerArt id="tech-robot" size={72} />);
        const node = new DOMParser().parseFromString(markup, 'text/html').querySelector('img')!;
        expect(node.getAttribute('src')).toBe('/rewards/fun/tech-robot.svg');
        expect(node.getAttribute('alt')).toBe('');
        expect(node.getAttribute('aria-hidden')).toBe('true');
        expect(node.getAttribute('width')).toBe('72');
        expect(node.getAttribute('height')).toBe('72');
        expect(node.getAttribute('draggable')).toBe('false');
        expect(node.getAttribute('loading')).toBe('lazy');
        expect(renderToStaticMarkup(<FunStickerArt id="tech-robot" size={96} loading="eager" />)).toContain('loading="eager"');
    });
});
