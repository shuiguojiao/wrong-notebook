import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/components/error-detail/detail-layout.module.css', 'utf8');

function luminance(hex: string) {
    const rgb = hex.match(/[a-f\d]{2}/gi)!.map(channel => {
        const value = parseInt(channel, 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

describe('详情错答可读性', () => {
    it('浅深纸面的红笔文字均达到 4.5 比 1，保持细删除线与完整不透明度', () => {
        const light = css.match(/wrong"\] dd \{\s*color: (#[a-f\d]+);/)![1];
        const dark = css.match(/:global\(\.dark\).*?wrong"\] dd \{ color: (#[a-f\d]+);/)![1];
        for (const [ink, paper] of [[light, '#ffffff'], [dark, '#1b2940'], [dark, '#181c25']]) {
            const values = [luminance(ink), luminance(paper)].sort((a, b) => b - a);
            expect((values[0] + 0.05) / (values[1] + 0.05)).toBeGreaterThanOrEqual(4.5);
        }
        expect(css).toContain('text-decoration-line: line-through');
        expect(css).toContain('text-decoration-thickness: 1px');
        expect(css).not.toMatch(/opacity\s*:/);
    });
});
