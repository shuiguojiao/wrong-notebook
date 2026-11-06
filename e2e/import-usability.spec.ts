import { resolve } from "node:path";
import { expect, test } from "./support/fixtures";
import { expectNoHorizontalOverflow } from "./support/batch-flows";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("会话未就绪时不开放录入，会话加载后输入保持不变", async ({ page, scenario }) => {
    await scenario.login(page);
    let release: () => void = () => {};
    const ready = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/auth/session", async (route) => { await ready; await route.continue(); });
    await page.goto(`/?notebook=${scenario.book.id}`);
    await expect(page.getByRole("tab", { name: "文字", exact: true })).toHaveCount(0);
    release();
    await page.getByRole("tab", { name: "文字", exact: true }).click();
    await page.getByRole("tab", { name: "已有答案", exact: true }).click();
    await page.locator("#direct-questionText").fill(`会话就绪后的题干 ${scenario.marker}`);
    await expect(page.getByRole("button", { name: "直接保存", exact: true })).toBeEnabled();
    await page.getByRole("tab", { name: "图片", exact: true }).click();
    await page.getByRole("tab", { name: "文字", exact: true }).click();
    await expect(page.locator("#direct-questionText")).toHaveValue(`会话就绪后的题干 ${scenario.marker}`);
});

test("录入入口切换保留文字和文件摘要，刷新恢复直接录入草稿", async ({ page, scenario }, testInfo) => {
    await scenario.login(page);
    await page.goto(`/notebooks/${scenario.book.id}/add`);
    await expect(page.getByRole("tab", { name: "文件", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "文字", exact: true }).click();
    const text = `尚未提交的文字题 ${scenario.marker}`;
    await page.locator("#question-text").fill(text);
    await page.getByRole("tab", { name: "文件", exact: true }).click();
    await page.locator('[data-entry-panel="file"] input[type="file"]').setInputFiles({
        name: "draft.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ questions: [{ text: "计算 2+3", answer: "5" }] })),
    });
    await expect(page.getByTestId("file-import-summary")).toContainText("draft.json");
    await page.getByRole("tab", { name: "文字", exact: true }).click();
    await expect(page.locator("#question-text")).toHaveValue(text);
    await page.getByRole("tab", { name: "文件", exact: true }).click();
    await expect(page.getByTestId("file-import-summary")).toContainText("共解析出 1 道题");
    await page.getByRole("tab", { name: "文字", exact: true }).click();
    await page.getByRole("tab", { name: "已有答案", exact: true }).click();
    await page.locator("#direct-questionText").fill(`直接录入草稿 ${scenario.marker}`);
    await page.locator("#direct-answerText").fill("保留参考答案");
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("mobile-direct-entry.png"), fullPage: true });
    await page.reload();
    await page.getByRole("tab", { name: "文字", exact: true }).click();
    await expect(page.locator("#question-text")).toHaveValue(text);
    await page.getByRole("tab", { name: "已有答案", exact: true }).click();
    await expect(page.locator("#direct-answerText")).toHaveValue("保留参考答案");
    expect(await scenario.db.errorItem.count({ where: { userId: scenario.user.id } })).toBe(0);
});

test("文件在文字入口自动接续，编辑预览不重置原样保存模式", async ({ page, scenario }) => {
    await scenario.login(page);
    await page.goto(`/notebooks/${scenario.book.id}/add`);
    await page.getByRole("tab", { name: "文字", exact: true }).click();
    await page.locator('[data-entry-panel="text"] input[type="file"]').setInputFiles({
        name: "answer.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ questions: [{ text: `计算长方形面积 ${scenario.marker}`, answer: "35" }] })),
    });
    await expect(page.getByRole("tab", { name: "文件", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("file-import-summary")).toContainText("answer.json");
    await page.getByRole("button", { name: "下一步：预览 1 题" }).click();
    await expect(page.getByTestId("draft-analysis-none")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("draft-analysis-none").click();
    const item = page.getByTestId("draft-item").first();
    await item.getByRole("button", { name: "编辑", exact: true }).click();
    await item.locator("textarea").first().fill(`已校对长方形面积 ${scenario.marker}`);
    await expect(page.getByTestId("draft-analysis-none")).toHaveAttribute("aria-checked", "true");
    await item.getByRole("button", { name: "完成", exact: true }).click();
    await page.getByRole("button", { name: "按原样导入 1 题", exact: true }).click();
    await expect(page.getByTestId("batch-progress")).toHaveAttribute("data-phase", "done");
    const saved = await scenario.db.errorItem.findMany({ where: { userId: scenario.user.id } });
    expect(saved).toHaveLength(1);
    expect(saved[0].questionText).toContain("已校对长方形面积");
    expect(saved[0].subjectId).toBe(scenario.book.id);
    expect((await scenario.model()).calls).toHaveLength(0);
});

test("多张整页照片先选择处理方式，再创建可预览的分题批次", async ({ page, scenario }) => {
    await scenario.login(page);
    await page.goto(`/notebooks/${scenario.book.id}/add`);
    const photo = resolve("src/__tests__/fixtures/images/multi-question-page.jpg");
    await page.getByTestId("album-input").setInputFiles([photo, photo]);
    await expect(page.getByRole("heading", { name: "已选择 2 张照片" })).toBeVisible();
    expect(await scenario.db.importTask.count({ where: { userId: scenario.user.id } })).toBe(0);
    await page.getByRole("button", { name: "每张含多题，自动分题" }).click();
    await expect(page.getByTestId("album-submitted")).toContainText("已提交 2 张");
    await expect.poll(() => scenario.db.importBatch.count({ where: { userId: scenario.user.id, source: "image" } })).toBe(2);
    await page.getByRole("link", { name: "查看识别任务与分题预览" }).click();
    await expect.poll(async () => (await scenario.model()).calls.filter((call) => call.operation === "split").length).toBe(2);
    expect(await scenario.db.errorItem.count({ where: { userId: scenario.user.id } })).toBe(0);
});
