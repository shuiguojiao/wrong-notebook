import { NextResponse } from 'next/server';
import { withUser } from '@/lib/api-handler';
import { badRequest, validationError } from '@/lib/api-errors';
import { getPracticeCalendar } from '@/lib/practice-history';
import { practiceCalendarQuerySchema } from '@/lib/schemas/practice-history';
import { resolveStatsSubjectId } from '@/lib/stats/stats-filter';

export const GET = withUser(async (req, { user }) => {
    const parsed = practiceCalendarQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return validationError('Invalid query parameters', parsed.error.issues);
    const { from, to, subjectId } = parsed.data;
    const subject = await resolveStatsSubjectId(user.id, subjectId ?? null);
    if (subjectId && !subject) return badRequest('Invalid subjectId');
    return NextResponse.json(await getPracticeCalendar(user.id, from, to, subject));
});
