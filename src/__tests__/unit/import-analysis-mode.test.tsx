import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useImportAnalysisMode } from "@/lib/hooks/use-import-analysis-mode";

it("有答案默认原样保存；用户选定后，编辑、勾选和刷新草稿不会改回 AI", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const root = createRoot(document.createElement("div"));
    let choice: ReturnType<typeof useImportAnalysisMode>;
    function Harness({ id, answered }: { id: string; answered: boolean | null }) {
        const current = useImportAnalysisMode(id, answered);
        useEffect(() => { choice = current; });
        return <output>{current[0]}</output>;
    }
    try {
        await act(async () => root.render(<Harness id="batch-a" answered={null} />));
        await act(async () => root.render(<Harness id="batch-a" answered />));
        expect(choice![0]).toBe("none");
        await act(async () => root.render(<Harness id="batch-a" answered={false} />));
        expect(choice![0]).toBe("none");
        await act(async () => choice![1]("none"));
        await act(async () => root.render(<Harness id="batch-a" answered={false} />));
        expect(choice![0]).toBe("none");
        await act(async () => choice![1]("tags"));
        await act(async () => root.render(<Harness id="batch-a" answered />));
        expect(choice![0]).toBe("tags");
        await act(async () => root.render(<Harness id="batch-b" answered={false} />));
        expect(choice![0]).toBe("ai");
    } finally { await act(async () => root.unmount()); }
});
