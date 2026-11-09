import "server-only";

import jpeg from 'jpeg-js';
import type { Prisma } from '@prisma/client';
import type { QuestionIntegrityInput } from '@/lib/ai/integrity';
import { readStoredImage } from '@/lib/image-storage';
import { imageFromSourceRegions } from '@/lib/source-page/crop-regions';
import { decodeSourceImage } from '@/lib/source-page/codec';

export const integrityInclude = {
    questionRegions: { orderBy: { order: 'asc' as const }, include: { page: true } },
    importTasks: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { language: true } },
};
export type IntegrityItem = Prisma.ErrorItemGetPayload<{ include: typeof integrityInclude }>;

/** 只比较本次核对输入；笔记、标签、掌握度和检查结果的更新不使结果失效。 */
export function integrityFingerprint(item: IntegrityItem): string {
    return JSON.stringify([item.questionText, item.answerText, item.wrongAnswerText, item.originalImageUrl,
        item.questionRegions.map(r => [r.pageId, r.page.imageUrl, r.order, r.x, r.y, r.width, r.height])]);
}

function thumbnail(bytes: Buffer, mimeType: string, regions: NonNullable<QuestionIntegrityInput['sourcePages']>[number]['regions']) {
    const source = decodeSourceImage(bytes, mimeType);
    const scale = Math.min(1, 1024 / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const data = Buffer.alloc(width * height * 4, 255);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const from = (Math.min(source.height - 1, Math.floor(y / scale)) * source.width + Math.min(source.width - 1, Math.floor(x / scale))) * 4;
        const to = (y * width + x) * 4;
        for (let c = 0; c < 3; c++) data[to + c] = Math.round(source.data[from + c] * source.data[from + 3] / 255 + 255 - source.data[from + 3]);
    }
    for (const r of regions) {
        const left = Math.round(r.x * (width - 1)), right = Math.round((r.x + r.width) * (width - 1));
        const top = Math.round(r.y * (height - 1)), bottom = Math.round((r.y + r.height) * (height - 1));
        for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
            if (x > left + 1 && x < right - 1 && y > top + 1 && y < bottom - 1) continue;
            const offset = (y * width + x) * 4;
            data[offset] = 0; data[offset + 1] = 100; data[offset + 2] = 255;
        }
    }
    return { base64: jpeg.encode({ data, width, height }, 80).data.toString('base64'), mimeType: 'image/jpeg' };
}

/** 不下载任意外部地址；只读属于此题的本地图片或 data URL。 */
export async function buildIntegrityInput(item: IntegrityItem): Promise<QuestionIntegrityInput | null> {
    const sourcePages: NonNullable<QuestionIntegrityInput['sourcePages']> = [];
    for (const pageId of new Set(item.questionRegions.map(r => r.pageId))) {
        const regions = item.questionRegions.filter(r => r.pageId === pageId);
        const page = await readStoredImage(regions[0].page.imageUrl);
        if (!page) throw new Error('INVALID_INTEGRITY_SOURCE_IMAGE');
        sourcePages.push({ image: thumbnail(page.bytes, page.mimeType, regions), regions: regions.map(({ x, y, width, height }) => ({ x, y, width, height })) });
    }
    let image = item.originalImageUrl ? await readStoredImage(item.originalImageUrl) : null;
    if (!image && item.questionRegions.length) {
        image = await imageFromSourceRegions(item.questionRegions);
    }
    return image ? { language: item.importTasks[0]?.language === 'en' ? 'en' : 'zh', image: { base64: image.bytes.toString('base64'), mimeType: image.mimeType }, sourcePages,
        questionText: item.questionText ?? '', answerText: item.answerText, wrongAnswerText: item.wrongAnswerText } : null;
}
