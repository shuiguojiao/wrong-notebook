# AI Agent 接入

在「设置 → 账户 → AI Agent 接入」创建个人访问令牌。填写名称，可选到期时间；明文只在创建时显示一次，请立即复制。每个账户最多保留 20 个未撤销令牌。列表显示前缀与最近使用时间，可随时撤销。

令牌格式为 `wnb_` 加随机值，服务端只保存 SHA-256 摘要。令牌属于凭据，不进入个人或全量备份；恢复备份后需要重新创建。请仅交给可信 agent，按账号写权限保护令牌，建议 HTTPS；不要在日志、截图或 Git 中暴露。

设置页预留 MCP 地址与客户端配置示例。结构化导入接口与 MCP 工具将在后续提交中接入。

## 结构化 REST 导入

所有 `/api/agent/*` 请求携带 `Authorization: Bearer wnb_...`，只访问令牌所属用户的数据，无需会话 Cookie。代理自行识图并提供结构化题目，服务端不调用 AI（包括补充年级识别和重复题掌握度评估）。旧 Openclaw 接口保持不变。

| 方法与路径 | 输入与结果 |
| --- | --- |
| `GET /api/agent/notebooks` | 返回 `notebooks`：当前用户的 id、name、stage、subjectKey、tagSet |
| `GET /api/agent/tags?subjectId=...&q=...` | 必须传当前用户的错题本 id；按其学科和标签体系搜索系统及个人标签，q 可省略，最多返回 50 项 |
| `POST /api/agent/duplicates` | `{"questionText":"题干"}`；按账户相似度阈值返回最相似的一项 `duplicates`（id、shortId、questionText、subjectId、similarity 0～1、link），或空数组 |
| `POST /api/agent/error-items` | `{"items":[...]}`，1～20 题；返回按输入顺序排列的 `results`，每项有 index 和 id/shortId/status/link 或 error；单项失败不回滚其他项 |

每题字段：

| 字段 | 说明 |
| --- | --- |
| `questionText` | 必填非空题干，最多 20,000 字符，支持 Markdown / LaTeX |
| `notebookId` / `notebookName` | 二选一；推荐先列出错题本后传 id。名称不存在时仅在 `createNotebook: true` 时允许按现有学科匹配规则创建 |
| `answerText`、`analysis` | 正确答案（20,000 字符）与解析（50,000 字符），可省略或 null |
| `wrongAnswerText`、`mistakeAnalysis` | 学生错答（20,000 字符）与错因（50,000 字符），未知时不要编造 |
| `mistakeStatus` | `not_attempted` / `wrong_attempt` / `unknown`，可省略或 null，保存时按现有错答规则规范化 |
| `questionType` | 题型名称，最多 200 字符；沿用应用规范化规则，不识别的类型存 null |
| `knowledgePoints` | 最多 100 个名称，每个 1～200 字符；按当前体系匹配系统或个人标签，缺失时按现有规则创建个人标签 |
| `source`、`errorType`、`userNotes` | 来源（1,000 字符，缺省 `agent`）、错误类别（1,000 字符）、个人笔记（20,000 字符） |
| `gradeSemester`、`difficultyStars` | 年级学期（100 字符）、难度 1～5 整数，可省略或 null；固定年级按账户规则补齐，AI 年级规则下未提供则留空 |
| `image` | 可省略；`{"base64":"...","mimeType":"image/png"}` 或 `{"url":"https://..."}` 二选一；只接受 JPEG/PNG/WebP，单张原始字节 ≤5 MiB，检查文件头与 MIME，一律保存到现有本地图片存储。无图保存空串 |

图片 URL 仅支持公网 HTTPS 默认端口，不携带用户名密码，不跟随重定向；解析并固定公网地址，拒绝内网地址，下载超时 10 秒。优先使用 base64，避免远端服务器访问记录泄露题目来源。单请求 JSON 上限 145 MiB。

相似题沿用现有逻辑：保留原题、追加一次做错记录，返回 `status: "duplicate"`；新题返回 `created`。查重只给出建议，导入前仍需与用户确认。

每用户跨令牌、REST/MCP 共用 60 次调用/分钟，其中导入最多 10 次/分钟；超限为 429 并提供 `Retry-After`。鉴权失败为 401，输入无效为 400，其他用户的错题本按 404 处理。限流为进程内计数，重启后清零，多实例各自计数。

此流程逐项同步保存，不使用管理「分题草稿 / 待识别任务」的 `ImportBatch`，避免把已完成的结构化导入变成可重跑的 AI 识别任务。保存钩子与日志来源标记为 `agent`，题目来源 `source` 可由调用方填写；返回结果应由代理保留。成功题目照常参与原有备份导入导出，凭据不参与备份，备份版本不变。

```bash
curl "$WRONG_NOTEBOOK_URL/api/agent/notebooks" \
  -H "Authorization: Bearer $WRONG_NOTEBOOK_TOKEN"

curl "$WRONG_NOTEBOOK_URL/api/agent/error-items" \
  -H "Authorization: Bearer $WRONG_NOTEBOOK_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"items":[{"notebookId":"替换为错题本id","questionText":"求解 x + 2 = 5","answerText":"x = 3","wrongAnswerText":"x = 7","knowledgePoints":["一元一次方程"]}]}'
```
