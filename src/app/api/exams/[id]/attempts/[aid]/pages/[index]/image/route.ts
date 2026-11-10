import { withUser } from '@/lib/api-handler';
import { notFound } from '@/lib/api-errors';
import { attemptResponse } from '@/lib/exam/exam-attempt-route';
import { readStoredImage } from '@/lib/image-storage';
import { prisma } from '@/lib/prisma';
import type { PageRouteContext } from '../route';

export const GET = withUser(async (_req: Request, { user, params }: PageRouteContext) => attemptResponse(async () => {
    const { id, aid, index } = await params;
    const page = Number(index);
    if (!Number.isInteger(page) || page < 0 || page > 7) return notFound('Image not found');
    const attempt = await prisma.examAttempt.findFirst({ where: { id: aid, paperId: id, userId: user.id, paper: { userId: user.id } }, select: { pageImages: true } });
    const ref = (JSON.parse(attempt?.pageImages ?? '[]') as string[])[page];
    const image = ref ? await readStoredImage(ref) : null;
    if (!image) return notFound('Image not found');
    return new Response(new Uint8Array(image.bytes), { headers: { 'Content-Type': image.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}));
