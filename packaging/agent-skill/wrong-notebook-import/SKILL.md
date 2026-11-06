---
name: wrong-notebook-import
description: 从图片或文字识别错题，与用户确认学生错答后，通过错题本 MCP 工具或结构化 REST API 导入并回报链接。
---

# 将错题导入错题本

优先使用已配置的 wrong-notebook MCP 工具。此服务接收 agent 整理好的题目，保存时不调用服务端 AI。不使用旧 `/api/openclaw/batch-upload` 图片识别接口。

## 流程

1. 识别用户提供的图片或文字，整理题干、正确答案、解析和可见的学生作答。保留题目公共材料、选项和必要图形；公式可用 LaTeX。看不清的内容先向用户核实。
2. 与用户确认要收录哪些错题、学生具体错答，以及无法从图片确定的目标错题本；用户提供了图片时，一并确认是否保留原图和题目来源（见下文）。不要把正确题或未经确认的推测错答直接导入。用户已明确给出的选择与授权无需重复确认。
3. 调用 `list_notebooks` 选择目标本，后续优先使用其 `id` 作为 `notebookId`。确需新建时与用户确认名称，再使用 `notebookName` 与 `createNotebook: true`。
4. 调用 `search_tags`，`subjectId` 为错题本 id，`q` 为知识点名称片段。`knowledgePoints` 填名称数组；优先使用现有标签，缺失名称会按应用规则创建个人标签。
5. 对每题调用 `find_duplicates`，参数为 `questionText`。有重复时向用户说明：继续导入会保留原题并追加做错记录；用户未明确要求追加时先确认。
6. 调用 `create_error_items`，每批 1～20 题；需要保留原图时改用 REST 保存（见「保留原图」）。检查返回的每个 `results` 条目，成功含 `id`、`shortId`、`status`、`link`；失败含 `error`，不影响其他成功项。
7. 回报成功题目链接、重复题追加记录和失败原因。仅在原授权仍适用时重试失败项；连接超时属于结果未知，先查重，不能盲目重传整批（重复导入会多记一次做错）。遇到 401 停止并请用户检查或重建令牌；429 按返回等待时间退避。

## 字段与图片

- 必填 `questionText`（非空，最多 20,000 字符）和 `notebookId` / `notebookName` 二选一。
- 可选 `answerText`、`analysis`、`wrongAnswerText`、`mistakeAnalysis`；未知学生错答留空，不编造。`mistakeStatus` 为 `not_attempted`、`wrong_attempt` 或 `unknown`。
- 可选 `questionType`、`knowledgePoints`（名称数组）、`source`、`errorType`、`userNotes`、`gradeSemester`、`difficultyStars`（1～5）。未填年级不触发 AI 识别。
- `source` 记录题目出处，如 `2026 秋季期中考试 第 12 题`、`练习册 P35 第 4 题`。根据用户说明、试卷标题或文件名填写，无法确定时在确认错题时询问；用户不需要时省略，此时保存为 `agent`。不要编造考试名称。
- `image` 可省略。传入时为 `{base64, mimeType}`（`base64` 为纯编码，不含 data URL 前缀；MIME 只允许 `image/jpeg`、`image/png`、`image/webp`，解码后 ≤5 MiB），或 `{url}`（仅公网 HTTPS 默认端口，不能带凭据、不跟随重定向），二者选一。不要为获得 URL 把图片上传到额外服务。
- 令牌属于账户写凭据，不回显、不写入题目、日志、Skill 文件或 Git。使用用户已配置的令牌，不能自行创建其他账户的令牌。

## 保留原图

MCP 工具参数由模型逐字生成，模型看得到图片内容，却拿不到文件字节；整张照片的 base64 长达数百万字符，不能手写进 `create_error_items`，也不要尝试。不保留原图时照常用 MCP；需要原图时：

1. 查询、选标签和查重仍可使用 MCP 工具，只有最后的保存改用下文 REST 的 `POST /api/agent/error-items`。
2. 一张图含多道题时，按题裁剪出对应区域（含题干、图形和学生作答），每题附自己的图；无法可靠裁剪时问用户是否附整页图。图片超过 5 MiB 时缩小或转为 JPEG 后再附。
3. 用脚本读取本地图片并生成请求 JSON，图片字节不经过模型输出。裁剪图和请求文件放在 `mktemp -d` 创建的临时目录（下例记为 `$TMP_DIR`），发送后删除，不要写入用户的项目目录或 Git。
4. REST 保存没有 MCP 客户端的审批提示，发送前向用户列出将保存的题目（题干摘要、目标本、所附图片），确认后再发送。

```python
import base64, json, sys
from pathlib import Path

# 用法：python3 build.py 题目.json 输出.json；题目.json 为 items 数组，每项可带 imagePath
items = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
mime = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
for item in items:
    image_path = item.pop("imagePath", None)
    if image_path:
        path = Path(image_path)
        item["image"] = {"base64": base64.b64encode(path.read_bytes()).decode("ascii"), "mimeType": mime[path.suffix.lower()]}
Path(sys.argv[2]).write_text(json.dumps({"items": items}, ensure_ascii=False), encoding="utf-8")
```

```bash
curl --fail-with-body "$WRONG_NOTEBOOK_URL/api/agent/error-items" \
  -H "Authorization: Bearer $WRONG_NOTEBOOK_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @"$TMP_DIR/request.json"
```

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

多行题干、复杂公式或图片请用 JSON 序列化器生成请求文件，在 `mktemp -d` 的临时目录保存，再用 `--data-binary @文件路径` 发送，结束后删除。不要通过拼接 shell 字符串构造 JSON。保留原图时同样按「保留原图」生成请求文件。REST 的鉴权、字段、限流与保存规则同 MCP；逐项检查 `results`，不能仅凭 HTTP 200 报告全部成功。
