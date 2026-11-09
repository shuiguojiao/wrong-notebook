import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuestionMeta } from "@/components/question/question-meta";
import { LanguageProvider } from "@/contexts/LanguageContext";

describe("题目元信息", () => {
    it("按顺序渲染片段并复用只读星级", () => {
        const markup = renderToStaticMarkup(<LanguageProvider>
            <QuestionMeta questionType="填空题" grade="七年级上" difficulty={2} wrongCount={3} fragments={["自定义文字"]} />
        </LanguageProvider>);
        const container = document.createElement("div");
        container.innerHTML = markup;
        expect(container.textContent).toBe("填空题·七年级上··错过 3 次·自定义文字");
        expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(9);
        expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe("难度：2 星");
        expect(container.querySelectorAll(".fill-amber-400")).toHaveLength(2);
        expect(container.firstElementChild?.className).toContain("text-[13px]");
        expect(container.firstElementChild?.className).toContain("text-muted-foreground");
        expect(container.querySelector("button")).toBeNull();
    });

    it("跳过空白片段、未评级与缺失次数，不留多余分隔符", () => {
        const markup = renderToStaticMarkup(<LanguageProvider>
            <QuestionMeta questionType="  " difficulty={0} fragments={[null, "  年级  ", undefined, "", "知识点"]} />
        </LanguageProvider>);
        const container = document.createElement("div");
        container.innerHTML = markup;
        expect(container.textContent).toBe("年级·知识点");
        expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
    });

    it("全空时不渲染，零次仍是有效片段", () => {
        expect(renderToStaticMarkup(<LanguageProvider><QuestionMeta /></LanguageProvider>)).toBe("");
        expect(renderToStaticMarkup(<LanguageProvider><QuestionMeta wrongCount={0} /></LanguageProvider>)).toContain("错过 0 次");
    });
});
