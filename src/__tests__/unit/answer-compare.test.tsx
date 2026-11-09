import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnswerCompare } from "@/components/question/answer-compare";
import { LanguageProvider } from "@/contexts/LanguageContext";

describe("竖排答案对照", () => {
    it("四种行类型对应蓝红绿红色条，默认标签完整且固定列宽", () => {
        const markup = renderToStaticMarkup(<LanguageProvider><AnswerCompare rows={[
            { kind: "mine", content: "**本次作答**" },
            { kind: "previous", content: "上次作答" },
            { kind: "standard", content: "$x=2$" },
            { kind: "wrong", content: "过去错答" },
        ]} /></LanguageProvider>);
        const container = document.createElement("div");
        container.innerHTML = markup;
        const rows = container.querySelectorAll("[data-kind]");
        expect([...container.querySelectorAll("dt")].map(node => node.textContent)).toEqual(["你的答案", "上次错答", "标准答案", "我的错答"]);
        for (const [index, color] of ["blue-500", "red-500", "green-600", "red-500"].entries()) {
            expect(rows[index].className).toContain(`border-l-${color}`);
            expect(rows[index].className).toContain("border-l-[3px]");
            expect(rows[index].className).toContain("grid-cols-[5rem_minmax(0,1fr)]");
            expect(rows[index].className).toContain("dark:border-l-");
        }
        expect(container.querySelector("strong")?.textContent).toBe("本次作答");
        expect(container.querySelector(".katex")).toBeTruthy();
    });

    it("空行显示占位，自定义标签优先，只有图片的行不显示占位", () => {
        const markup = renderToStaticMarkup(<LanguageProvider><AnswerCompare rows={[
            { kind: "mine", label: "手写答案", image: "/answer.png", content: " " },
            { kind: "previous", content: "\n" },
            { kind: "standard", label: "  ", content: null },
        ]} /></LanguageProvider>);
        const container = document.createElement("div");
        container.innerHTML = markup;
        expect(container.querySelector("dt")?.textContent).toBe("手写答案");
        expect(container.querySelector("img")?.getAttribute("alt")).toBe("手写答案");
        expect(container.querySelector("button")?.getAttribute("aria-label")).toBe("查看图片 · 手写答案");
        expect(container.querySelector('[data-kind="mine"]')?.textContent).not.toContain("暂无答案");
        expect(container.querySelector('[data-kind="previous"]')?.textContent).toContain("暂无答案");
        expect(container.querySelector('[data-kind="standard"]')?.textContent).toBe("标准答案暂无答案");
    });

    it("同一行同时显示 Markdown 和答案图片", () => {
        const markup = renderToStaticMarkup(<LanguageProvider><AnswerCompare rows={[
            { kind: "mine", content: "**解题过程**", image: "/answer.png" },
        ]} /></LanguageProvider>);
        expect(markup).toContain("<strong");
        expect(markup).toContain('src="/answer.png"');
        expect(markup).not.toContain("暂无答案");
    });
    it("plain 只保留三行色条，默认 card 仍有完整外框", () => {
        for (const variant of ["card", "plain"] as const) {
            const container = document.createElement("div");
            container.innerHTML = renderToStaticMarkup(<LanguageProvider><AnswerCompare variant={variant} rows={[
                { kind: "mine", content: "当前答案" }, { kind: "previous", content: "上次答案" }, { kind: "standard", content: "标准答案" },
            ]} /></LanguageProvider>);
            const list = container.querySelector("dl")!;
            for (const name of ["border", "rounded-xl", "p-4", "shadow-xs"]) expect(list.classList.contains(name)).toBe(variant === "card");
            expect(container.querySelectorAll("[data-kind]")).toHaveLength(3);
            expect(container.querySelector("[data-kind=mine]")?.className).toContain("border-l-blue-500");
        }
    });

});
