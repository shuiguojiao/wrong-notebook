import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CheckHint } from "@/components/correction-editor/check-hint";
import { zh } from "@/lib/i18n/zh";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ t: zh }) }));

describe("校对题卡实时规则提示", () => {
    it("当前编辑内容缺图时显示黄色提示和补图文字入口", () => {
        const html = renderToStaticMarkup(<CheckHint question={{ questionText: "如图，求面积" }} />);
        expect(html).toContain(zh.questionCheck.missingFigure);
        expect(html).toContain(zh.questionCheck.addImageHint);
        expect(html).toContain('role="status"');
        expect(html).toContain("text-amber-800");
    });
    it("编辑后取消图形引用、添加配图或补原图，提示立即消失", () => {
        for (const question of [{ questionText: "计算面积" }, { questionText: "如图", figureSvg: "<svg />" }, { questionText: "如图", originalImageUrl: "image" }]) {
            expect(renderToStaticMarkup(<CheckHint question={question} />)).toBe("");
        }
    });
    it("仅后台问题不改变界面", () => {
        expect(renderToStaticMarkup(<CheckHint question={{ questionText: "请选择", questionType: "single_choice", answerText: "" }} />)).toBe("");
    });
});
