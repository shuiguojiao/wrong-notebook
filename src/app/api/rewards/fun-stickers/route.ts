import { NextResponse } from 'next/server';
import { withUser } from '@/lib/api-handler';
import { getRewardFunStickers } from '@/lib/rewards/service';

export const GET = withUser(async (_req, { user }) => NextResponse.json(await getRewardFunStickers(user.id), {
    headers: { 'Cache-Control': 'private, no-store' },
}));
