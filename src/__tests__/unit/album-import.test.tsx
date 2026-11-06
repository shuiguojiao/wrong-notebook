import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { useAlbumImport } from "@/lib/hooks/use-album-import";
import { translations } from "@/lib/translations";

const dispose = vi.hoisted(() => vi.fn());
vi.mock("@/lib/image-pipeline", () => ({
    prepareImage: vi.fn(async () => ({ dispose })),
    ImageDecodeError: class extends Error {},
}));
vi.mock("@/lib/import/question-import-flow", () => ({ renderRegions: vi.fn(async () => [{ dataUrl: "data:image/jpeg;base64,test" }]) }));
vi.mock("@/lib/feedback", () => ({ toast: { warning: vi.fn(), error: vi.fn() } }));

describe("多照片处理方式", () => {
    for (const mode of ["single", "pages"] as const) {
        it(`${mode} 选择前不提交，选择后逐张走对应路径并释放图片`, async () => {
            vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
            const uploadImage = vi.fn(async () => ({ id: "task" }));
            const uploadPage = vi.fn(async () => ({ id: "batch" }));
            const root = createRoot(document.createElement("div"));
            let album: ReturnType<typeof useAlbumImport>;
            function Harness() {
                const current = useAlbumImport({ t: translations.zh, partCount: 0, setAnalysisStep: vi.fn(), uploadImage, uploadPage });
                useEffect(() => { album = current; });
                return null;
            }
            try {
                await act(async () => root.render(<Harness />));
                await act(async () => album!.selectImages([new File(["a"], "a.jpg"), new File(["b"], "b.jpg")]));
                expect(uploadImage).not.toHaveBeenCalled();
                expect(uploadPage).not.toHaveBeenCalled();
                expect(album!.pendingFiles).toHaveLength(2);
                await act(async () => album!.submitAlbum(mode));
                expect(mode === "single" ? uploadImage : uploadPage).toHaveBeenCalledTimes(2);
                expect(mode === "single" ? uploadPage : uploadImage).not.toHaveBeenCalled();
                expect(album!.submittedCount).toBe(2);
                expect(album!.pendingFiles).toHaveLength(0);
                expect(album!.processing).toBe(false);
                expect(dispose).toHaveBeenCalledTimes(2);
            } finally { await act(async () => root.unmount()); }
        });
    }
});
