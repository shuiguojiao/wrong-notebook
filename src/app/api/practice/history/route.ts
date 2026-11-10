import { NextResponse } from 'next/server';
import { withUser } from '@/lib/api-handler';
import { badRequest, validationError } from '@/lib/api-errors';
import { getPracticeHistory } from '@/lib/practice-history';
import { practiceHistoryQuerySchema } from '@/lib/schemas/practice-history';
import { resolveStatsSubjectId } from '@/lib/stats/stats-filter';

export const GET = withUser(async (req, { user }) => {
    const parsed = practiceHistoryQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return validationError('Invalid query parameters', parsed.error.issues);
    const subject = await resolveStatsSubjectId(user.id, parsed.data.subjectId ?? null);
    if (parsed.data.subjectId && !subject) return badRequest('Invalid subjectId');
    return NextResponse.json(await getPracticeHistory(user.id, { ...parsed.data, subject }));
});
