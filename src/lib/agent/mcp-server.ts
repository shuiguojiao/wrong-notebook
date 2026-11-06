import "server-only";

import type { User } from "@prisma/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { agentDuplicatesSchema, agentItemSchema, agentTagsSchema } from "@/lib/agent/schema";
import { createLogger } from "@/lib/logger";
import { AgentInputError, runAgentOperation } from "@/lib/agent/service";
import type { AgentOperation } from "@/lib/agent/service";
import { getOptionalAgentSkillInfo } from "@/lib/agent/skill-version";

const logger = createLogger("agent-mcp");

/** 每个请求新建工具服务器，闭包只绑定本次令牌所属用户，绝不跨用户复用会话。 */
export async function createAgentMcpServer(user: User, origin: string) {
    const skill = await getOptionalAgentSkillInfo(origin);
    const guide = "先自行识别题目，与用户确认错题和学生错答，再依次 list_notebooks、search_tags、find_duplicates、create_error_items。服务端不调用 AI。返回每题链接及错误，不要盲目重试整批。";
    const server = new McpServer({ name: "wrong-notebook", version: "1.0.0" }, {
        instructions: !skill ? guide : `${guide}最新导入 Skill 版本：${skill.version}。若本地 Skill-Version 低于此版本（无版本行的旧 Skill 视为 1），在回复中提醒有新版，然后照常继续导入，不中断、不自动更新。Codex 经用户同意后可用环境变量中的代理令牌从 ${skill.downloadUrl} 下载 zip，按新版 SKILL.md 校验并更新当前 Skill 目录；符号链接应更新源仓库，完成后新建对话。WorkBuddy 等界面导入客户端请在设置 → 账户 → AI Agent 接入下载最新版，经技能 → 上传技能覆盖。令牌不得出现在命令参数、输出或文件中。`,
    });
    const invoke = async (operation: AgentOperation, input: unknown) => {
        try {
            const result = await runAgentOperation(user, operation, input, origin);
            return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result };
        } catch (error) {
            if (!(error instanceof AgentInputError)) logger.error({ error, operation }, "代理工具执行失败");
            const result = error instanceof AgentInputError
                ? { error: error.message, status: error.status, ...(error.retryAfterMs ? { retryAfterMs: error.retryAfterMs } : {}) }
                : { error: "AGENT_OPERATION_FAILED", status: 500 };
            return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result };
        }
    };
    const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
    server.registerTool("list_notebooks", {
        description: "列出当前用户的错题本（id、名称、学段、学科与标签体系）。识别图片并确认错题后先调用本工具选择目标错题本；后续优先传 notebookId。",
        inputSchema: z.object({}).strict(), annotations: readOnly,
    }, async () => invoke("list_notebooks", {}));
    server.registerTool("search_tags", {
        description: "按目标错题本 subjectId 和可选名称片段 q 搜索可用知识点，最多 50 项，只含该体系的系统与本人标签。将返回的名称放入 knowledgePoints；缺失名称会按现有规则创建个人标签。",
        inputSchema: agentTagsSchema, annotations: readOnly,
    }, async (input) => invoke("search_tags", input));
    server.registerTool("find_duplicates", {
        description: "输入非空题干 questionText，按账户相似度阈值查找本人题库中最相似的一题（或空数组）。导入前调用，并与用户确认重复题的处理；导入重复题会保留原题并追加做错记录。",
        inputSchema: agentDuplicatesSchema, annotations: readOnly,
    }, async (input) => invoke("find_duplicates", input));
    server.registerTool("create_error_items", {
        description: "将已识别并经用户确认的 1～20 道结构化错题同步保存，不调用服务端 AI。每项必填 questionText 及 notebookId/notebookName 二选一；名称不存在时须 createNotebook=true 才可创建。answerText/analysis 为正确答案与解析，wrongAnswerText/mistakeAnalysis 为真实学生错答与错因，未知勿编造；mistakeStatus 为 not_attempted/wrong_attempt/unknown。knowledgePoints 填标签名称数组；questionType、source、errorType、userNotes、gradeSemester、difficultyStars(1～5) 可选。题目自带的几何图、数轴、流程图等配图用 figureSvg 传自行重绘的 SVG（不能重绘时传 hasFigure=true），不要把配图截图当作 image。image 为整道题的原图（含题干、图形与学生作答），可省略，或传 {base64,mimeType} / {url} 二选一，仅 JPEG/PNG/WebP ≤5MiB，URL 限公网 HTTPS。返回各题 index、id、shortId、status、link 或 error，单项保存失败不影响其他项；重复题只追加做错记录。超时后先查重，勿盲目重试整批。",
        inputSchema: z.object({ items: z.array(agentItemSchema).min(1).max(20) }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async (input) => invoke("create_error_items", input));
    return server;
}
