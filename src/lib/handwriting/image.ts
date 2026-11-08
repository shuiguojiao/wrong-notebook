import { z } from 'zod';

export const MAX_ANSWER_IMAGE_BYTES = 1.5 * 1024 * 1024;
const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

/** 同时限制解码大小、Base64 格式和文件头，不接受远程链接或内部图片引用。 */
export function parseAnswerImage(value: string): { base64: string; mimeType: string } | null {
    if (value.length > Math.ceil(MAX_ANSWER_IMAGE_BYTES / 3) * 4 + 40) return null;
    const match = DATA_URL.exec(value);
    if (!match || match[2].length % 4 !== 0) return null;
    const [, mimeType, base64] = match;
    const bytes = base64.length * 3 / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    if (bytes > MAX_ANSWER_IMAGE_BYTES) return null;
    const header = atob(base64.slice(0, 24));
    const valid = mimeType === 'image/png' ? header.startsWith('\x89PNG\r\n\x1a\n')
        : mimeType === 'image/jpeg' ? header.startsWith('\xff\xd8\xff')
            : header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
    return valid ? { base64, mimeType } : null;
}

export const answerImageSchema = z.string().max(Math.ceil(MAX_ANSWER_IMAGE_BYTES / 3) * 4 + 40)
    .refine(value => parseAnswerImage(value) !== null, 'Invalid answer image (PNG/JPEG/WebP, max 1.5 MB)');
