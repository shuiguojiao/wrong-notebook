import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withUser } from '@/lib/api-handler';
import { validationError } from '@/lib/api-errors';
import { getRewardLedger } from '@/lib/rewards/service';

const daySchema = z.iso.date();

export const GET = withUser(async (req, { user }) => {
    const parsed = daySchema.safeParse(new URL(req.url).searchParams.get('day'));
    if (!parsed.success) return validationError('Invalid day', parsed.error.issues);
    return NextResponse.json(await getRewardLedger(user.id, parsed.data), { headers: { 'Cache-Control': 'private, no-store' } });
});
