# AI Agent 接入

在「设置 → 账户 → AI Agent 接入」创建个人访问令牌。填写名称，可选到期时间；明文只在创建时显示一次，请立即复制。每个账户最多保留 20 个未撤销令牌。列表显示前缀与最近使用时间，可随时撤销。

令牌格式为 `wnb_` 加随机值，服务端只保存 SHA-256 摘要。令牌属于凭据，不进入个人或全量备份；恢复备份后需要重新创建。请仅交给可信 agent，按账号写权限保护令牌，建议 HTTPS；不要在日志、截图或 Git 中暴露。

## 让 Agent 自动配置

「设置 → 账户 → AI Agent 接入」的「让 Agent 自动配置」提供一段可复制的提示词，已填入当前站点的 MCP 与 Skill 地址，界面为英文时生成英文版。发给自己的 Agent（如 Codex、WorkBuddy）后，它会识别客户端、备份并合并 MCP 配置、安装 Skill，最后调用 `list_notebooks` 验证，不创建题目。提示词不含令牌：Agent 会引导你自己设置 `WRONG_NOTEBOOK_TOKEN` 环境变量或替换配置中的 `<YOUR_TOKEN>`，不要把令牌发到对话里。无法读取令牌时，Agent 会请你在设置页下载 Skill zip 后再安装。

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

## 安装导入 Skill

也可在「设置 → 账户 → AI Agent 接入」下载 zip（仅需登录会话，无需令牌）。Codex 将其解压到 `~/.agents/skills/`；WorkBuddy 在「技能 → 上传技能」导入。压缩包保留 `wrong-notebook-import/` 顶层目录，附带当前站点 MCP 地址的 `README.txt`，不包含令牌。下载所需源文件通过 `next.config.ts` 的 `outputFileTracingIncludes` 纳入 standalone 输出，无需额外复制仓库。

仓库中的 Skill 为 `packaging/agent-skill/wrong-notebook-import/SKILL.md`，优先调用 MCP，无 MCP 时提供 curl REST 备用流程。MCP 参数由模型生成，无法携带本地图片字节，因此需要保留原图时，Skill 引导 agent 按题裁剪图片，用脚本生成请求文件后经 REST 保存；并提示按试卷或练习册填写 `source`。

Codex：从仓库根目录执行以下命令，将目录安装到个人技能位置（或按项目需要放入项目的 `.agents/skills/`）。已有同名技能时先检查内容再更新：

```bash
mkdir -p ~/.agents/skills
cp -R packaging/agent-skill/wrong-notebook-import ~/.agents/skills/
```

可用 `$wrong-notebook-import` 显式调用；发现机制见 [Codex 官方 Skill 文档](https://developers.openai.com/codex/skills/)。

WorkBuddy：将 `wrong-notebook-import` 文件夹打成 zip，经「技能 → 添加技能 → 上传技能」导入，再在已安装列表启用。保留 zip 内的文件夹与 `SKILL.md` 层级，不包含令牌。入口见 [WorkBuddy 官方技能文档](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market)。此仓库交付 Skill 源文件，不自动安装到本机客户端。


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
| `hasFigure`、`figureSvg` | 题目配图（几何图、数轴等）：`figureSvg` 为代理重绘的 SVG（≤100,000 字符，保存前净化，无效时丢弃），传入时自动视为有配图；不能重绘时只传 `hasFigure: true`。配图与原图分开显示，不要把配图截图传入 `image` |
| `image` | 整道题的原图（含题干、图形与作答），可省略；`{"base64":"...","mimeType":"image/png"}` 或 `{"url":"https://..."}` 二选一；只接受 JPEG/PNG/WebP，单张原始字节 ≤5 MiB，检查文件头与 MIME，一律保存到现有本地图片存储。无图保存空串 |

图片 URL 仅支持公网 HTTPS 默认端口，不携带用户名密码，不跟随重定向；解析并固定公网地址，拒绝内网地址，DNS 解析与下载共用同一个 10 秒总超时，超时在图片校验层归为 `AGENT_IMAGE_INVALID_URL`（逐题导入仍返回 `AGENT_IMAGE_INVALID`）。优先使用 base64，避免远端服务器访问记录泄露题目来源。单请求 JSON 上限 145 MiB。

相似题沿用现有逻辑：保留原题、追加一次做错记录，返回 `status: "duplicate"`；新题返回 `created`。查重只给出建议，导入前仍需与用户确认。

每用户跨令牌、REST/MCP 共用 60 次请求/分钟（包括 MCP 握手与工具列表请求），鉴权后、读取请求体之前计数，每请求仅计一次；每用户最多同时读取 2 个请求体，超出返回 429 和 `Retry-After`，读取成功或失败后释放额度。其中导入最多 10 次/分钟，仍按操作计算；超限为 429 并提供 `Retry-After`。鉴权失败为 401，输入无效为 400，其他用户的错题本按 404 处理。限流为进程内计数，重启后清零，多实例各自计数。

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

版本号的唯一来源是 Skill 正文中的固定行 `Skill-Version: 2`（此前无版本行的文件视为 1）。服务端从源文件读取版本，设置页下载按钮旁和 zip 内 `README.txt` 同步显示该版本。选择正文格式是因为 [Codex 官方文档](https://learn.chatgpt.com/docs/build-skills)与 [WorkBuddy 官方结构说明](https://open.workbuddy.cn/docs/skill)没有明确保证两端都接受任意 `metadata.version` 字段，避免影响已有加载方式。

MCP 初始化的 `instructions` 公布最新版本和更新方式，旧 Skill 也能通过该说明获得提醒。MCP `list_notebooks` 与 REST `GET /api/agent/notebooks` 保留原有 `notebooks` 字段，并增加：

```json
{"notebooks": [], "skill": {"version": 2, "downloadUrl": "https://你的域名/api/agent/skill"}}
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
