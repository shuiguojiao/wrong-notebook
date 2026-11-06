import { agentPublicOrigin } from "@/lib/agent/client-config";
import { agentResponseRoute } from "@/lib/agent/http";
import { createAgentSkillZip } from "@/lib/agent/skill-zip";

export const runtime = "nodejs";

export const GET = agentResponseRoute(async (req) => {
    const archive = await createAgentSkillZip(agentPublicOrigin(req.url));
    return new Response(new Uint8Array(archive), {
        headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": 'attachment; filename="wrong-notebook-import.zip"',
            "Cache-Control": "no-store",
        },
    });
});
