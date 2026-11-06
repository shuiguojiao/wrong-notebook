import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { useEntryDraft } from "@/lib/hooks/use-entry-draft";
import { clearEntryDrafts, entryDraftKey } from "@/lib/import/entry-draft-store";
import { directEntryDraftSchema, EMPTY_DIRECT_ENTRY } from "@/lib/import/direct-entry-draft";

const schema = z.string();
let root: Root;
let host: HTMLDivElement;
let state: ReturnType<typeof useEntryDraft<string>>;
function Harness({ user, scope = "home" }: { user: string; scope?: string }) {
    const draft = useEntryDraft(entryDraftKey(user, scope), "", schema);
    useEffect(() => { state = draft; });
    return <output>{draft[0]}</output>;
}
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    sessionStorage.clear();
    host = document.createElement("div");
    root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); clearEntryDrafts(); });

describe("录入草稿", () => {
    it("卸载后恢复草稿，账号和错题本互相隔离，退出后清空", async () => {
        await act(async () => root.render(<Harness user="a" />));
        await act(async () => state[1]("长题干与公式 $x^2$"));
        await act(async () => root.render(<div />));
        await act(async () => root.render(<Harness user="a" />));
        expect(state[0]).toBe("长题干与公式 $x^2$");
        await act(async () => root.render(<Harness user="b" />));
        expect(state[0]).toBe("");
        await act(async () => root.render(<Harness user="a" scope="math" />));
        expect(state[0]).toBe("");
        await act(async () => root.render(<Harness user="a" />));
        expect(state[0]).toContain("长题干");
        await act(async () => clearEntryDrafts());
        expect(state[0]).toBe("");
    });

    it("损坏的草稿回退为空，禁止存储时仍保留当前页面草稿", async () => {
        sessionStorage.setItem(entryDraftKey("a", "home"), "{invalid");
        await act(async () => root.render(<Harness user="a" />));
        expect(state[0]).toBe("");
        const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceededError"); });
        await act(async () => state[1]("存储不可用时的题目"));
        expect(state[0]).toBe("存储不可用时的题目");
        write.mockRestore();
        await act(async () => state[1](""));
        expect(state[0]).toBe("");
    });

    it("直接录入草稿完整保留答案、错因和标签，拒绝非法字段类型", () => {
        const draft = { ...EMPTY_DIRECT_ENTRY, answerText: "42", mistakeAnalysis: "漏看条件", knowledgePoints: ["方程"], subjectId: "math" };
        expect(directEntryDraftSchema.parse(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
        expect(directEntryDraftSchema.safeParse({ ...draft, knowledgePoints: "方程" }).success).toBe(false);
    });
});
