import { NextResponse } from 'next/server';
import { withUser } from '@/lib/api-handler';
import { getStudentProgress } from '@/lib/student-progress-service';

export const GET = withUser(async (_req, { user }) => NextResponse.json(
    await getStudentProgress(user.id, user.masteryThreshold),
    { headers: { 'Cache-Control': 'private, no-store' } },
));
