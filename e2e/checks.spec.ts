import { test, expect } from "./support/fixtures";
import { directEntry, viewports } from "./support/flows";

for (const profile of viewports) {
    test.describe(`需要看一眼 ${profile.name}`, () => {
        test.use({ viewport: profile.viewport, isMobile: profile.isMobile, hasTouch: profile.hasTouch });
        test("导入后通过入口核对，处理完成后入口消失", async ({ page, scenario }) => {
            await scenario.login(page);
            // 缺图规则同步产生真实检查记录，无需等待或依赖外部 AI。
            const saved = await directEntry(page, scenario, `如图，求三角形面积。${scenario.marker}`);
            await page.goto("/");
            await page.getByRole("button", { name: "1 道题需要看一眼", exact: true }).click();
            await expect(page).toHaveURL(/\/checks$/);
            await expect(page.getByRole("button", { name: "补原图", exact: true })).toBeVisible();
            await page.getByRole("button", { name: "没问题", exact: true }).click();
            await expect(page.getByRole("heading", { name: "都处理好了", exact: true })).toBeVisible();
            const item = await scenario.db.errorItem.findUniqueOrThrow({ where: { id: saved.id } });
            expect(JSON.parse(item.checkIssues!)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "missing_figure", dismissed: true })]));
            await page.getByRole("button", { name: "返回上一页", exact: true }).click();
            await expect(page.getByRole("button", { name: /道题需要看一眼/ })).toHaveCount(0);
        });
    });
}
