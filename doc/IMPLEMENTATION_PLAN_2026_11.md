# 实现计划：界面改版与题目出处核对

状态：计划稿（2026-11-09）。依据 `UI_REDESIGN.md` 与 `QUESTION_INTEGRITY.md`（方向均已确认）。效果图编号 01～10 指 `doc/images/ui-redesign/` 中的文件。

## 1. 总体安排

分三条线、15 个步骤。每个步骤是一个可独立通过 lint、单元与集成测试的提交（按 `AGENTS.md` 规则，含对应测试与文档），可以单独部署。

```
A 界面改版（只改界面，不动数据）   A1 → A2 → A3 → A4 → A5
B 题目出处（新表、服务端裁图）     B1 → B2 → B3 → B4 → B5
C 核对（检查与“需要看一眼”）       C1 → C2 → C3 → C4 → C5
```

依赖关系：

- A 线与 B 线互不依赖，可以并行开发；两条线只在错题详情页交汇，B4 必须在 A5 之后。
- C 线依赖 B1（检查结果和出处要存库）；C3 依赖 A1 的卡片组件。
- 每条线内部按顺序进行。

建议的部署节点：

1. **A 线完成后**：界面改版上线，用户立刻感受到变化，没有数据迁移。
2. **B 线完成后**：一次正式迁移；新导入的题开始带出处。
3. **C 线完成后**：核对功能上线。

## 2. A 线：界面改版

### A1 公共组件

- 新增：`ui/more-menu.tsx`（右上角“⋯”菜单，基于现有 `dropdown-menu`）、`question/question-meta.tsx`（元信息行）、`question/answer-compare.tsx`（竖排答案对照块，蓝/红/绿色条）、`question/source-thumb.tsx`（原图缩略图，本步点开先显示题图本身，B4 再升级为整页）、`ui/focus-card.tsx`（复习与核对共用的专注卡片外壳）。
- 复用现有 `ui/segmented-control.tsx`，按设计统一尺寸。
- 只新增组件和单元测试，不替换页面。
- 验收：组件单元测试；深浅色下各组件截图。

### A2 复习作答与对照（效果图 04、05、06）

- 改 `review/original-review.tsx`、`review/review-graded.tsx`、`review/review-question.tsx`、`handwriting/answer-input.tsx`（新增 `variant="card"`，练习页沿用原样式）、`practice-result-card.tsx` 的 review 分支、`globals.css` 中 `review-*` 布局。
- 作答阶段不显示原图；题目引用图形但无配图时显示“查看原图（可能含答案）”按钮。对照阶段新增“原图”折叠行。
- 判定按钮一行三等宽；桌面 `⌘/Ctrl+Enter` 提交、`1/2/3` 判定。
- 数据流（`use-original-review`、`use-review-session`）不变。
- 验收：现有复习相关单元、集成测试通过；更新 E2E 复习用例选择器；手机、iPad 横屏、桌面截图。

### A3 复习首页（效果图 03）

- 改 `review/review-home-card.tsx`、`app/review/page.tsx`：科目行可点、去掉“只复习某一科”标签行、错题本名称共同前缀自动省略。
- 预留“需要看一眼”入口的位置（数量为 0 时不渲染，C3 接入数据）。
- 验收：单元测试覆盖前缀省略；截图。

### A4 错题本列表（效果图 01）

- 新增 `error-list/error-row.tsx`（替代 `error-item-card.tsx`）、`error-list/filter-sheet.tsx`（合并 `filter-menu`、`paper-level-filter`、`question-type-filter` 及年级/章节/知识点下拉）。
- 改 `app/notebooks/[id]/page.tsx`、`error-list/error-list-content.tsx`：标题区加“⋯”菜单（导出打印、多选、比较相似度、重新识别、重命名、删除）、搜索 + 筛选 + 三段状态切换、单列列表、右下角添加按钮、长按或菜单进入多选。
- 题目预览：新增 `src/lib/question/question-preview-key.ts`，去掉同组题目共有的题型说明，取题目自身内容；纯函数，单元测试覆盖语文字音、英语填空、数学解答等样例。
- 分组：本步先按“导入日期 + 来源文字”分组；B1 之后改为按出处文件分组，旧题继续按日期。
- 验收：列表首屏至少 6 道题（390×844）；筛选条件与现有接口参数一一对应，现有筛选测试通过。

### A5 错题详情（效果图 02、07）

- 改 `app/error-items/[id]/page.tsx` 与 `error-detail/` 下各卡片：顶部只留返回与“⋯”；题目卡（元信息、正文、配图、原图缩略图、知识点）；答案对照块；解析/错因/笔记分段切换；复习与掌握合并为一行摘要，点开为底部面板（复用 `review-schedule-panel`、`MasteryPanel` 内容）；SVG 动画与 GeoGebra 未生成时不占位，入口移入“⋯”。
- 新增 `error-detail/edit-mode.tsx`：统一编辑模式，一次保存所有修改字段，沿用现有 `saveFields` 接口。
- 桌面两栏布局。
- 文件较多，按 AGENTS.md 拆成子组件，单个组件不超过约 200 行。
- 验收：现有详情相关测试通过；编辑模式保存与取消的集成测试；四种尺寸截图。

A 线文档：更新 `README.md` / `README.en.md` 中的界面截图与说明，以及受影响的 `doc/wiki/` 中英文页面。

## 3. B 线：题目出处

### B1 数据模型与备份

- `prisma/schema.prisma`：新增 `SourcePage`、`QuestionRegion`；`ErrorItem` 新增检查字段（`checkStatus`、`checkIssues`、`checkedAt`、`checkVersion`）。正式迁移，只新增表和列，兼容已有数据。
- 备份：`src/lib/backup/format.ts` 中 `BACKUP_VERSION` 16 → 17；`api/export`、`api/import` 导出导入出处页（图片随现有图片打包）、位置与检查字段；旧版备份导入时视为无出处、未检查。
- 验收：`data-backup.test.ts` 新增往返用例与 v16 兼容用例；迁移在生产库副本上试跑。

### B2 服务端裁图与代理 `source` 参数

- 新增 `src/lib/source-page/`：保存出处页（同用户按哈希去重）、按区域裁剪并纵向拼接（服务端实现，参数与 `import/batch-crop.ts` 一致：边距、间隔、尺寸上限）。
- `src/lib/agent/schema.ts`：`create_error_items`、`update_error_item` 新增 `source: { page, fileName?, pageNumber?, regions[] }`，与 `image` 二选一；`page` 为图片或已上传的 `pageId`。新增上传整页的 MCP 工具与 REST 路由（返回 `pageId`）。
- `service.ts` / `mutations.ts`：有 `source` 时由服务端裁出题图写入 `originalImageUrl`，并写 `QuestionRegion`。
- 验收：单元测试覆盖区域校验、去重、多区域拼接；集成测试覆盖代理带 `source` 导入、补出处、旧 `image` 方式兼容。

### B3 网页导入保存出处

- 整页分题（`ImportBatch`）开始解析时把整页存为 `SourcePage`，每题入库写 `QuestionRegion`。
- 单张照片：整张照片为出处页、区域为整页。
- PDF 扫描件：渲染页为出处页，记录文件名与页码。
- 验收：导入流程集成测试断言出处与区域；旧流程无回归。

### B4 查看出处（效果图 09 的查看部分；依赖 A5）

- `question/source-thumb.tsx` 升级：点开为整页并框出题目位置，底部显示“文件名 · 第 N 页 · 日期 · 导入方式”；无出处的旧题仍显示题图。
- 接入错题详情（手机与桌面右栏）和复习对照阶段的“原图”折叠行。
- 错题本列表分组改为按出处文件。
- 新增读取出处页图片的接口，沿用题图的鉴权方式。

### B5 导入 Skill 与脚本

- `packaging/agent-skill/wrong-notebook-import/SKILL.md`：按 `QUESTION_INTEGRITY.md` 第 7 节改写导入步骤（列题号清单 → 框选 → 自查裁剪 → 用 `source` 提交 → 读回 `check` → 修正或汇报）。升级 Skill 版本号。
- `scripts/images.py`：改为“上传整页 + 提交框选”，保留回执、读回与哈希校验；旧参数保留兼容。
- 验收：`scripts/` 的 Python unittest；按 Skill 用测试账号在本机导入一份 PDF 走通全流程。

B 线文档：`doc/QUESTION_FORMAT.md`（中英）、代理接入相关 wiki 页、`README` 中代理导入说明。

## 4. C 线：核对

### C1 规则检查

- 新增 `src/lib/question/check-rules.ts`：纯函数，实现 `QUESTION_INTEGRITY.md` 第 4 节规则（“如图”无图等用户可见项，以及缺答案、缺选项等只给代理的后台项）。
- 入库时同步执行，结果写入检查字段；代理接口返回 `check`；网页人工校对页在题卡内显示可见问题与修复按钮。
- 验收：规则逐条单元测试（含不应误报的样例）。

### C2 AI 图文比对

- 提示词：`src/lib/ai/prompts/integrity.ts`，采用验证中的 v3（先抄写原图印刷文字再逐字比对，差异分 major / minor）。
- `BaseAIProvider` 新增 `checkQuestionIntegrity`，解析与错误归类沿用 `response-parser.ts`、`error-classification.ts`；按 `withModelOutputLimit` 请求输出上限，不写死 `max_tokens`。
- 带图题入库后作为后台任务执行（`background-tasks`），计入 AI 配额与用量统计；题干、答案、题图或框选改动后重新检查。
- 设置：默认开启，可关闭或单独指定模型。
- 只把“图题不符（把握 ≥ 0.8）”和“major 文字差异”标为用户可见；裁切、错答差异、minor 差异只记录。
- 隐私：代理导入的题图会发送给服务端配置的 AI 服务，同步更新 `doc/PRIVACY.md` 与 `doc/PRIVACY.en.md`。
- 验收：单元测试覆盖解析与可见性判定（用验证中的真实输出作为夹具）；Mock AI 的集成测试覆盖后台任务、重检触发与配额。

### C3 “需要看一眼”入口、核对卡片与导入完成页（效果图 03、08、09、10）

- 新增接口：列出待核对题、执行“采用建议 / 没问题 / 删掉 / 重新框选”。“采用建议”只替换差异片段；“没问题”按问题类型记为已忽略。
- 新增核对页（复用 A1 的专注卡片），按问题类型显示主按钮。
- 重新框选：在整页上拖动框选（复用分题草稿的区域编辑交互），保存后服务端重裁并重新检查。
- 首页与复习首页显示入口；导入完成页（`import-batches/[id]`、`import-tasks/[id]` 及代理导入后可访问的结果页）显示“N 道已入库，其中 M 道需要看一眼”。
- 验收：集成测试覆盖四种动作；E2E 覆盖导入 → 入口 → 核对完成。

### C4 复习对照中的提示

- 复习对照阶段，有待处理问题的题，“原图”行显示“这道题可能与原图不一致 · 看原图”。复习照常进行，不暂停。

### C5 存量题目

- 存量题在被复习到或被打开时，后台检查一次；由存量检查新加入入口的题每天最多 3 道。
- 提供管理员脚本，按用户、来源批量检查，限速，默认不自动全量运行。
- 上线后按 `QUESTION_INTEGRITY.md` 第 11 节观察误报率，调整可见问题类型。

## 5. 不在本计划内

- 修正现有错题本中已发现的 7 道录入错误（用户决定暂不修改）。
- 录入、统计、试卷、设置页的界面改版。
- 识别模型与分题算法。

## 6. 风险与应对

| 风险 | 应对 |
| --- | --- |
| A5 错题详情改动面大，容易漏掉现有功能入口 | 改动前列出现有全部按钮与入口，逐项对应到新位置，写进提交说明 |
| B1 迁移在生产库上失败 | 先在生产库副本上迁移并试跑；只新增表和列；按既有部署流程备份 |
| AI 比对误报让用户反感 | 上线初期阈值从严；记录“没问题”点击，按类型统计误报率，超过 30% 降为后台 |
| AI 比对费用 | 每题一次调用；可在设置关闭；计入现有配额与用量统计 |
| 出处页图片占用存储 | 同用户按哈希去重，一页多题共用；整页图沿用现有压缩上限 |
| 旧版导入 Skill 继续直接传题图 | 服务端保持兼容，题目记“无出处页”；Skill 版本检查会提示更新 |

## 7. 下一步

从 A1 开始。A 线和 B 线可以同时开工，各自在独立的分支或工作区进行，避免同时修改相同文件。
