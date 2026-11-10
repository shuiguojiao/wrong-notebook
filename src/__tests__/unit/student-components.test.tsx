import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import Link from "next/link";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BookOpen } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Highlighter } from "@/components/student/highlighter";
import { KnowledgeSticker } from "@/components/student/knowledge-sticker";
import { NetworkNotice } from "@/components/student/network-notice";
import { NoteCard } from "@/components/student/note-card";
import { PaperCard } from "@/components/student/paper-card";
import { ProgressStamp } from "@/components/student/progress-stamp";
import { StudentSkeleton } from "@/components/student/student-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { FocusCard } from "@/components/ui/focus-card";
import { MoreMenu } from "@/components/ui/more-menu";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { LanguageProvider, loadEnTranslations } from "@/contexts/LanguageContext";

const css = readFileSync(resolve("src/components/student/student.css"), "utf8");
let root: Root;
let container: HTMLDivElement;
let styleElement: HTMLStyleElement;

// jsdom 不执行媒体查询；从真实 CSS 规则选取当前媒体，检查实际选择器的样式契约。
function applyMedia(reducedMotion = false, screen = true) {
    const source = document.createElement("style");
    source.textContent = css;
    document.head.appendChild(source);
    const collect = (rules: CSSRuleList): string[] => [...rules].flatMap(rule => {
        if (rule.type === 4) {
            const media = rule as CSSMediaRule;
            if (media.conditionText.includes("screen") && !screen) return [];
            if (media.conditionText.includes("no-preference") && reducedMotion) return [];
            if (media.conditionText.includes(": reduce)") && !reducedMotion) return [];
            return collect(media.cssRules);
        }
        return rule.type === 1 ? [rule.cssText] : [];
    });
    styleElement.textContent = collect(source.sheet!.cssRules).join("\n");
    source.remove();
}

async function render(children: ReactNode) {
    await act(async () => root.render(<LanguageProvider>{children}</LanguageProvider>));
}

// jsdom 不解析 background 简写中的 CSS 变量，直接核对匹配真实 DOM 的声明及令牌引用。
function backgroundOf(element: Element): string {
    let background = "";
    for (const rule of styleElement.sheet!.cssRules) {
        const styleRule = rule as CSSStyleRule;
        if (element.matches(styleRule.selectorText) && styleRule.style.getPropertyValue("background")) {
            background = styleRule.style.getPropertyValue("background");
        }
    }
    return background;
}

beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    document.documentElement.dataset.ui = "notebook";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    styleElement = document.createElement("style");
    document.head.appendChild(styleElement);
    applyMedia();
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    styleElement.remove();
    delete document.documentElement.dataset.ui;
    vi.unstubAllGlobals();
});

describe.each([["白纸", PaperCard], ["便签", NoteCard]] as const)("%s卡", (_name, Card) => {
    it("渲染内容与可访问名称，胶带不接收点击和焦点，仅装饰层旋转", async () => {
        await render(<Card tape rotation={8} role="region" aria-label="今天的题"><button>开始</button></Card>);
        const card = container.querySelector<HTMLElement>('[role="region"]')!;
        const decoration = container.querySelector<HTMLElement>(".student-paper-decoration")!;
        expect(card.getAttribute("aria-label")).toBe("今天的题");
        expect(decoration.getAttribute("aria-hidden")).toBe("true");
        expect(decoration.style.getPropertyValue("--student-rotation")).toBe("1deg");
        expect(decoration.querySelector(".student-paper-tape")).not.toBeNull();
        expect(decoration.querySelector("button, a, [tabindex]")).toBeNull();
        expect(getComputedStyle(decoration).pointerEvents).toBe("none");
        expect(getComputedStyle(decoration).transform).toContain("rotate(");
        expect(getComputedStyle(card).transform).toBe("none");
        expect(getComputedStyle(container.querySelector("button")!).transform).toBe("none");
        container.querySelector("button")!.focus();
        expect(document.activeElement).toBe(container.querySelector("button"));
    });

    it.each([-8, -1, 0, .5, Number.NaN])("旋转 %s 限幅，胶带可省略", async rotation => {
        await render(<Card rotation={rotation}>正文</Card>);
        const expected = Number.isNaN(rotation) ? 0 : Math.max(-1, rotation);
        expect(container.querySelector<HTMLElement>(".student-paper-decoration")!.style.getPropertyValue("--student-rotation")).toBe(`${expected}deg`);
        expect(container.querySelector(".student-paper-tape")).toBeNull();
    });

    it("简洁风格隐藏装饰，减少动态效果完全关闭旋转，打印也不带装饰", async () => {
        await render(<Card tape rotation={-1}>正文</Card>);
        const decoration = container.querySelector(".student-paper-decoration")!;
        document.documentElement.dataset.ui = "simple";
        expect(getComputedStyle(decoration).display).toBe("none");
        expect(getComputedStyle(decoration).transform).toBe("none");
        expect(container.firstElementChild?.className).toContain("bg-card");
        document.documentElement.dataset.ui = "notebook";
        applyMedia(true);
        expect(getComputedStyle(decoration).transform).toBe("none");
        expect(getComputedStyle(decoration).animation).toBe("none");
        applyMedia(false, false);
        expect(getComputedStyle(decoration).display).toBe("none");
    });
});

describe("知识点贴纸", () => {
    it.each(["english", "math", "chinese", "other"] as const)("%s 科目三态有明确文字，只有缺失态按需提供练习链接", async subject => {
        await render(<>
            <KnowledgeSticker name="同类项" subject={subject} state="earned" />
            <KnowledgeSticker name="绝对值" subject={subject} state="improving" />
            <KnowledgeSticker name="数轴" subject={subject} state="missing" remaining={2} practiceHref="/notebooks?tag=axis" />
        </>);
        const stickers = [...container.querySelectorAll<HTMLElement>(".student-sticker")];
        expect(stickers.map(sticker => sticker.textContent)).toEqual(["同类项已贴上", "绝对值在好转", "数轴还差 2 题"]);
        expect(stickers.every(sticker => sticker.dataset.subject === subject)).toBe(true);
        expect(getComputedStyle(stickers[0]).getPropertyValue("--student-sticker-background")).toBe(`var(--nb-${subject === "other" ? "divider-soft" : subject})`);
        expect(getComputedStyle(stickers[0]).boxShadow).toBe("var(--student-sticker-shadow)");
        expect(backgroundOf(stickers[1])).toBe("color-mix(in srgb, var(--student-sticker-background) 35%, var(--nb-paper))");
        expect(getComputedStyle(stickers[2]).borderStyle).toBe("dashed");
        const link = container.querySelector("a")!;
        expect(link.textContent).toBe("练这个");
        expect(link.getAttribute("href")).toBe("/notebooks?tag=axis");
        expect(link.className).toContain("min-h-11 min-w-11");
        link.focus();
        expect(document.activeElement).toBe(link);
        for (const reduced of [false, true]) {
            applyMedia(reduced);
            document.documentElement.dataset.ui = "simple";
            for (const sticker of stickers) {
                expect(sticker.className).toContain("bg-secondary");
                expect(getComputedStyle(sticker).boxShadow).toBe("none");
                expect(getComputedStyle(sticker).transform).toBe("none");
            }
            document.documentElement.dataset.ui = "notebook";
        }
    });

    it("没有练习地址时不生成空链接", async () => {
        await render(<KnowledgeSticker name="数轴" state="missing" remaining={2} />);
        expect(container.querySelector("a")).toBeNull();
    });
});

describe("进步印章", () => {
    it("三种结果都有可访问名称，彩色边框与墨色文字分离", async () => {
        await render(<><ProgressStamp variant="streak" days={7} /><ProgressStamp variant="correct" /><ProgressStamp variant="almost" /></>);
        const stamps = [...container.querySelectorAll<HTMLElement>('[role="img"]')];
        expect(stamps.map(stamp => stamp.getAttribute("aria-label"))).toEqual(["连续 7 天", "做对了", "差一点"]);
        expect(stamps[1].textContent).toBe("✓");
        expect(stamps.every(stamp => getComputedStyle(stamp).color === "var(--nb-ink)")).toBe(true);
        expect(stamps.every(stamp => stamp.querySelector('[aria-hidden="true"]'))).toBe(true);
        const decorations = stamps.map(stamp => stamp.querySelector(".student-stamp-decoration")!);
        expect(decorations.every(decoration => getComputedStyle(decoration).animation.includes("student-stamp-in"))).toBe(true);
        applyMedia(true);
        expect(decorations.every(decoration => getComputedStyle(decoration).animation === "none" && getComputedStyle(decoration).transform === "none")).toBe(true);
        document.documentElement.dataset.ui = "simple";
        applyMedia();
        expect(decorations.every(decoration => getComputedStyle(decoration).display === "none" && getComputedStyle(decoration).animation === "")).toBe(true);
        expect(stamps.every(stamp => stamp.className.includes("bg-secondary"))).toBe(true);
    });
});

describe("荧光笔", () => {
    it("黄绿行内高亮均保留文字，简洁样式退化为普通语义高亮，始终无动态效果", async () => {
        await render(<p><Highlighter>今天</Highlighter><Highlighter color="green">正确答案</Highlighter></p>);
        const marks = [...container.querySelectorAll("mark")];
        expect(marks.map(mark => mark.textContent)).toEqual(["今天", "正确答案"]);
        expect(marks.map(backgroundOf)).toEqual(["var(--nb-highlight)", "var(--nb-highlight-green)"]);
        for (const style of ["simple", "notebook"]) {
            document.documentElement.dataset.ui = style;
            applyMedia(true);
            expect(marks.every(mark => getComputedStyle(mark).transform === "none" && getComputedStyle(mark).animation === "")).toBe(true);
        }
        document.documentElement.dataset.ui = "simple";
        expect(marks.every(mark => mark.className.includes("bg-muted") && backgroundOf(mark) === "")).toBe(true);
    });
});

describe("骨架占位", () => {
    it("行、块、数字三种形状均有加载名称，不显示数字 0，减少动态效果时停止闪动", async () => {
        await render(<><StudentSkeleton /><StudentSkeleton variant="block" label="整理今天的题" /><StudentSkeleton variant="number" /></>);
        const statuses = [...container.querySelectorAll('[role="status"]')];
        expect(statuses.map(status => status.getAttribute("aria-label"))).toEqual(["加载中...", "整理今天的题", "加载中..."]);
        expect(statuses.every(status => status.getAttribute("aria-busy") === "true")).toBe(true);
        expect(container.textContent).toBe("");
        const shapes = [...container.querySelectorAll<HTMLElement>(".student-skeleton-shape")];
        expect(shapes.map(shape => shape.dataset.skeleton)).toEqual(["line", "block", "number"]);
        for (const style of ["simple", "notebook"]) {
            document.documentElement.dataset.ui = style;
            applyMedia();
            expect(shapes.every(shape => getComputedStyle(shape).animation.includes("student-skeleton-pulse"))).toBe(true);
            applyMedia(true);
            expect(shapes.every(shape => getComputedStyle(shape).animation === "none")).toBe(true);
            expect(shapes.every(shape => shape.className.includes("bg-muted"))).toBe(true);
        }
    });
});

describe("网络提示", () => {
    it.each(["notebook", "simple"])("%s 风格有错误说明、重试按钮及回今天出口，重试中禁用按钮", async style => {
        document.documentElement.dataset.ui = style;
        const retry = vi.fn();
        await render(<NetworkNotice onRetry={retry} />);
        expect(container.querySelector('[role="alert"]')?.textContent).toBe("网络开小差了，过一会儿再试");
        const button = container.querySelector("button")!;
        expect(button.textContent).toBe("重新加载");
        expect(button.className).toContain("min-h-11 min-w-11");
        button.focus();
        expect(document.activeElement).toBe(button);
        await act(async () => button.click());
        expect(retry).toHaveBeenCalledOnce();
        const link = container.querySelector("a")!;
        expect(link.textContent).toBe("回今天");
        expect(link.getAttribute("href")).toBe("/");
        expect(container.querySelectorAll('svg:not([aria-hidden="true"])')).toHaveLength(0);
        applyMedia(true);
        expect(getComputedStyle(container.querySelector(".student-paper-decoration")!).transform).toBe("none");
        await render(<NetworkNotice onRetry={retry} retrying />);
        expect(button.disabled).toBe(true);
        expect(button.getAttribute("aria-busy")).toBe("true");
        await act(async () => button.click());
        expect(retry).toHaveBeenCalledOnce();
    });
});

describe("复用基础组件的学生变体", () => {
    it.each(["simple", "notebook"])("%s 下空态、专注卡、分段与 Portal 菜单保持原有操作", async style => {
        document.documentElement.dataset.ui = style;
        const close = vi.fn();
        const change = vi.fn();
        const edit = vi.fn();
        await render(<>
            <EmptyState variant="student" icon={BookOpen} title="没有题目" description="明天继续" action={<Link href="/">回今天</Link>} />
            <FocusCard variant="student" title="复习" progress={50} onClose={close}>正文</FocusCard>
            <SegmentedControl variant="student" aria-label="科目" options={[{ value: "one", label: "一" }, { value: "two", label: "二" }]} value="one" onChange={change} />
            <MoreMenu variant="student" items={[{ label: "编辑", onClick: edit }]} />
        </>);
        expect(container.querySelector(".student-empty")?.textContent).toContain("没有题目明天继续回今天");
        expect(container.querySelector(".student-empty svg")?.getAttribute("aria-hidden")).toBe("true");
        expect(container.querySelector(".student-focus")?.textContent).toBe("正文");
        await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="关闭"]')!.click());
        expect(close).toHaveBeenCalledOnce();
        const tab = container.querySelector<HTMLButtonElement>('[role="tab"]')!;
        await act(async () => tab.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
        expect(change).toHaveBeenCalledWith("two");
        expect(document.activeElement?.textContent).toBe("二");
        await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="更多"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
        const menu = document.querySelector<HTMLElement>(".student-menu")!;
        expect(menu.getAttribute("role")).toBe("menu");
        expect(container.contains(menu)).toBe(false);
        expect(getComputedStyle(menu).boxShadow).toBe(style === "notebook" ? "var(--nb-shadow-menu)" : "none");
        applyMedia(true);
        expect(getComputedStyle(menu).animation).toBe("none");
        expect(getComputedStyle(container.querySelector(".student-focus")!).transform).toBe("none");
        await act(async () => document.querySelector<HTMLElement>('[role="menuitem"]')!.click());
        expect(edit).toHaveBeenCalledOnce();
        await render(<><EmptyState icon={BookOpen} title="默认" /><FocusCard title="默认" progress={0} onClose={close}>内容</FocusCard><SegmentedControl options={[{ value: "one", label: "一" }]} value="one" onChange={change} /></>);
        expect(container.querySelector(".student-empty, .student-focus, .student-segmented")).toBeNull();
    });
});

it("英文反馈、占位与操作名称与中文语义一致", async () => {
    await loadEnTranslations();
    localStorage.setItem("app-language", "en");
    await render(<>
        <KnowledgeSticker name="Axis" state="missing" remaining={3} practiceHref="/notebooks" />
        <KnowledgeSticker name="Terms" state="earned" /><KnowledgeSticker name="Values" state="improving" />
        <ProgressStamp variant="streak" days={5} /><ProgressStamp variant="correct" /><ProgressStamp variant="almost" />
        <StudentSkeleton /><NetworkNotice onRetry={vi.fn()} />
    </>);
    expect(container.textContent).toContain("Axis3 questions to masterPractice this");
    expect(container.textContent).toContain("TermsEarnedValuesImproving");
    expect([...container.querySelectorAll('[role="img"]')].map(stamp => stamp.getAttribute("aria-label"))).toEqual(["5-day streak", "Got it right", "Almost there"]);
    expect(container.querySelector('[role="status"]')?.getAttribute("aria-label")).toBe("Loading...");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("The network is taking a little break. Try again in a moment.");
    expect(container.querySelector("button")?.textContent).toBe("Reload");
    expect(container.querySelector('a[href="/"]')?.textContent).toBe("Back to today");
});
