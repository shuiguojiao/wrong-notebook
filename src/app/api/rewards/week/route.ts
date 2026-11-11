import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withUser } from '@/lib/api-handler';
import { validationError } from '@/lib/api-errors';
import { getRewardWeek } from '@/lib/rewards/service';

const startSchema = z.iso.date().refine(day => new Date(`${day}T12:00:00Z`).getUTCDay() === 1);

export const GET = withUser(async (req, { user }) => {
    const start = new URL(req.url).searchParams.get('start');
    const parsed = start === null ? null : startSchema.safeParse(start);
    if (parsed && !parsed.success) return validationError('Invalid week start', parsed.error.issues);
    return NextResponse.json(await getRewardWeek(user.id, parsed?.data), { headers: { 'Cache-Control': 'private, no-store' } });
});
