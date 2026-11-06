import { withUser } from "@/lib/api-handler";
import { agentPublicOrigin } from "@/lib/agent/client-config";
import { getAgentSkillInfo } from "@/lib/agent/skill-version";

export const runtime = "nodejs";

/** 设置页只读取元信息，不为显示版本反复下载压缩包。 */
export const GET = withUser(async (req) => Response.json(
    await getAgentSkillInfo(agentPublicOrigin(req.url)),
    { headers: { "Cache-Control": "no-store" } },
));
