import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/api-handler";
import { badRequest, conflict } from "@/lib/api-errors";
import { backupOverview, triggerBackup } from "@/lib/server-backup/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAdmin(async () => NextResponse.json(await backupOverview(), { headers: { "Cache-Control": "no-store" } }));

export const POST = withAdmin(async (request) => {
    // 触发接口不接受路径、SQL 或保留参数，配置只能来自服务端环境。
    const parsed = z.object({}).strict().safeParse(request.body ? await request.json().catch(() => null) : {});
    if (!parsed.success) return badRequest("INVALID_BACKUP_REQUEST");
    const overview = await backupOverview();
    if (!overview.enabled) return conflict("BACKUP_DISABLED");
    if (!triggerBackup()) return conflict("BACKUP_RUNNING");
    return NextResponse.json({ started: true }, { status: 202 });
});
