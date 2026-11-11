import { NextResponse } from 'next/server';
import { withUser } from '@/lib/api-handler';
import { getRewardBadges } from '@/lib/rewards/service';

export const GET = withUser(async (_req, { user }) => NextResponse.json(await getRewardBadges(user.id), {
    headers: { 'Cache-Control': 'private, no-store' },
}));
