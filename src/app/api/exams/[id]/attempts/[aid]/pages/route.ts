import { NextResponse } from 'next/server';
import { withUser } from '@/lib/api-handler';
import { attemptResponse } from '@/lib/exam/exam-attempt-route';
import { addPageSchema, replacePagesSchema, changeExamPages } from '@/lib/exam/exam-photo-pages';
import type { AttemptRouteContext } from '@/lib/exam/exam-attempt-route';

export const POST = withUser(async (req: Request, { user, params }: AttemptRouteContext) => attemptResponse(async () => {
    const { id, aid } = await params;
    return NextResponse.json(await changeExamPages(id, user.id, aid, { kind: 'add', ...addPageSchema.parse(await req.json()) }));
}));
export const PUT = withUser(async (req: Request, { user, params }: AttemptRouteContext) => attemptResponse(async () => {
    const { id, aid } = await params;
    return NextResponse.json(await changeExamPages(id, user.id, aid, { kind: 'replace', ...replacePagesSchema.parse(await req.json()) }));
}));
