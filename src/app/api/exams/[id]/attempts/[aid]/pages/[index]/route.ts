import { NextResponse } from 'next/server';
import { withUser } from '@/lib/api-handler';
import { attemptResponse } from '@/lib/exam/exam-attempt-route';
import { changeExamPages } from '@/lib/exam/exam-photo-pages';
import type { AuthenticatedContext } from '@/lib/api-handler';

export type PageRouteContext = AuthenticatedContext & { params: Promise<{ id: string; aid: string; index: string }> };
export const DELETE = withUser(async (req: Request, { user, params }: PageRouteContext) => attemptResponse(async () => {
    const { id, aid, index } = await params;
    return NextResponse.json(await changeExamPages(id, user.id, aid, { kind: 'delete', index: Number(index), reference: new URL(req.url).searchParams.get('reference') ?? undefined }));
}));
