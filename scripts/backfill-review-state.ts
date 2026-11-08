import 'server-only';

import { getErrorMessage } from '../src/lib/error-message';

async function main() {
    const args = process.argv.slice(2);
    if (args.length || !process.env.DATABASE_URL) throw new Error('请显式设置 DATABASE_URL 后执行回填脚本，不接受额外参数。');
    const { backfillReviewStates } = await import('../src/lib/review-state');
    const { prisma } = await import('../src/lib/prisma');
    try {
        const count = await backfillReviewStates({}, false);
        process.stdout.write(JSON.stringify({ synced: count }) + '\n');
    } finally { await prisma.$disconnect(); }
}
main().catch((error: unknown) => { process.stderr.write(getErrorMessage(error) + '\n'); process.exitCode = 1; });
