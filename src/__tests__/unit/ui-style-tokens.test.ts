import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve("src/app/globals.css"), "utf8");
const tokensOf = (selector: string) => {
    const block = css.slice(css.indexOf(selector)).split("}")[0];
    return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2]]));
};
const light = tokensOf(':root[data-ui="notebook"] {');
const dark = { ...light, ...tokensOf(':root[data-ui="notebook"].dark {') };

function color(tokens: Record<string, string>, key: string): number[] {
    const value = tokens[key];
    if (value.startsWith("var(")) return color(tokens, value.slice(4, -1));
    if (value.startsWith("#")) return value.slice(1).match(/../g)!.map((part) => parseInt(part, 16) / 255);
    const [r, g, b, a] = value.match(/[\d.]+/g)!.map(Number);
    return [r / 255, g / 255, b / 255, a];
}

function over(foreground: number[], background: number[]): number[] {
    const alpha = foreground[3] ?? 1;
    return background.slice(0, 3).map((channel, index) => foreground[index] * alpha + channel * (1 - alpha));
}

function contrast(a: number[], b: number[]): number {
    const luminance = (rgb: number[]) => rgb.slice(0, 3)
        .map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
        .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + .05) / (low + .05);
}

describe.each([["浅色", light], ["深色", dark]] as const)("手账%s令牌可读性", (_name, tokens) => {
    it.each([
        ["ink", "paper"], ["ink", "background"], ["muted", "background"],
        ["muted", "paper"], ["muted", "divider-soft"], ["secondary-ink", "paper"],
        ["note-ink", "note"], ["note-muted", "note"], ["note-ink", "highlight"],
        ["ink", "highlight-green"], ["english-ink", "english"],
        ["math-ink", "math"], ["chinese-ink", "chinese"], ["link", "paper"],
        ["primary-foreground", "primary"], ["destructive", "paper"], ["success", "paper"],
        ["orange-ink", "paper"], ["ink", "divider-soft"], ["link-hover", "paper"],
    ])("%s 文字在 %s 上达到 4.5:1", (foreground, background) => {
        expect(contrast(color(tokens, `--nb-${foreground}`), color(tokens, `--nb-${background}`))).toBeGreaterThanOrEqual(4.5);
    });

    it("透明顶栏和正确答案淡底合成后仍能阅读正文和辅助字", () => {
        for (const surface of ["header-glass", "cover-glass", "answer-wash", "white-wash"]) {
            for (const base of ["background", "paper"]) {
                const background = over(color(tokens, `--nb-${surface}`), color(tokens, `--nb-${base}`));
                for (const foreground of ["ink", "muted"]) {
                    expect(contrast(color(tokens, `--nb-${foreground}`), background)).toBeGreaterThanOrEqual(4.5);
                }
            }
        }
    });

    it("四科在好转贴纸混合纸色后，墨色文字仍达到 4.5:1", () => {
        for (const subject of ["english", "math", "chinese", "divider-soft"]) {
            const background = over([...color(tokens, `--nb-${subject}`), .35], color(tokens, "--nb-paper"));
            expect(contrast(color(tokens, "--nb-ink"), background)).toBeGreaterThanOrEqual(4.5);
        }
    });

    it("已有危险按钮白字在实际透明背景上仍达到 4.5:1", () => {
        const destructive = color(tokens, "--nb-destructive");
        for (const base of ["background", "paper"]) {
            const background = over([...destructive, _name === "深色" ? .6 : .9], color(tokens, `--nb-${base}`));
            expect(contrast([1, 1, 1], background)).toBeGreaterThanOrEqual(4.5);
        }
    });
});
