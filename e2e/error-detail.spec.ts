import { test, expect, type Page } from './support/fixtures';
import { ADMIN_PASSWORD } from './helpers';

async function login(page: Page) {
    const hydrated = page.waitForResponse((response) => response.url().endsWith('/api/register/status'));
    await page.goto('/login');
    await hydrated;
    await page.getByLabel(/邮箱|Email/).fill('admin@localhost');
    await page.getByLabel(/^密码$|^Password$/).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /登录|Login/ }).click();
    await page.waitForURL('**/', { timeout: 15000 });
}

async function edit(page: Page) {
    await page.getByRole('button', { name: '更多', exact: true }).click();
    await page.getByRole('menuitem', { name: '编辑题目', exact: true }).click();
}

test('错题详情页显示各区块，编辑后保存并在刷新后保留', async ({ page }) => {
    test.setTimeout(60000);
    await login(page);

    // 通过接口准备错题本和错题，避免依赖 AI 识别。
    // 用物理学科：其他用例按「数学」查找错题本，名称匹配为子串匹配，不能出现「数学」字样
    const notebookRes = await page.request.post('/api/notebooks', {
        data: { name: `详情页测试-${Date.now()}`, stage: 'junior_high', subjectKey: 'physics' },
    });
    expect(notebookRes.ok()).toBeTruthy();
    const notebook = await notebookRes.json();
    const itemRes = await page.request.post('/api/error-items', {
        data: {
            subjectId: notebook.id,
            questionText: `匀速运动的物体 ${Date.now() % 1000} 秒内通过的路程`,
            answerText: 's = vt',
            analysis: '路程等于速度乘以时间。',
            knowledgePoints: ['匀速直线运动'],
        },
    });
    expect(itemRes.ok()).toBeTruthy();
    const item = await itemRes.json();

    await page.goto(`/error-items/${item.id}`);
    await expect(page.getByRole('region', { name: '题目', exact: true })).toBeVisible({ timeout: 15000 });
    const question = page.getByRole('region', { name: '题目', exact: true });
    await expect(question).toContainText('匀速运动的物体');
    await expect(question).toContainText('匀速直线运动');
    await expect(page.getByRole('region', { name: '正确答案', exact: true })).toContainText('s = vt');
    await expect(page.getByRole('tabpanel')).toContainText('路程等于速度乘以时间。');
    await page.getByRole('tab', { name: '笔记', exact: true }).click();
    await expect(page.getByRole('tabpanel')).toContainText('暂无，点编辑补充');

    // 年级、笔记与答案在统一编辑模式一次保存。
    await edit(page);
    await page.getByRole('combobox', { name: '年级/学期' }).selectOption('高二下');
    await page.getByLabel('笔记', { exact: true }).fill('注意单位换算');
    await page.getByLabel('正确答案', { exact: true }).fill('s = vt，单位为米');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('form', { name: '编辑错题' })).toHaveCount(0);
    await expect(question).toContainText('高二下');

    // 有改动时先拒绝放弃，再确认取消，原解析保留。
    await edit(page);
    await page.getByLabel('解析', { exact: true }).fill('不应保存的内容');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    const confirm = page.getByRole('dialog');
    await expect(confirm).toContainText('有未保存的修改');
    await confirm.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.getByLabel('解析', { exact: true })).toHaveValue('不应保存的内容');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '确认', exact: true }).click();

    await page.reload();
    await expect(question).toContainText('高二下', { timeout: 15000 });
    await expect(page.getByRole('tabpanel')).toContainText('路程等于速度乘以时间。');
    await page.getByRole('tab', { name: '笔记', exact: true }).click();
    await expect(page.getByRole('tabpanel')).toContainText('注意单位换算');
    await expect(page.getByRole('region', { name: '正确答案', exact: true })).toContainText('s = vt，单位为米');
    expect((await (await page.request.get(`/api/error-items/${item.id}`)).json()).gradeSemester).toBe('高二下');

    // 删除本用例创建的错题和错题本（错题本须为空才能删除），不影响其他用例
    expect((await page.request.delete(`/api/error-items/${item.id}/delete`)).ok()).toBeTruthy();
    expect((await page.request.delete(`/api/notebooks/${notebook.id}`)).ok()).toBeTruthy();
});
