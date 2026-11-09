// @vitest-environment node
import type { PrismaClient, User } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentTestDatabase } from '@/__tests__/helpers/agent-database';
import type { CompletionRequest } from '@/lib/ai/base-provider';
import { integrityMatch } from '@/__tests__/fixtures/integrity';

const state = vi.hoisted(() => ({
    client: undefined as unknown as PrismaClient,
    complete: vi.fn<(request: CompletionRequest) => Promise<string>>(),
    config: { aiProvider: 'openai', integrityCheckEnabled: true, integrityCheckModel: '', aiDailyLimit: 0, aiMonthlyTokenLimit: 0, timeZone: 'Asia/Shanghai' },
}));
vi.unmock('@/lib/question/integrity-queue');
vi.unmock('@/lib/ai-consent-store');
vi.mock('@/lib/prisma', () => ({ prisma: new Proxy({}, { get(_target, key) {
    const value = Reflect.get(state.client, key);
    return typeof value === 'function' ? value.bind(state.client) : value;
} }) }));
vi.mock('@/lib/config', () => ({ getAppConfig: () => state.config, getAppTimeZone: () => state.config.timeZone }));
vi.mock('@/lib/ai', () => ({ getIntegrityAIService: () => ({ service: new MockProvider(), model: state.config.integrityCheckModel || 'recognition-model' }) }));
import { BaseAIProvider } from '@/lib/ai/base-provider';
import { createAgentErrorItems } from '@/lib/agent/service';
import { updateAgentErrorItem } from '@/lib/agent/mutations';
import { agentItemRevision, loadAgentItem } from '@/lib/agent/queries';
import { listBackgroundTasks, resetBackgroundTasksForTest } from '@/lib/background-tasks';
import { parseCheckIssues } from '@/lib/question/check-store';
import { scheduleIntegrityCheck, resetIntegrityQueueForTest } from '@/lib/question/integrity-queue';
import { saveSourcePage } from '@/lib/source-page';
import { PNG } from 'pngjs';

class MockProvider extends BaseAIProvider {
    protected readonly providerName = 'OpenAI';
    protected async complete(request: CompletionRequest) {
        const text = await state.complete(request);
        await this.reportCompletion({ model: 'actual-vision-model', usage: { prompt_tokens: 1500, completion_tokens: 340 } }, 'vision-model', 'integrity-check');
        return text;
    }
}
let database: ReturnType<typeof createAgentTestDatabase>;
let user: User;
let notebookId: string;
const bytes = PNG.sync.write(new PNG({ width: 80, height: 100 }));
const image = { base64: bytes.toString('base64'), mimeType: 'image/png' };
const different = { ...integrityMatch, text_diffs: [{ image_says: 'kěn', text_says: 'kě', severity: 'major' }] };

beforeAll(() => { database = createAgentTestDatabase(); state.client = database.client; });
afterAll(async () => { await database.dispose(); });
beforeEach(async () => {
    resetIntegrityQueueForTest(); resetBackgroundTasksForTest();
    Object.assign(state.config, { integrityCheckEnabled: true, integrityCheckModel: '', aiDailyLimit: 0, aiMonthlyTokenLimit: 0 });
    state.complete.mockReset().mockResolvedValue(JSON.stringify(different));
    user = await state.client.user.create({ data: { email: `integrity-${await state.client.user.count()}@example.com`, password: 'test-only', aiDataConsentAt: new Date(), questionDuplicateThreshold: 100 } });
    notebookId = (await state.client.subject.create({ data: { userId: user.id, name: '语文', subjectKey: 'chinese' } })).id;
});
afterEach(() => { resetIntegrityQueueForTest(); });
async function create(withImage = true, withSource = false) {
    const response = await createAgentErrorItems(user, { items: [{ notebookId, questionText: 'kě（ ）求',
        ...(withSource ? { sourcePage: { page: image, regions: [{ x: 0.1, y: 0.2, width: 0.7, height: 0.5 }] } } : withImage ? { image } : {}),
    }] }, 'https://test.example');
    const result = response.results[0];
    if (!('id' in result) || typeof result.id !== 'string') throw new Error(JSON.stringify(result));
    return result.id;
}
async function stored(id: string) { return state.client.errorItem.findUniqueOrThrow({ where: { id } }); }
async function finished(count = 1) {
    await vi.waitFor(() => expect(listBackgroundTasks(user.id, { includeSilent: true }).filter(task => task.kind === 'integrity_check' && task.status !== 'running')).toHaveLength(count), { timeout: 7000, interval: 40 });
}
async function quiet() { await new Promise(resolve => setTimeout(resolve, 1750)); }
async function patch(id: string, value: Record<string, unknown>) {
    return updateAgentErrorItem(user, { id, expectedRevision: agentItemRevision(await loadAgentItem(state.client, user.id, id)), patch: value }, 'https://test.example');
}

describe('带图题后台核对（临时 SQLite + Mock AI）', () => {
    it('保存立即返回；带出处题入队，AI 和规则问题共存，模型及 token 用量回填', async () => {
        state.config.integrityCheckModel = 'cheap-vision';
        const id = await create(true, true);
        expect(state.complete).not.toHaveBeenCalled();
        expect((await stored(id)).checkStatus).toBe('pass');
        await finished();
        expect(await stored(id)).toMatchObject({ checkStatus: 'flagged' });
        expect(parseCheckIssues((await stored(id)).checkIssues)).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'missing_answer', source: 'rules' }),
            expect.objectContaining({ code: 'text_diff', source: 'ai', visibility: 'user', model: 'cheap-vision', evidence: 'kěn' }),
        ]));
        expect(await state.client.aiUsage.findMany({ where: { userId: user.id } })).toEqual([expect.objectContaining({ kind: 'integrity_check', model: 'actual-vision-model', inputTokens: 1500, outputTokens: 340 })]);
        // 图文核对是静默任务，不出现在用户的任务面板
        expect(listBackgroundTasks(user.id).some(task => task.kind === 'integrity_check')).toBe(false);
    });
    it('只有出处页时仍检查全部跨页区域，并附上整页缩略图与坐标', async () => {
        const id = await create(true, true);
        const nextBytes = PNG.sync.write(new PNG({ width: 80, height: 200 }));
        const { page } = await saveSourcePage(user.id, nextBytes, 'image/png');
        await state.client.questionRegion.create({ data: { errorItemId: id, pageId: page.id, order: 1, x: 0.1, y: 0.4, width: 0.7, height: 0.3 } });
        await state.client.errorItem.update({ where: { id }, data: { originalImageUrl: '' } });
        await finished();
        const request = state.complete.mock.calls[0][0];
        expect(request.additionalImages).toHaveLength(2);
        expect(request.user).toContain('"y":0.4');
        expect(request.image?.mimeType).toBe('image/jpeg');
        expect((await stored(id)).checkStatus).toBe('flagged');
    });
    it('英文导入任务沿用英文核对提示词', async () => {
        const id = await create();
        await state.client.importTask.create({ data: { userId: user.id, errorItemId: id, mode: 'auto', status: 'saved', language: 'en', imageData: '' } });
        await finished();
        expect(state.complete.mock.calls[0][0].system).toContain('one-sentence English summary');
    });
    it('无图题不登记任务、不调用 AI、不扣额度', async () => {
        await create(false); await quiet();
        expect(listBackgroundTasks(user.id, { includeSilent: true })).toEqual([]);
        expect(state.complete).not.toHaveBeenCalled();
        expect(await state.client.aiUsage.count({ where: { userId: user.id } })).toBe(0);
    });
    it.each(['questionText', 'answerText', 'wrongAnswerText'] as const)('修改 %s 后重新核对，并保留已忽略的问题', async field => {
        const id = await create(); await finished();
        const current = await stored(id);
        await state.client.errorItem.update({ where: { id }, data: { checkIssues: JSON.stringify(parseCheckIssues(current.checkIssues).map(issue => ({ ...issue, dismissed: issue.source === 'ai' }))) } });
        await patch(id, { [field]: '改后文字' });
        await finished(2);
        expect(state.complete).toHaveBeenCalledTimes(2);
        expect(parseCheckIssues((await stored(id)).checkIssues)).toContainEqual(expect.objectContaining({ code: 'text_diff', source: 'ai', dismissed: true }));
        expect((await stored(id)).checkStatus).toBe('pass');
    });
    it('修改出处区域触发重检，同一窗口的连续修改合并', async () => {
        const id = await create(true, true); await finished();
        await patch(id, { sourcePage: { page: image, regions: [{ x: 0.2, y: 0.2, width: 0.5, height: 0.5 }] } });
        await patch(id, { questionText: '连续修改一次' });
        await patch(id, { wrongAnswerText: '学生的新作答' });
        await finished(2);
        expect(state.complete).toHaveBeenCalledTimes(2);
    });
    it('关闭开关时不执行，排队后关闭也会跳过', async () => {
        const id = await create();
        state.config.integrityCheckEnabled = false;
        await quiet();
        scheduleIntegrityCheck(id); await quiet();
        expect(state.complete).not.toHaveBeenCalled();
        expect(listBackgroundTasks(user.id, { includeSilent: true })).toEqual([]);
    });
    it.each(['daily', 'monthly', 'consent'])('%s 配额或授权不满足时静默跳过', async kind => {
        if (kind === 'daily') state.config.aiDailyLimit = 1;
        if (kind === 'monthly') state.config.aiMonthlyTokenLimit = 10;
        if (kind === 'consent') await state.client.user.update({ where: { id: user.id }, data: { aiDataConsentAt: null } });
        await state.client.aiUsage.create({ data: { userId: user.id, kind: 'analyze', inputTokens: 20 } });
        const id = await create(); await quiet();
        expect(await stored(id)).toBeTruthy();
        expect(state.complete).not.toHaveBeenCalled();
        expect(listBackgroundTasks(user.id, { includeSilent: true })).toEqual([]);
        expect(await state.client.aiUsage.count({ where: { userId: user.id } })).toBe(1);
    });
    it('解析失败重试一次，持续失败仅标记后台任务，随后可重新排队', async () => {
        state.complete.mockResolvedValue('{}');
        const id = await create(); await finished();
        expect(state.complete).toHaveBeenCalledTimes(2);
        expect(listBackgroundTasks(user.id, { includeSilent: true })[0]).toMatchObject({ status: 'failed', error: 'AI_RESPONSE_ERROR' });
        expect((await stored(id)).checkStatus).toBe('pass');
        state.complete.mockResolvedValue(JSON.stringify(different));
        scheduleIntegrityCheck(id); await finished(2);
        expect((await stored(id)).checkStatus).toBe('flagged');
    });
    it('检查过程中题干变更，旧结果不写回，后续任务使用新内容', async () => {
        let release!: (text: string) => void;
        state.complete.mockImplementationOnce(() => new Promise<string>(resolve => { release = resolve; }));
        const id = await create();
        await vi.waitFor(() => expect(state.complete).toHaveBeenCalledTimes(1), { timeout: 5000 });
        await patch(id, { questionText: '已经修复的新题干' });
        state.complete.mockResolvedValue(JSON.stringify(integrityMatch));
        release(JSON.stringify(different));
        await finished();
        expect(parseCheckIssues((await stored(id)).checkIssues).some(issue => issue.source === 'ai')).toBe(false);
        await finished(2);
        expect((await stored(id)).checkStatus).toBe('pass');
    });
});
