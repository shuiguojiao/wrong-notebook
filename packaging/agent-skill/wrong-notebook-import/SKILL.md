---
name: wrong-notebook-import
description: 从图片或文字识别错题，与用户确认学生错答后，通过错题本 MCP 工具或结构化 REST API 导入、查询和纠正已导入题目并回报链接。
---

# 将错题导入错题本

Skill-Version: 5

优先使用已配置的 wrong-notebook MCP 工具。此服务接收 agent 整理好的题目，保存时不调用服务端 AI。不使用旧 `/api/openclaw/batch-upload` 图片识别接口。

## 流程

1. 图片或 PDF 先渲染整页，列出本页题号清单，与用户确认要收录的题、学生具体错答，以及无法确定的目标错题本和来源。文字层中的公式、图形也须对照原页；看不清的内容先核实，未知错答留空，不猜测，不收录正确题。用户已明确给出的选择与授权无需重复确认。只有纯文字来源才不带出处页。
2. 逐题在整页上给出框选区域，使用 0～1 相对坐标 `{x,y,width,height}`，每题最多 4 个框，跨栏、跨页按阅读顺序排列，保留公共材料、选项、必要图形和可见学生作答。提交前自己查看按区域裁出的预览，逐字对照题干、选项和学生作答；标准库脚本的预览回退与跨页接口边界见「整页与框选」。数学表达式统一使用 LaTeX（见下文）。
3. 调用 `list_notebooks` 选择目标本，后续优先使用其 `id` 作为 `notebookId`。比较返回的 `skill.version` 与本文件的 `Skill-Version`：服务端更高时，在回复中提醒「导入 Skill 有新版」，说明可按「更新本 Skill」更新，然后照常继续当前导入，不中断、不自动更新；没有 `skill` 字段的旧服务端照常使用。确需新建时与用户确认名称，再使用 `notebookName` 与 `createNotebook: true`。
4. 调用 `search_tags`，`subjectId` 为错题本 id，`q` 为知识点名称片段。`knowledgePoints` 填名称数组；优先使用现有标签，缺失名称会按应用规则创建个人标签。
5. 对每题调用 `find_duplicates`，参数为 `questionText`。有重复时向用户说明：继续导入会保留原题并追加做错记录；用户未明确要求追加时先确认。
6. 同页多题先调用 `upload_source_page` 取得 `pageId` 并复用，用 `sourcePage: {pageId, fileName?, pageNumber?, regions}` 提交整页与区域，不再提交自行裁剪的 `image`；单题也可用 `sourcePage.page` 内联整页。调用 `create_error_items`，每批 1～20 题；本地图片用下文脚本经 REST 发送。逐项检查 `results`，保留成功项的 `id`、`shortId`、`status`、`link`，重复项另存 `practiceRecordId`；失败项不影响其他成功项。
7. 保存后用 `get_error_item` 读回，核对题干、答案、解析、学生错答、`sourcePage` 和题图存在，查看实际裁图并检查公式渲染。返回中如有 `check` 问题，能修正的用 `update_error_item` 修正，修不了的在汇报中逐条说明。汇报入库数量、链接、重复追加记录、失败原因和仍需用户看一眼的题，不能只凭“保存成功”或 PDF 已归档报告完成。仅在原授权仍适用时重试失败项；连接超时属于结果未知，先查重，不能盲目重传整批（会多记一次做错）。遇到 401 停止并请用户检查或重建令牌；429 按返回等待时间退避。

## 数学表达式

题干、选项、正确答案、解析、学生错答和错因中的数学表达式统一用 LaTeX。行内用 `$...$`，独立公式用首尾各占一行的 `$$`；不混用 Unicode 上下标字符。下标如 `$a_1$`、`$a_n$`，多字符整体必须加花括号，如 `$a_{n+1}$`、`$a_{2026}$`；上标同理。不要把公式写进反引号代码块、转义定界符为 `\$`，或把 `a_{n+1}` 裸放在普通文字里。先对照原题确定数学含义，不能猜测普通文本中的 `a1` 都是下标。

请求必须用 JSON 序列化器生成，避免 shell 展开 `$` 或破坏反斜杠。保存后既核对源码，也打开页面检查公式显示；无法查看页面时明确报告“已读回源码，渲染未验证”，不能把源码正确当成已验证显示。

## 导入后查询与纠错

用户要求更正已导入内容时，不要重新调用 `create_error_items`，那会追加做错记录。

1. 已有回执时用其中的 `id`；否则用 `search_error_items` 按 `notebookId`、`q`（题干/来源/短编号）、`source` 或 `createdFrom`/`createdBefore`（含起点、不含终点，带时区的 ISO 时间）查找。结果分页用 `offset`/`limit`（默认 20，最多 50），按 `nextOffset` 继续。
2. 调用 `get_error_item`（`id` 也接受短编号），读取题目及最新 `revision`。其中 `records` 是做错快照，按 `offset`/`limit` 分页，`recordTotal` 为总数；需要核对原图时，用同一 Bearer 令牌请求返回的 `originalImageUrl`，不将凭据附在 URL 中。看不清的学生错答仍留空，不猜测。
3. 改原题用 `update_error_item`，传 `id`、`expectedRevision` 和 `patch`。仅传要更正的字段；省略保持原值，`null` 清除可空文本/难度/原图，`knowledgePoints: []` 清除标签。`notebookId` 移动到本人已有本，并按目标体系重新匹配标签；`figureSvg` 为净化后的题目配图，`hasFigure: false` 同时清除配图。修改不会增加做错次数。
4. 若错的是重复导入追加的某次做错，用 `update_error_record` 传 `id`、`recordId`、`expectedRevision`、`patch`，不修改原题。仅 `source=duplicate_import` 且 `editable=true` 的记录支持纠正；可改题干、答案、解析、学生错答、错因、`notes`、`result`（`wrong`/`not_attempted`/`correct`）、配图和原图。修改/撤销记录后服务端只按规则重算掌握度，不调用 AI。
5. 用户明确要求撤销误追加记录时用 `delete_error_record`；明确要求删除误收录整题时才用 `delete_error_item`。均须先读取并说明目标与影响，再传 `confirm: true`、`expectedRevision`；前者另传 `recordId`，保留原题及其他记录。删除整题会删除其做错、练习和复习记录，已生成试卷保留快照并解除原题关联；删除不可恢复。用户已明确指定目标与删除要求时无需重复确认。
6. 检查返回的新详情并读回核对。一次修改后的 `revision` 用于下一次操作；409 / `AGENT_REVISION_CONFLICT` 表示内容已改变，重读并核对差异后再决定，不直接覆盖。超时结果未知，先读回检查，不重复导入或盲重放写请求。

没有这些工具的旧服务端无法通过 MCP 纠错，不用导入接口代替更新。REST 与 MCP 共用以下字段、归属检查与限流：

| MCP | REST |
| --- | --- |
| `search_error_items` | `GET /api/agent/error-items/search`，参数放查询串 |
| `get_error_item` | `GET /api/agent/error-items/detail?id=...&offset=0&limit=20` |
| `update_error_item` | `PATCH /api/agent/error-items/update` |
| `update_error_record` | `PATCH /api/agent/error-items/records/update` |
| `delete_error_record` | `DELETE /api/agent/error-items/records/delete`，JSON 请求体 |
| `delete_error_item` | `DELETE /api/agent/error-items/delete`，JSON 请求体 |

更正整页出处用 `update_error_item` 的 `patch.sourcePage`，服务端会重新裁图；旧题补图兼容使用下文 `scripts/images.py attach`，重复导入快照须指定 `--record-id`。写操作限流与导入共用每用户每分钟 10 次额度。授权只限用户当前要求，不顺便清理其他题目。

## 字段与图片

- 必填 `questionText`（非空，最多 20,000 字符）和 `notebookId` / `notebookName` 二选一。
- 可选 `answerText`、`analysis`、`wrongAnswerText`、`mistakeAnalysis`；未知学生错答留空，不编造。`mistakeStatus` 为 `not_attempted`、`wrong_attempt` 或 `unknown`。
- 可选 `questionType`、`knowledgePoints`（名称数组）、`source`、`errorType`、`userNotes`、`gradeSemester`、`difficultyStars`（1～5）。未填年级不触发 AI 识别。
- `source` 记录题目出处，如 `2026 秋季期中考试 第 12 题`、`练习册 P35 第 4 题`。根据用户说明、试卷标题或文件名填写，无法确定时在确认错题时询问；用户不需要时省略，此时保存为 `agent`。不要编造考试名称。
- 题目自带的几何图、数轴、流程图、表格图等配图不是原图：照着图片自行重绘为简洁 SVG 填入 `figureSvg`（文本，可直接经 MCP 传递，最多 100,000 字符，脚本与外部资源会被移除）；无法可靠重绘时只传 `hasFigure: true`，由用户在详情页处理。不要把配图截图放进 `image`。
- `sourcePage` 为扫描来源与区域，与 `image` 二选一；整页限 JPEG/PNG、10 MiB、长边 4096 像素，框须在页内且宽高至少 0.01。旧 `image` 用法仅兼容已有流程，传入时为 `{base64, mimeType}`（`base64` 为纯编码，不含 data URL 前缀；MIME 只允许 `image/jpeg`、`image/png`、`image/webp`，解码后 ≤5 MiB），或 `{url}`（仅公网 HTTPS 默认端口，不能带凭据、不跟随重定向），二者选一。不要为获得 URL 把图片上传到额外服务。
- 令牌属于账户写凭据，不回显、不写入题目、日志、Skill 文件或 Git。使用用户已配置的令牌，不能自行创建其他账户的令牌。

## 整页与框选

不要把图片 base64 写进 MCP 参数或让模型手写编码。使用随 Skill 分发的 [scripts/images.py](scripts/images.py) 读取本地整页、上传并读回；只用 Python 标准库（Python 3.9+，读取 Codex TOML 时需 3.11+）。

1. 查询、选标签和查重仍用 MCP。导入摘要列出目标本、题号、学生错答和逐题框选；已有明确授权直接执行，不因改用 REST 再次确认。跨页按阅读顺序规划多个区域，但当前 B2 写入只接收一个出处页，不能提交多页区域；跨页题保留待处理并逐条汇报，不以自行拼接的题图代替出处。
2. 整页、预览、输入 JSON 放在 `mktemp -d` 创建的系统临时目录。提交前用可用的本地裁图工具查看区域预览；Python 标准库不能可靠解码裁图，脚本会在入库后读回服务端裁出的题图，保存到回执 `previewPath` 指向的临时目录供逐字查看。使用此回退时，入库后仍须完成目视自查才能汇报完成。
3. 输入为题目数组，每项增加 `pagePath`、`regions`，可附 `fileName` 和从 1 开始的 `pageNumber`；相对路径以 JSON 所在目录为准。同一 `pagePath` 只上传一次并复用 `pageId`；同页元数据须一致。不填 `image` 或 `sourcePage` 编码。`imagePath` 仅兼容旧用法。纯文字题直接用 MCP/REST 提交，无需本脚本。
4. 脚本通过环境变量 `WRONG_NOTEBOOK_URL` / `WRONG_NOTEBOOK_TOKEN` 获取连接；也可在脚本路径后、子命令前传 `--config .codex/config.toml`，读取已有 MCP 的 `url` 与 Bearer `http_headers`，不输出凭据、不修改配置，不能在参数里传令牌。

输入示例（用 JSON 序列化器写文件，勿经 shell 拼接）

```json
[{"notebookId":"NOTEBOOK_ID","questionText":"求 $a_{2026}$。","source":"扫描试卷 第12页 第8题","pagePath":"p12.png","fileName":"扫描试卷.pdf","pageNumber":12,"regions":[{"x":0.08,"y":0.12,"width":0.84,"height":0.25}]}]
```

`SKILL_DIR` 为安装目录，`TMP_DIR` 为临时目录，`RECEIPT_PATH` 为尚不存在的私有回执文件，不入 Git。先运行脚本的 `--help` 检查选项。

```bash
# 上传整页、提交区域，逐项保留结果并读回裁图
python3 "$SKILL_DIR/scripts/images.py" import --items "$TMP_DIR/items.json" --receipt "$RECEIPT_PATH"

# 从回执取某项 sourcePage 对象另存为 source.json，只读比对出处并保存裁图
python3 "$SKILL_DIR/scripts/images.py" verify --id ITEM_ID --source-page "$TMP_DIR/source.json" --receipt "$RECEIPT_PATH"

# 兼容旧题补图，只 PATCH image，不增加做错记录
python3 "$SKILL_DIR/scripts/images.py" attach --id ITEM_ID --image "$TMP_DIR/question.jpg" --receipt "$RECEIPT_PATH"

# 兼容旧题原图字节核对
python3 "$SKILL_DIR/scripts/images.py" verify --id ITEM_ID --image "$TMP_DIR/question.jpg" --receipt "$RECEIPT_PATH"
```

重复导入快照的 `attach` / `verify` 加 `--record-id PRACTICE_RECORD_ID`。当前服务端快照不返回 `sourcePage`，脚本仍保存该次裁图但将出处标为待核对，不能用原题出处代替验证。`attach` 默认拒绝覆盖已有图，用户要求替换才加 `--replace`；它会清除原题原有出处区域，更正扫描出处应改用 `patch.sourcePage`。

脚本先保存上传/写入中的状态，上传后记录 `pageId`，保存后立即保留题目 ID、`practiceRecordId`、区域等，再读取详情与题图。整页方式比对 `sourcePage` 并保存裁图 SHA-256 与 `previewPath`；旧方式仍比对本地题图与读回字节 SHA-256，补图另检查题干、作答及记录数量等未变化。`state: verified` 且每项 `verified: true` 表示脚本检查通过，裁剪范围、文字对应和公式显示仍须自行查看。

脚本拒绝覆盖旧回执，不自动重试、跟随重定向或向任意返回地址发送令牌。HTTP 200 但逐项失败、409、401、429、网络中断或读回不一致均返回非零退出码并保留已知结果。`upload_pending`、`write_pending` 或 `readback_pending` 须先查回执与服务器状态，不能直接重跑导入。上传整页也计入每用户每分钟 10 次写额度，429 按提示等待。存在待核对项时保留临时文件，全部处理完成且回执已保留后再删除。

## 没有 MCP 时使用 REST

使用用户配置的 `WRONG_NOTEBOOK_URL`（应用地址，无尾斜杠）和 `WRONG_NOTEBOOK_TOKEN` 环境变量。不要把实际令牌写入命令文本或回报。以下为可替换的调用示例：

```bash
curl --fail-with-body "$WRONG_NOTEBOOK_URL/api/agent/notebooks" \
  -H "Authorization: Bearer $WRONG_NOTEBOOK_TOKEN"

curl --fail-with-body --get "$WRONG_NOTEBOOK_URL/api/agent/tags" \
  -H "Authorization: Bearer $WRONG_NOTEBOOK_TOKEN" \
  --data-urlencode 'subjectId=NOTEBOOK_ID' --data-urlencode 'q=方程'

curl --fail-with-body "$WRONG_NOTEBOOK_URL/api/agent/duplicates" \
  -H "Authorization: Bearer $WRONG_NOTEBOOK_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"questionText":"求解 x + 2 = 5"}'

curl --fail-with-body "$WRONG_NOTEBOOK_URL/api/agent/error-items" \
  -H "Authorization: Bearer $WRONG_NOTEBOOK_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"items":[{"notebookId":"NOTEBOOK_ID","questionText":"求解 x + 2 = 5","answerText":"x = 3","wrongAnswerText":"x = 7","mistakeStatus":"wrong_attempt","knowledgePoints":["一元一次方程"]}]}'
```

多行题干、复杂公式或图片请用 JSON 序列化器生成请求文件，在 `mktemp -d` 的临时目录保存，再用 `--data-binary @文件路径` 发送，结束后删除。不要通过拼接 shell 字符串构造 JSON。扫描来源按「整页与框选」生成请求文件。REST 的鉴权、字段、限流与保存规则同 MCP；逐项检查 `results`，不能仅凭 HTTP 200 报告全部成功。

## 更新本 Skill

只有用户同意更新时才执行；提醒有新版不代表已获更新授权。更新不改变 MCP 配置或令牌。

### Codex

1. 定位当前正在使用的 Skill 目录（个人级 `~/.agents/skills/wrong-notebook-import`，或项目级 `.agents/skills/wrong-notebook-import`），保留原始路径用于检查，不先解析真实路径。如果目录是符号链接（包括失效链接），不要覆盖或删除，提示用户更新链接指向的源仓库。说明替换会覆盖目录内的自定义改动。
2. 使用已配置的 `WRONG_NOTEBOOK_TOKEN` 环境变量。令牌不得出现在命令参数、输出或文件中，不打印环境变量，不使用 `curl -H "Authorization: Bearer $WRONG_NOTEBOOK_TOKEN"`，不启用 shell 调试输出。可直接复制本应用「设置 → 账户 → AI Agent 接入 → Codex 更新命令」的一行命令，将末尾安装路径改为当前 Skill 所在目录；该命令使用 `mktemp -d`、校验 zip 后执行其中的更新脚本，需 Python 3 与 unzip。
3. 自行执行时，用 `mktemp -d` 创建临时目录，在 Python 进程内从 `os.environ["WRONG_NOTEBOOK_TOKEN"]` 读取令牌，以 Authorization Bearer 请求 `skill.downloadUrl`（即配置站点的 `/api/agent/skill`）。先核对地址与用户配置站点一致；没有返回字段时使用 `$WRONG_NOTEBOOK_URL/api/agent/skill`。只接受 HTTP 200，不跟随重定向、不打印响应正文；401 提示检查令牌，429 按 Retry-After 稍后重试，失败不替换本地目录。
4. 将 zip 保存到该临时目录。检查 zip 完整性后，从固定条目 `wrong-notebook-import/scripts/update.py` 取出脚本，并先审阅下载来源和脚本再执行 `python3 临时目录/update.py 临时目录/skill.zip 当前Skill目录`。脚本校验目录结构、路径、非符号链接条目、Skill 名称和正整数版本，拒绝降级，暂存后替换；失败恢复原目录，若恢复失败会保留并报告备份位置。不要直接把未经校验的 zip 解压到安装目录。
5. 读回安装目录中的 `Skill-Version`，确认符合下载版本，删除下载临时目录。告知用户「Skill 已更新，请新建 Codex 对话生效」。当前对话继续原任务，不把下载成功当作安装成功。

### WorkBuddy 等界面导入客户端

提示用户在本应用「设置 → 账户 → AI Agent 接入」查看版本并下载最新 zip，再通过客户端「技能 → 上传技能」覆盖已安装 Skill。此下载使用登录会话，无需在下载 URL 放令牌；完成后新建对话。不要替用户修改客户端账户或创建新令牌。
