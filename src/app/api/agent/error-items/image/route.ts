import { agentResponseRoute } from "@/lib/agent/http";
import { agentImageResponse } from "@/lib/agent/queries";

export const GET = agentResponseRoute((_req, user, input) => agentImageResponse(user, input));
