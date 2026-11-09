import "server-only";

import type { User } from "@prisma/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { agentDeleteRecordSchema, agentDeleteSchema, agentDuplicatesSchema, agentGetSchema, agentItemSchema, agentSearchSchema, agentTagsSchema, agentUpdateRecordSchema, agentUpdateSchema, agentUploadSourcePageSchema } from "@/lib/agent/schema";
import { createLogger } from "@/lib/logger";
import { AgentInputError, runAgentOperation } from "@/lib/agent/service";
import type { AgentOperation } from "@/lib/agent/service";
import { getOptionalAgentSkillInfo } from "@/lib/agent/skill-version";

const logger = createLogger("agent-mcp");

/** 每个请求新建工具服务器，闭包只绑定本次令牌所属用户，绝不跨用户复用会话。 */
export async function createAgentMcpServer(user: User, origin: string) {
    const skill = await getOptionalAgentSkillInfo(origin);
    const guide = "先自行识别题目，与用户确认错题和学生错答，再依次 list_notebooks、search_tags、find_duplicates、create_error_items。数学表达式在题干、选项、答案、解析和学生错答中统一使用 LaTeX，行内用 $...$，多字符上下标加花括号（如 $a_{n+1}$、$a_{2026}$）。扫描 PDF/图片导入默认用 sourcePage 提交整页与逐题框选（同一页先 upload_source_page 取得 pageId 复用），由服务端裁出题图，不要再自行裁图后传 image；用户明确不要原图时跳过。重绘 SVG 或归档 PDF 不能替代出处。按 Skill 用 scripts/images.py 经 REST 上传本地整页并读回校验，不让模型手写 base64。保存后检查公式渲染与逐题原图，未验证项如实说明。服务端不调用 AI。返回每题链接及错误，不要盲目重试整批。导入后纠错用 search_error_items、get_error_item，再传详情中的 revision 作为 expectedRevision 局部修改；禁止用重新导入代替修改。重复导入的快照用 update_error_record/delete_error_record 处理。删除整题会连同做错、练习与复习记录一起删除，已生成试卷保留快照并解除原题关联，须获得用户明确授权。409 时重新读取并核对，不可自动覆盖。";
    const server = new McpServer({ name: "wrong-notebook", version: "1.1.0" }, {
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
    const edit = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true };
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
    server.registerTool("upload_source_page", {
        description: "上传 JPEG/PNG 整页，输入 {base64,mimeType} 或 {url}，可附 fileName、pageNumber、origin（默认 agent）。整页 ≤10MiB、长边 ≤4096，URL 限公网 HTTPS。返回 pageId、width、height、reused；同用户按原始字节去重，计入写入限流。随后在 create_error_items 或 update_error_item 的 sourcePage 中提交 pageId 与 1～4 个相对坐标区域。",
        inputSchema: agentUploadSourcePageSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async (input) => invoke("upload_source_page", input));
    server.registerTool("create_error_items", {
        description: "将已识别并经用户确认的 1～20 道结构化错题同步保存，不调用服务端 AI。sourcePage 可传 {pageId 或 page:{base64,mimeType}/{url},fileName?,pageNumber?,regions:[{x,y,width,height}]}，与 image 互斥；区域为 0～1 相对坐标，1～4 个，按顺序由服务端裁图拼接。source 仅接受文字来源字符串，可与 sourcePage 同时提交。每项必填 questionText 及 notebookId/notebookName 二选一；名称不存在时须 createNotebook=true 才可创建。题干、选项、答案、解析和错答中的数学表达式统一用 LaTeX（如 $a_1$、$a_{n+1}$、$a_{2026}$），不能漏掉 $ 定界符或混用 Unicode 上下标。answerText/analysis 为正确答案与解析，wrongAnswerText/mistakeAnalysis 为真实学生错答与错因，未知勿编造；mistakeStatus 为 not_attempted/wrong_attempt/unknown。knowledgePoints 填标签名称数组；questionType、source、errorType、userNotes、gradeSemester、difficultyStars(1～5) 可选。题目自带的几何图、数轴、流程图等配图用 figureSvg 传自行重绘的 SVG（不能重绘时传 hasFigure=true），不要把配图截图当作 image。image 为旧方式：自行裁好的整题原图（含题干、图形与学生作答）；扫描或拍照导入应优先用 sourcePage，只有拿不到整页时才传 image。本地图片按 Skill 用 scripts/images.py 经 REST 上传并读回 SHA-256，不能手写 base64；原图可传 {base64,mimeType} / {url} 二选一，仅 JPEG/PNG/WebP ≤5MiB，URL 限公网 HTTPS。返回各成功题 index、id、shortId、status、link、check:{status,issues} 或 error；issues 含用户与后台规则问题，先自行修正能修的问题，再汇报未解决项，单项保存失败不影响其他项；重复题只追加做错记录并返回 practiceRecordId，须校验该次记录原图；归档 PDF 不算原图已上传。超时后先查重，勿盲目重试整批。",
        inputSchema: z.object({ items: z.array(agentItemSchema).min(1).max(20) }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async (input) => invoke("create_error_items", input));
    server.registerTool("search_error_items", {
        description: "查找本人已导入的错题。可按 notebookId、q（题干/来源/短编号）、source（来源片段）、createdFrom（含）/createdBefore（不含，ISO 时间）过滤。offset/limit 分页，默认 20、最多 50；返回 total、nextOffset 与题目链接，修改前再读取详情。",
        inputSchema: agentSearchSchema, annotations: readOnly,
    }, async (input) => invoke("search_error_items", input));
    server.registerTool("get_error_item", {
        description: "按 id 或短编号读取本人完整错题、标签、配图 SVG 与做错记录。source 保留文字来源，sourcePage 返回 {pageId,fileName,pageNumber,regions} 或 null。check:{status,issues} 返回已保存的用户与后台问题（含 source、dismissed），读取不触发新检查。records 通过 offset/limit 分页，返回 recordTotal/nextOffset；原图地址需同一 Bearer 令牌读取；图片须下载字节校验，地址非空不等于上传正确。重复导入原图应读取对应 records 的快照。revision 覆盖题目与全部记录，后续写操作必传 expectedRevision。记录 editable=true 表示可纠正的重复导入快照。",
        inputSchema: agentGetSchema, annotations: readOnly,
    }, async (input) => invoke("get_error_item", input));
    server.registerTool("update_error_item", {
        description: "纠正用户指定的错题：传 id、get_error_item 返回的 expectedRevision 和 patch，可用 patch.sourcePage 提交整页和区域重新裁图，替换出处；patch.image（含 null）会移除原区域。只更新明确字段，省略保持原值，null 清除可空字段，knowledgePoints=[] 清标签，image=null 清原图。本地原图按 Skill 用 scripts/images.py attach 经 REST 提交 patch.image 并读回检查；不能重新导入代替补图。可改题干、答案、解析、真实错答、标签、来源、配图和 notebookId；移动时按目标标签体系重新匹配。不新增做错次数、不调用 AI；修改题干、答案、题型、配图、原图或出处后同步重跑规则，返回新详情/revision 与 item.check:{status,issues}。409 必须重读核对。",
        inputSchema: agentUpdateSchema, annotations: edit,
    }, async (input) => invoke("update_error_item", input));
    server.registerTool("update_error_record", {
        description: "按 id、recordId、expectedRevision、patch 纠正重复导入产生的一次做错快照，仅允许 source=duplicate_import；不覆盖原题或新增记录。可改文本、真实错答、result、notes、figureSvg、image。本地原图按 Skill 用 scripts/images.py attach --record-id 精确补到本次快照并读回检查，不改原题代替。规则重算掌握度，不调用 AI；返回新详情/revision。409 时重读核对。",
        inputSchema: agentUpdateRecordSchema, annotations: edit,
    }, async (input) => invoke("update_error_record", input));
    server.registerTool("delete_error_record", {
        description: "撤销误追加的一次重复导入记录，保留原题和其他记录。仅允许 source=duplicate_import，须有用户明确删除授权并传 confirm=true、id、recordId、expectedRevision。规则重算掌握度，返回新详情/revision；不允许删除试卷或练习记录。删除不可恢复。",
        inputSchema: agentDeleteRecordSchema, annotations: { ...edit, openWorldHint: false },
    }, async (input) => invoke("delete_error_record", input));
    server.registerTool("delete_error_item", {
        description: "删除用户明确指定的误收录整题及做错、练习、复习记录，已生成试卷保留快照并解除原题关联；删除不可恢复。先 get_error_item 展示目标与影响，用户明确授权后传 id、expectedRevision、confirm=true。只撤销重复导入时应使用 delete_error_record。409 时重读核对，不可盲删。",
        inputSchema: agentDeleteSchema, annotations: { ...edit, openWorldHint: false },
    }, async (input) => invoke("delete_error_item", input));
    return server;
}
