# AI Agent 接入


## 录入页快速上手

录入面板的「AI Agent」页签可选择客户端、复制配置和接入提示词、创建令牌、查看最近调用状态、下载 Skill 并复制示例。管理和撤销仍在设置中；状态表示有效令牌最近一次使用时间，并非实时在线检测。离开页签停止刷新。

Claude Code 的 `.mcp.json` 使用 `type: "http"` 和 `Authorization: "Bearer ${WRONG_NOTEBOOK_TOKEN}"`；Cursor 的 `mcp.json` 使用 `Authorization: "Bearer ${env:WRONG_NOTEBOOK_TOKEN}"`。完整配置可在录入页复制，启动客户端前需让其进程读取环境变量。不要把令牌写进命令参数、对话或 Git。

在「我的 → AI Agent 接入」（打开设置的账户页签）创建个人访问令牌。填写名称，可选到期时间；明文只在创建时显示一次，请立即复制。每个账户最多保留 20 个未撤销令牌。列表显示前缀与最近使用时间，可随时撤销。

令牌格式为 `wnb_` 加随机值，服务端只保存 SHA-256 摘要。令牌属于凭据，不进入个人或全量备份；恢复备份后需要重新创建。请仅交给可信 agent，按账号写权限保护令牌，建议 HTTPS；不要在日志、截图或 Git 中暴露。

## 让 Agent 自动配置

「我的 → AI Agent 接入」（打开设置的账户页签）的「让 Agent 自动配置」提供一段可复制的提示词，已填入当前站点的 MCP 与 Skill 地址，界面为英文时生成英文版。发给自己的 Agent（如 Codex、WorkBuddy）后，它会识别客户端、备份并合并 MCP 配置、安装 Skill，最后调用 `list_notebooks` 验证，不创建题目。提示词不含令牌：Agent 会引导你自己设置 `WRONG_NOTEBOOK_TOKEN` 环境变量或替换配置中的 `<YOUR_TOKEN>`，不要把令牌发到对话里。无法读取令牌时，Agent 会请你在设置页下载 Skill zip 后再安装。

## MCP 与客户端配置

MCP 地址为 `https://你的域名/api/mcp`（设置页显示当前 origin 的完整地址）。使用无状态 Streamable HTTP 和 JSON 响应，每个 POST 独立鉴权，不返回 session id，GET / DELETE 返回 405；无需 OAuth 或浏览器登录。

### Codex

先让启动 Codex 的进程获得环境变量 `WRONG_NOTEBOOK_TOKEN`，值为刚创建的令牌。桌面客户端需保证应用进程也能读取此变量，不能只在另一个终端设置。将以下配置加入 `~/.codex/config.toml`：

```toml
[mcp_servers.wrong-notebook]
url = "https://你的域名/api/mcp"
bearer_token_env_var = "WRONG_NOTEBOOK_TOKEN"
```

`create_error_items` 会写入数据，Codex 默认每次调用前请求批准；在 `codex exec` 等不能交互审批的场景中会被拒绝。确需自动导入时可单独放行该工具：

```toml
[mcp_servers.wrong-notebook.tools.create_error_items]
approval_mode = "approve"
```

返回的错题链接优先使用 `NEXTAUTH_URL` 的地址，部署在反向代理后时应配置为用户实际访问的地址。

重新加载客户端后检查 MCP 连接状态，调用 `list_notebooks` 验证账号。配置字段参考 [Codex 官方 MCP 文档](https://developers.openai.com/codex/mcp/)。令牌未生效时先检查启动进程的环境，不要把令牌填进 URL。

### WorkBuddy

打开 MCP 配置入口（侧边栏「插件 → MCP 服务器 → 配置 MCP」，客户端版本不同也可能显示「连接器」），合并以下 JSON 到已有配置，不覆盖其他服务。也可编辑用户级 `~/.workbuddy/mcp.json`：

```json
{
  "mcpServers": {
    "wrong-notebook": {
      "type": "streamableHttp",
      "url": "https://你的域名/api/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_TOKEN>"
      }
    }
  }
}
```

将 `<YOUR_TOKEN>` 替换为真实令牌，配置文件按凭据文件保护，不入 Git。保存、启用服务后确认连接状态，再调用工具。配置入口参考 [WorkBuddy 官方指南](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide)。以上配置经服务端 SDK 集成测试，未代表已在具体客户端版本中实机验收。

### 工具与推荐流程

1. agent 自行识别题目图片，与用户确认哪些题是错题及学生的真实错答。
2. `list_notebooks` 列本并选择目标。
3. `search_tags` 以错题本 id 作为 `subjectId`，选知识点名称。
4. `find_duplicates` 传 `questionText` 查重，与用户确认重复题处理。
5. `create_error_items` 提交 `items`，逐题检查 `results`，回报链接、重复记录与失败原因。

MCP 与 REST 共用领域函数与限流，不通过 HTTP 自调用。MCP SDK 还会在工具调用前校验参数 schema，无效结构整次拒绝；通过 schema 后的单项保存失败逐项返回。连接超时不能证明未保存，先查重再决定是否重试；不可盲目重传整批，以免多记做错次数。

## 导入后纠错

MCP 同时提供 `search_error_items`、`get_error_item`、`update_error_item`、`update_error_record`、`delete_error_record`、`delete_error_item`。纠错不应重新导入，否则会追加做错次数。以下 REST 接口与工具共享领域逻辑、令牌鉴权和限流：

| 工具 / 方法与路径 | 参数与结果 |
| --- | --- |
| `search_error_items` / `GET /api/agent/error-items/search` | 可选 `notebookId`、`q`（题干/来源/短编号）、`source`（来源片段）、`createdFrom`（含）/`createdBefore`（不含，带时区 ISO 时间），`offset=0`、`limit=20`（最多 50）；返回 `items`、`total`、`nextOffset` |
| `get_error_item` / `GET /api/agent/error-items/detail` | `id` 接受完整 ID 或短编号；返回 `item`（题目、标签、配图、`revision`、`records`、`recordTotal`、`nextOffset`）；记录按 `offset`/`limit` 分页 |
| `GET /api/agent/error-items/image` | `id`、可选 `recordId`，用同一 Bearer 令牌读取原题/记录原图二进制，不暴露本地存储路径；本地图片与旧 data URL 均可读，不代抓旧外部 URL（返回 404） |
| `update_error_item` / `PATCH /api/agent/error-items/update` | `id`、`expectedRevision`、`patch`；可改导入字段和 `notebookId`，不能改 ID、用户、掌握度或任意数据库字段；返回新 `item` |
| `update_error_record` / `PATCH /api/agent/error-items/records/update` | 另传 `recordId`；只更正 `source=duplicate_import`、未关联试卷的记录快照；可改文本、错答、错因、`notes`、`result`、`figureSvg`、`image`，不覆盖原题 |
| `delete_error_record` / `DELETE /api/agent/error-items/records/delete` | `id`、`recordId`、`expectedRevision`、`confirm: true`；仅撤销指定重复导入记录，返回新 `item` |
| `delete_error_item` / `DELETE /api/agent/error-items/delete` | `id`、`expectedRevision`、`confirm: true`；删除整题及其做错、练习、复习记录，已生成试卷保留快照并解除原题关联 |

PATCH / DELETE 参数放 JSON 请求体。先读详情，再使用其 `revision` 作为 `expectedRevision`；版本摘要包含整题、标签与全部做错记录，不仅是本页记录。事务内再次校验，网页编辑、追加记录或另一代理修改后返回 409 / `AGENT_REVISION_CONFLICT`。此时重新读取并核对差异，不自动覆盖。原图请求也共用每分钟 60 次请求额度，并使用 `Cache-Control: no-store`。

局部修改省略的字段保持原值，显式 `null` 清除可空字段，`knowledgePoints: []` 清空标签，`image: null` 清原图；题干必须非空。`questionType` 沿用规范化规则，无效非空值拒绝。SVG 保存前净化，无效 SVG 拒绝；`hasFigure: false` 同时清除配图。移动题目时按目标错题本体系重新匹配现有/指定标签。修改不追加做错记录；纠正或撤销做错记录后，在同一事务中仅按现有规则重算掌握度，不调用 AI。

删除工具要求代理先说明目标与影响并取得用户明确授权，已有明确授权无需重复询问。`confirm: true` 是调用方的显式意图标记，不代表服务端能够验证用户授权；所有操作始终只访问令牌所属用户的数据。删除不可恢复，不提供批量清空工具。超时先读回核实，不能盲重放写请求。字段白名单与空补丁检查阻止误传整条数据库对象。写操作（导入及更正/撤销/删除）合计每用户每分钟 10 次，仍受每分钟 60 次总请求额度限制。

示例（替换 ID 与刚读取的版本）：

```json
{"id":"题目ID","expectedRevision":"详情中的revision","patch":{"answerText":"x = 3","wrongAnswerText":null,"mistakeStatus":"unknown"}}
```

所有原图地址需使用代理令牌，不把令牌放进 URL。更换本地原图时按 Skill 用脚本生成 `patch.image`，经 REST PATCH 发送。导入回执对 `status: "duplicate"` 额外返回 `practiceRecordId`，便于精确纠正/撤销；旧回执缺少该字段时可从详情分页查找。此功能不增加持久化字段或表，备份格式与版本保持不变。

## 安装导入 Skill

也可在「我的 → AI Agent 接入」（打开设置的账户页签）下载 zip（仅需登录会话，无需令牌）。Codex 将其解压到 `~/.agents/skills/`；WorkBuddy 在「技能 → 上传技能」导入。压缩包保留 `wrong-notebook-import/` 顶层目录，附带当前站点 MCP 地址的 `README.txt`，不包含令牌。下载所需源文件通过 `next.config.ts` 的 `outputFileTracingIncludes` 纳入 standalone 输出，无需额外复制仓库。

仓库中的共享 Skill 为 `packaging/agent-skill/wrong-notebook-import/SKILL.md`（v5）。图片/PDF 先渲染整页，列题号清单并确认收录范围与学生错答，再逐题给出 0～1 的相对区域，每题最多 4 个，按阅读顺序排列。提交前查看区域预览，逐字对照题干、选项和学生作答。同页多题先 `upload_source_page` 拿到 `pageId` 复用，用 `sourcePage` 提交，由服务端裁图；只有纯文字来源才不带出处页。数学表达式统一用 LaTeX，如 `$a_{n+1}$`、`$a_{2026}$`，保存后检查网页渲染。按资料填写文字来源 `source`。

Skill 附带 `scripts/images.py`（Python 3.9+，仅标准库）。`import --items 文件 --receipt 新回执` 接收题目数组，每项提供 `pagePath`、`regions`，可附 `fileName`、`pageNumber`；相对路径以 JSON 所在目录为准，同一整页只上传一次。整页限 JPEG/PNG、10 MiB、长边 4096 像素。旧 `imagePath` 保留兼容。`verify --id 编号 --source-page 文件 --receipt 新回执` 只读比对出处，文件为回执某项的 `sourcePage` 对象，含 `pageId`、`regions` 和可选元数据；旧 `verify --image 图片` 继续比对题图字节。`attach --id 编号 --image 图片 --receipt 新回执` 兼容补图，先读 revision，仅 PATCH 原图；已有图默认停止，明确替换才加 `--replace`。补图会清除原题出处区域，更正出处用 `update_error_item` 的 `patch.sourcePage`。

脚本从环境变量 `WRONG_NOTEBOOK_URL` / `WRONG_NOTEBOOK_TOKEN` 读取连接，或在子命令前加 `--config .codex/config.toml` 读取已有 MCP 配置（需 Python 3.11+），不输出凭据。图片编码只在内存中生成。整页、预览和输入文件放系统临时目录，私有回执不入 Git。标准库无法可靠本地裁图，脚本会读回服务端裁图到临时目录，回执记录 `previewPath`、裁图 SHA-256、`pageId` 与区域，供代理目视核对；上传前仍应使用可用的本地工具查看区域预览。用回退流程时须在入库后完成目视自查。

保存后读回详情，核对文字、学生作答、`sourcePage` 与题图；返回中如有 `check` 问题，能修正的修正，修不了的逐条汇报。报告须含入库数量、链接和仍需用户看一眼的题。当前 B2 写入只支持一个出处页，跨页题保留待处理；重复导入快照用 `--record-id practiceRecordId` 读回该次裁图，但快照尚不返回 `sourcePage`，脚本将出处标为待核对，不能以原题出处替代。

脚本先持久化上传/写入状态与逐项 ID，不跟随重定向、不自动重试、不覆盖旧回执。HTTP 200 中逐项失败、409、401、429、网络中断或读回不一致均非零退出并保留回执。上传整页也计入每用户每分钟 10 次写额度。结果未知时先查回执或只读 `verify`，不能直接重跑导入。`state: verified` 且所有项 `verified: true` 表示脚本检查通过，仍须查看实际裁图与公式显示。

Codex：从仓库根目录执行以下命令，将目录安装到个人技能位置（或按项目需要放入项目的 `.agents/skills/`）。已有同名技能时先检查内容再更新：

```bash
mkdir -p ~/.agents/skills
cp -R packaging/agent-skill/wrong-notebook-import ~/.agents/skills/
```

可用 `$wrong-notebook-import` 显式调用；发现机制见 [Codex 官方 Skill 文档](https://developers.openai.com/codex/skills/)。

WorkBuddy：将 `wrong-notebook-import` 文件夹打成 zip，经「技能 → 添加技能 → 上传技能」导入，再在已安装列表启用。保留 zip 内的文件夹与 `SKILL.md` 层级，不包含令牌。入口见 [WorkBuddy 官方技能文档](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market)。此仓库交付 Skill 源文件，不自动安装到本机客户端。


## 结构化 REST 导入

所有 `/api/agent/*` 请求携带 `Authorization: Bearer wnb_...`，只访问令牌所属用户的数据，无需会话 Cookie。代理自行识图并提供结构化题目，服务端不额外补充年级识别或调用重复题掌握度评估；带图题保存后会按自动核对设置在后台调用 AI。旧 Openclaw 接口保持不变。

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
| `hasFigure`、`figureSvg` | 题目配图（几何图、数轴等）：`figureSvg` 为代理重绘的 SVG（≤100,000 字符，保存前净化，无效时丢弃），传入时自动视为有配图；不能重绘时只传 `hasFigure: true`。配图与原图分开显示，不要把配图截图传入 `image` |
| `image` | 整道题的原图（含题干、图形与作答），可省略；`{"base64":"...","mimeType":"image/png"}` 或 `{"url":"https://..."}` 二选一；只接受 JPEG/PNG/WebP，单张原始字节 ≤5 MiB，检查文件头与 MIME，一律保存到现有本地图片存储。无图保存空串 |

图片 URL 仅支持公网 HTTPS 默认端口，不携带用户名密码，不跟随重定向；解析并固定公网地址，拒绝内网地址，DNS 解析与下载共用同一个 10 秒总超时，超时在图片校验层归为 `AGENT_IMAGE_INVALID_URL`（逐题导入仍返回 `AGENT_IMAGE_INVALID`）。优先使用 base64，避免远端服务器访问记录泄露题目来源。单请求 JSON 上限 145 MiB。

相似题沿用现有逻辑：保留原题、追加一次做错记录，返回 `status: "duplicate"`；新题返回 `created`。查重只给出建议，导入前仍需与用户确认。

每用户跨令牌、REST/MCP 共用 60 次请求/分钟（包括 MCP 握手与工具列表请求），鉴权后、读取请求体之前计数，每请求仅计一次；每用户最多同时读取 2 个请求体，超出返回 429 和 `Retry-After`，读取成功或失败后释放额度。其中写操作（导入、更正、删除）合计最多 10 次/分钟，仍按操作计算；超限为 429 并提供 `Retry-After`。鉴权失败为 401，输入无效为 400，其他用户的错题本按 404 处理。限流为进程内计数，重启后清零，多实例各自计数。

此流程逐项同步保存，不使用管理「分题草稿 / 待识别任务」的 `ImportBatch`，避免把已完成的结构化导入变成可重跑的 AI 识别任务。保存钩子与日志来源标记为 `agent`，题目来源 `source` 可由调用方填写；返回结果应由代理保留。成功题目照常参与原有备份导入导出，凭据不参与备份，备份版本不变。

```bash
curl "$WRONG_NOTEBOOK_URL/api/agent/notebooks" \
  -H "Authorization: Bearer $WRONG_NOTEBOOK_TOKEN"

curl "$WRONG_NOTEBOOK_URL/api/agent/error-items" \
  -H "Authorization: Bearer $WRONG_NOTEBOOK_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"items":[{"notebookId":"替换为错题本id","questionText":"求解 x + 2 = 5","answerText":"x = 3","wrongAnswerText":"x = 7","knowledgePoints":["一元一次方程"]}]}'
```

## 版本提醒与更新

版本号的唯一来源是 Skill 正文中的固定行 `Skill-Version: 5`（此前无版本行的文件视为 1）。服务端从源文件读取版本，设置页下载按钮旁和 zip 内 `README.txt` 同步显示该版本。选择正文格式是因为 [Codex 官方文档](https://learn.chatgpt.com/docs/build-skills)与 [WorkBuddy 官方结构说明](https://open.workbuddy.cn/docs/skill)没有明确保证两端都接受任意 `metadata.version` 字段，避免影响已有加载方式。

MCP 初始化的 `instructions` 公布最新版本和更新方式，旧 Skill 也能通过该说明获得提醒。MCP `list_notebooks` 与 REST `GET /api/agent/notebooks` 保留原有 `notebooks` 字段，并增加：

```json
{"notebooks": [], "skill": {"version": 5, "downloadUrl": "https://你的域名/api/agent/skill"}}
```

下载地址使用 `agentPublicOrigin`（优先 `NEXTAUTH_URL`）。新版 Skill 在使用 `list_notebooks` 后比较版本，服务器较新时提醒用户，并继续当前导入，不自动更新；旧版 REST Skill 没有比较规则，需先手动更新一次才能主动提醒。旧服务端没有 `skill` 字段时仍可导入。

- `GET /api/agent/skill`：仅接受有效 Bearer 代理令牌，未提供、已过期或已撤销的令牌返回 401，会话 Cookie 不能替代；与 REST/MCP 共用每用户每分钟 60 次请求额度，429 使用 `Retry-After` 退避。返回无令牌的 zip，禁用缓存。
- `GET /api/agent-skill`：保留原有登录会话下载方式。设置页通过会话鉴权的 `GET /api/agent-skill/version` 读取版本及公开下载地址，不额外下载 zip。
- `next.config.ts` 同时追踪以上路由以及 `/api/agent/notebooks`、`/api/mcp` 所需的 Skill 文件，适用于 standalone。

### Codex 更新

用户同意后，复制设置页「Codex 更新命令」。需要 Python 3、unzip，以及终端环境中的 `WRONG_NOTEBOOK_TOKEN`；命令不内嵌令牌，Python 从环境读取凭据，不把它放入命令参数、输出或文件，也不跟随下载重定向。该变量属于代理客户端配置，无需写入服务端 `.env`。

默认替换 `~/.agents/skills/wrong-notebook-import`；项目级安装请修改命令末尾路径为当前使用的 `.agents/skills/wrong-notebook-import`。命令从当前配置站点下载 zip 至 `mktemp -d`，检查完整性，再运行包内更新脚本；脚本检查条目路径、名称、版本和符号链接，拒绝降级，暂存后完整替换目录。此操作覆盖目录内的自定义改动；失败时恢复旧目录，恢复失败则保留并报告备份。下载临时目录会自动清理。

目录若为符号链接，不能覆盖，改为更新链接指向的源仓库。完成后读回版本，**新建 Codex 对话生效**。旧 Skill 用户也可使用设置页命令更新，无需先手动安装更新脚本。

### WorkBuddy 等界面客户端更新

在设置页下载最新 zip，再经「技能 → 上传技能」覆盖已安装版本，完成后新建对话。不需要把令牌放入 URL 或 zip。

## 整页出处与服务端裁图

`upload_source_page` 对应 `POST /api/agent/source-pages`，输入为 `{ base64, mimeType }` 或 `{ url }`，可附 `fileName`、从 1 开始的 `pageNumber` 和 `origin`（`agent` 默认，也可为 `upload`、`pdf`、`docx`）。返回 `{ pageId, width, height, reused }`。同用户按原始图片字节的 SHA-256 去重，重复上传保留首次文件名、页码和来源类型。上传计入现有每用户每分钟 10 次写入额度。

整页接受 JPEG、PNG，最大 10 MiB，长边最多 4096 像素。服务端先嗅探格式并读取文件头尺寸，再解码验证；WebP 等格式返回 `AGENT_SOURCE_FORMAT_UNSUPPORTED`。URL 沿用公网 HTTPS、固定 DNS、禁止重定向和 10 秒总超时规则。坐标以返回宽高对应的图片像素为基准。

`create_error_items` 的每项或 `update_error_item` 的 `patch` 可传以下 `sourcePage` 对象。`pageId` 和 `page` 二选一，`page` 接受上述图片输入，省去单独上传。`sourcePage` 对象和 `image` 互斥（包括 `image: null`）。

```json
{
  "sourcePage": {
    "pageId": "replace-with-page-id",
    "regions": [
      { "x": 0.08, "y": 0.12, "width": 0.84, "height": 0.25 },
      { "x": 0.08, "y": 0.65, "width": 0.42, "height": 0.2 }
    ]
  }
}
```

每题 1～4 个区域，`x`、`y`、`width`、`height` 为 0～1 的相对坐标，宽高至少 0.01，框须在整页内。服务端四周增加 0.008 相对边距，按提交顺序左对齐纵向拼接，间隔 16 像素，同页各框保持原比例。输出统一为白底 JPEG，质量 0.85，长边最多 1600、体积最多 1 MiB，超限时逐步缩小。

题图与区域在同一事务中写入。更新 `sourcePage` 时替换全部原区域；用 `image` 换图或 `image: null` 清图时同时清除区域。重复导入仍保留原题及其出处，新裁图保存到该次做错快照，返回 `practiceRecordId`。需要修改原题出处时使用 `update_error_item`。

详情 `item.sourcePage` 返回 `{ pageId, fileName, pageNumber, regions }`，无出处为 `null`。B1 备份恢复的跨页题会在各区域额外返回 `pageId`、`fileName`、`pageNumber`，保留每个框的页归属。本次写入参数以单个出处页为单位。`source` 仅接受文字来源字符串，详情仍通过 `source` 返回，可与 `sourcePage` 同时提交；搜索的 `source` 继续按文字来源过滤。`sourcePage` 中的 `fileName`、`pageNumber` 仅在共享出处页对应字段为空时补齐，已有值保持不变且不报错。

出处错误码包括 `AGENT_SOURCE_INVALID`（`sourcePage`、整页上传输入、区域或与 `image` 的互斥校验失败）、`AGENT_SOURCE_PAGE_NOT_FOUND`（404，同样用于其他用户的整页）、`AGENT_SOURCE_FORMAT_UNSUPPORTED`、`AGENT_SOURCE_TOO_LARGE`（413）、`AGENT_SOURCE_DIMENSIONS_EXCEEDED`、`AGENT_SOURCE_CROP_TOO_LARGE`。REST 操作级错误沿用 `message` 字段，批次单项与 MCP 工具失败沿用 `error` 字段。

停止应用后，现有 `npm run images:prune -- --offline` 预览也会将无区域引用的出处页图片视为待清理文件。加 `--delete` 时删除孤儿出处页记录，并按全部业务引用清理图片，共享文件仍有引用就保留。上传后尚未绑定题目的整页也适用此规则。出处页和区域保存在当前备份 v18 中（v17 起支持）。

## 同步规则检查结果

`create_error_items` 的每个成功 `results[]`，以及 `update_error_item`、`get_error_item` 的 `item` 返回 `check: { status, issues }`。本步写入的 `status` 为 `pass`（无待处理用户问题，含已忽略的问题）或 `flagged`（有待处理用户问题）；未检查或首次检查失败返回 `none`，已有记录的 `dismissed`、`resolved` 状态照常返回。`pass` 的 `issues` 仍可能有后台问题。读取详情只返回已有结果，不对存量题主动重检。

每个问题包含 `code`、`severity: 'major' | 'minor'`、`visibility: 'user' | 'agent'`、`field`、`source: 'rules' | 'ai'`，可含 `message`、`evidence`、`suggestion`、`model`、`dismissed`。同步规则不调用 AI（`checkVersion = 1`），不因检查问题拒绝保存；带图题另有后台 AI 比对，见下节。只有 `missing_figure`（题干说“如图”等但无配图、无原图）可见于网页校对题卡；缺答案、缺选项、缺空位、小问数不一致、公式问题、图片/PDF 无出处只给代理与后台。同页连续题号跳号仅在调用规则函数时提供明确的批次题号序列才检查，当前接口不推断用户筛选后的编号。

保存后先查看所有 `issues`，能修的通过 `update_error_item` 局部修正，不能修的逐条报告。修改题干、答案、题型、配图、原图或出处会同步重检，保留已有 AI 问题和按 `code + field` 忽略的类型；忽略标记在问题暂时消失后仍保留。检查写入失败只记日志，不影响保存。当前完整备份 v18 保存 `checkStatus`、`checkIssues`（JSON 字符串）、`checkedAt`、`checkVersion`，题目交换 JSON v1 的内容结构保持原样。

## 后台图文核对与隐私

代理导入的带图题也会在保存成功后自动发送题图、出处页缩略图（标出题目区域）、题干、标准答案及学生错答给服务端配置的 AI 服务做比对，需账号已同意 AI 数据授权。初次保存返回同步规则检查，AI 结论稍后通过 `get_error_item` 的 `check` 读取；不要将保存成功当作 AI 比对通过。`source: "ai"` 区分 AI 问题，`visibility: "agent"` 的项不打扰用户；文字差异的 `evidence` 是原图片段，`suggestion: { textSays, imageSays }` 提供待替换与建议片段，代理修正前仍应核实原图。

题干、答案、学生错答、题图或出处框选修改会去抖后重检，不自动改题；AI 和规则问题共存且保留已忽略类型。配额用尽、关闭自动检查或未授权时跳过，后台失败不会撤销导入。管理员在「设置 → AI 设置」关闭「导入后自动检查题目与原图是否一致」，或指定单独核对模型（空值沿用当前识别模型）。该检查计入 AI 用量和配额；纯文字题不调用 AI。
