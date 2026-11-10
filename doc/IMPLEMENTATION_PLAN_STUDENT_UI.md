# 实现计划：学生版手账贴纸

状态：计划稿（2026-11-10）。依据 [学生版设计说明](STUDENT_UI.md)。
本文描述后续提交；本次仅撰写文档，不执行代码修改、提交或部署。

## 1. 总体安排

S0–S8 不改数据结构，不做 Prisma 迁移，不升级备份版本。
S9 单独设计小问结构与逐问判题，通过设计评审后另排实现提交。
每个实施步骤形成一个含必要测试和文档的独立提交，可单独部署、可回退。
步骤过大时按所列职责继续拆分；每个子提交也必须保持现有功能可用。

```text
S0 小修 → S1 风格基础 → S2 外壳导航 → S3 基础组件 → S4 今天
                                                    ↓
                                S5 复习 → S6 列表 → S7 详情 → S8 收集册
                                                                      ↓
                                                        S9 小问设计与后续实施
```

依赖说明：S2 的今天状态卡先用普通卡，S3/S4 再替换外观，避免移除入口后无处查看任务。
S3 可独立于 S2 开发组件，但页面替换按顺序进行，避免同时修改共享文件。
S4 的奖励区域等 S8 接入真实推算；此前隐藏奖励数字，不塞示例数据。
S6 的本内复习依赖 S4 的队列筛选；S7 复用 S5 对照和 S3 照片卡样式。
相较建议分期，只把任务状态的最小接入提前到 S2，原因是不能先删浮钮再丢失任务入口。

建议部署节点：

1. **S0 完成后**：先修公式、语义和空态，无迁移。
2. **S1–S4 完成后**：外壳、手账基础和今天页一起验收；各步仍可独立部署。
3. **S5–S7 完成后**：完整复习到查题链路上线。
4. **S8 完成后**：收集册与可核实的连续天数上线；历史推算口径未确认时不发精确数字。
5. **S9 设计通过后**：另行确定迁移、旧数据兼容和分批部署节点。

## 2. 当前代码与复用边界

以下为已核对的现有文件；后文“新增”均指拟新增，不是已存在。

| 领域 | 现有入口与组件 | 当前约束 |
| --- | --- | --- |
| 根与主题 | `src/app/layout.tsx`、`src/app/globals.css`、`src/lib/theme.ts`、`src/contexts/ThemeContext.tsx` | Tailwind 4 的 `@theme inline` 与 `.dark`，已有主题首屏脚本和本地 Geist |
| 外壳 | `src/components/app-shell.tsx` 的 `AppShell`、`src/lib/app-navigation.ts`、`src/components/providers.tsx` | 顶栏、五项底栏；`BackgroundTasksButton` 在 Providers 单独挂载 |
| 今天与概览 | `src/app/page.tsx`、`src/components/home-hero.tsx`、`src/app/review/page.tsx` | 首页录入；概览请求 `/api/review/due?format=overview` |
| 复习 | `src/components/review/` 的 `ReviewSession`、`OriginalReview`、`ReviewPrompt`、`ReviewGraded`、`ReviewSummary` | 已有卡内作答对照、固定队列、撤销；尚非逐小问 |
| 手写 | `src/components/handwriting/` 的 `AnswerInput`、`HandwritingCanvas`、`InkToolbar` | 支持笔、橡皮、撤销、横线纸能力；当前默认空白纸 |
| 列表 | `src/components/error-list.tsx`、`src/components/error-list/error-list-content.tsx`、`error-row.tsx`、`use-error-list.ts` | 已按批次单列；`QuestionSummary` 已能渲染行内公式 |
| 详情与出处 | `src/app/error-items/[id]/page.tsx`、`src/components/error-detail/detail-content.tsx`、`src/components/question/source-thumb.tsx` | 已有统一编辑、整页出处、多区域；菜单仍平铺 |
| 统计与掌握 | `src/app/stats/page.tsx`、`src/components/stats/weak-tags-card.tsx`、`src/lib/mastery-status.ts`、`src/lib/tags/weak-tags.ts` | 薄弱接口仅返回未掌握前 10 项；内部掌握状态三类 |
| 文案与离线 | `src/lib/i18n/zh.ts`、`en.ts`、`public/sw.js`、`public/offline.html` | 文案已分语言；SW 导航仅网络抛错时回离线页 |

## 3. 分期步骤

### S0 小修：公式、用词、骨架与出口

- 改 `src/lib/question/review-preview.ts`：保留完整公式片段，不在 LaTeX 命令或括号中截断。
- 改 `src/app/api/review/due/route.ts` 与 `src/components/review/review-question-list.tsx`：新增兼容的公式预览字段，复用 `QuestionSummary`；原纯文本字段先保留，避免小结链接破坏。
- 同步检查 `src/components/review/review-summary.tsx` 的预览，不能只修概览而让收工页继续显示源码。
- 改 `src/lib/i18n/zh.ts`、`en.ts` 及消费者，按设计用词表迁移同名语义 key；新增 `student.*`，检查模板占位符。
- “还没掌握”必须覆盖 new 与 reviewing。改 `src/lib/error-list/error-list-filters.ts`、`error-list-query.ts`、`src/components/error-list/use-error-list.ts`、`error-list-content.tsx`。
- 新增独立的筛选值 `unmastered`，不扩充持久化 `MasteryStatus`；旧 new/reviewing 查询继续兼容。同步 `src/app/api/error-items/list/route.ts`、`src/types/api.ts` 的派生类型。
- 改 `src/components/stats/wrong-answer-stats.tsx`、`mastery-progress-bar.tsx` 与 `src/components/mastery-status-badge.tsx`：界面合并未掌握两类；API 原始统计不改名，不显示两个同名栏。
- 改 `src/app/page.tsx`、`src/components/home-hero.tsx`：错题本、题数、到期数独立加载/失败/成功，骨架不显示 0；失败可重试。
- 改 `src/app/checks/page.tsx`、`src/components/practice/practice-session.tsx`：空态、无参数和错误都有“回今天 / 去错题本”。先提供显式出口，S2 再恢复完整外壳。
- 验收：扩展 `review-preview.test.ts`、`review-home.test.tsx`、`mastery-status.test.ts`、`translations.test.ts`；集成验证混合状态筛选、旧参数兼容、预览字段；延迟与失败请求截图。
- 建议提交：`fix: 修正学生界面公式预览与状态语义`。

### S1 风格基础：令牌、风格切换、深色与字体

- 改 `src/app/globals.css`：为 `data-ui` 映射纸面、便签、贴纸、章与阴影；桥接现有背景、卡片、主色等语义变量，不另建 Tailwind 配置体系。
- 新增 `src/lib/ui-style.ts`、`src/contexts/UiStyleContext.tsx`、`src/components/settings/ui-style-setting.tsx`；挂到 `src/components/settings/general-settings.tsx`。
- 风格作用范围待产品确认。推荐浏览器显示偏好按账号隔离，缺值默认手账；不向 `/api/user` 增加字段，不新增需备份的用户数据。
- 改 `src/app/layout.tsx`、`src/components/providers.tsx`：首屏初始化与路由级风格解析一致；管理及打印路由强制简洁，Portal 同样生效。
- `src/lib/theme.ts`、`ThemeContext` 保持明暗职责；测试风格切换与已有主题缓存互不覆盖、账号切换不串值。
- 标题新增 `src/app/fonts/ZCOOLKuaiLe-subset.woff2` 与相邻 `OFL.txt`（拟定命名）；用 `next/font/local` 或本地 `@font-face`，缺字走系统栈，`display: swap`。
- 新增字体子集构建说明或脚本，锁定来源版本、字符集和哈希；所有分发包带字体及许可，总 woff2 ≤ 800KB，不加入远程字体请求。
- 深色令牌按设计建议先实现，需出图确认后才能宣称视觉定稿；正文用系统字体，不新增正文字体包。
- 验收：扩展 `src/__tests__/unit/theme.test.tsx`，新增风格首屏/路由/切账号测试；离线缺字体回退、许可随包检查、深浅色令牌截图。
- 建议提交：`feat: 建立手账风格令牌与本地标题字体`。

### S2 外壳与导航：四入口和我的

- 改 `src/components/app-shell.tsx`、`src/lib/app-navigation.ts`：≥768px 显示 88px 侧栏，≥1024px 内容双栏；手机四标签，无浮动拍照或添加按钮。
- 新增 `src/components/student/student-navigation.tsx` 与 `src/app/me/page.tsx`；创建 `src/app/collection/page.tsx` 的可用空态入口，S8 接数据。
- 我的提供 `/stats`、`/exams`、`/import-tasks`、AI Agent 接入、设置、管理员入口、退出；改 `src/components/settings-dialog.tsx` 支持文字触发及指定账户页签，复用 `AgentIntegrationSettings`。
- 将 `ThemeToggle`、`SettingsDialog` 和退出从顶栏移至我的，沿用退出前清上传队列和录入草稿的既有流程。
- 拆 `src/components/background-tasks-button.tsx` 的面板为新增 `src/components/tasks/task-panel.tsx`；`src/components/providers.tsx` 移除浮钮挂载，我的保留全部后台任务查看入口。
- 新增 `src/components/student/today-task-status.tsx`，先接普通状态卡；复用 `backgroundTaskStore`、`useImportTaskList` 与 `PendingUploads`，不另起重复轮询或改变未读处理。
- 改 `src/app/page.tsx` 接最小状态卡；`ImportTasksIndicator` 不再占顶栏，识别成功、失败、查看结果继续可达。
- 空态/异常不按 URL 一刀切隐藏导航。为 `/checks` 活跃卡保留专注，为空态恢复外壳；改 `isFocusPath` 与页面间的状态协作，避免只改正则。
- 改 `src/components/error-detail/detail-layout.module.css`，移除手机详情隐藏全局底栏的旧规则，主按钮另预留底栏高度。
- 验收：更新 `app-navigation.test.ts`、`review-focus-shell.test.tsx`；四入口、管理员条件、退出清理和后台结果可达 E2E；三视口截图。
- 建议提交：`feat: 调整学生导航并新增我的入口`。

### S3 基础组件：纸张、反馈与网络

- 新增 `src/components/student/paper-card.tsx`、`note-card.tsx`、`knowledge-sticker.tsx`、`progress-stamp.tsx`、`highlighter.tsx`、`student-skeleton.tsx`、`network-notice.tsx`。
- 复用 `src/components/ui/empty-state.tsx`、`focus-card.tsx`、`segmented-control.tsx`、`more-menu.tsx`；只扩展变体，不建立重复业务组件。
- 装饰与可操作区域分离；仅装饰可旋转且 ≤±1°；减少动态效果时旋转与印章动画都关闭。
- `src/app/layout.tsx` 移除限制用户缩放的 viewport 配置；保留设备宽度和安全区支持。
- 改 `public/offline.html` 的中英文提示与静态导航出口；改 `public/sw.js` 对导航网络失败及指定网关失败响应兜底，禁止缓存业务 API 或登录页面内容。
- 应用内请求失败接 `NetworkNotice`；首次访问无 SW、边缘错误页不在应用控制范围，外部错误页定制需另立部署事项。
- 验收：键盘、44px、对比度、减少动态效果组件检查；SW 用隔离生产测试实例检查断网、502/503/504、恢复重试；不为本次文档运行构建。
- 建议提交：`feat: 增加手账基础组件与网络状态反馈`。

### S4 今天页：任务优先、录入后置

- 改 `src/app/page.tsx`、`src/components/home-hero.tsx`；新增 `src/components/student/today-dashboard.tsx`、`today-entry.tsx`，组合 `ReviewHomeCard`、`ReviewQuestionList`、`CheckEntry` 与 S2 状态卡。
- 改 `src/app/review/page.tsx` 复用同源今天复习区域；保留旧路由和返回链接，不再维护独立统计口径。
- 复用 `src/components/question-entry/import-workspace.tsx`，通过拍照 / 相册 / 更多进入；保留 `?notebook=` 目标、上传队列、草稿恢复与现有确认流程。
- 改 `src/lib/i18n/zh.ts`、`en.ts` 的录入说明为口语；格式帮助折叠，不改变 AI 识别和导入接口。
- 便签每科前的方框是只读进度标记：该科今天的题全部作答后自动打勾，不可点选，不做多科筛选。
- 点某科这一行进入现有单科复习（单个 `subjectId`），不改 `src/lib/review-due.ts` 的队列参数。
- 验收：今天/概览/会话题数估时一致，单科入口与整体入口题数一致，科目做完后打勾，刷新不重复、录入恢复；1180×820 双栏、820×1180 单栏和手机排序截图。
- 建议提交：`feat: 合并今天任务与复习概览`。

### S5 复习作答、对照与收工

- 改 `src/components/review/original-review.tsx`、`review-prompt.tsx`、`review-graded.tsx`、`review-question.tsx`、`review-action-bar.tsx`、`src/app/review/session/page.tsx` 和 `globals.css`，解除半屏限制。
- 新增 `src/components/review/mobile-answer-drawer.tsx`；iPad 横屏全文与作答 55:45，竖屏单栏，手机非模态抽屉；打开键盘后材料和提交仍可达。
- 改 `src/components/handwriting/answer-input.tsx`、`handwriting-canvas.tsx`、`ink-toolbar.tsx`；复用 `src/lib/hooks/use-ink-canvas.ts`、`use-ink-viewport.ts`、`src/lib/handwriting/render.ts` 的逻辑坐标与导出。
- 横线纸为复习默认变体，其他场景兼容；预留工具和掌侧空间，旋转屏幕不改点坐标；实际笔迹导出不混入装饰。
- 改 `src/components/question/answer-compare.tsx`，新增整题对照组与印章；S5 仍只传一个答案，不新增小问数据。
- 改 `src/components/practice-result-card.tsx` 的 review 分支：双自评按钮与“我觉得我是对的”；对错与把握分开，未知结果先确认，沿用 wrong / correct + sure/unsure 保存，不擅自把不熟等同答错。
- 同步快捷键、撤销、重复提交锁、后台判题晚到结果；原图只在提交后挂载，不能仅 CSS 隐藏答案图。
- 改 `src/components/review/review-summary.tsx`、`review-completed-card.tsx` 和 `src/lib/hooks/use-review-session.ts`：三格指标不复用旧 skipped 槽；掌握数来自前后状态，未知显示待确认。
- 加练将 extra 队列限制为最多 5 题；重复进入不重复记数。当天任务未完成时不得发完成章；奖励数据等 S8 接入。
- 验收：扩展 `review-components.test.tsx`、`handwriting-components.test.tsx`、`handwriting-sessions.test.tsx` 与复习/撤销集成；更新 `e2e/review.spec.ts`；真机 Apple Pencil、软键盘、跨视口笔迹导出。
- 建议提交：`feat: 调整复习作答布局与改正反馈`；若拆分，作答、对照、收工三个子提交分别通过全套门禁。

### S6 错题本封面与列表

- 改 `src/app/notebooks/page.tsx`、`src/app/notebooks/[id]/page.tsx`、`src/components/notebook-card.tsx`；封面显示总数、掌握进度和今天任务数，横屏支持选本栏与列表并排。
- 改 `src/app/api/notebooks/route.ts` 增加派生进度摘要，结合 S4 当日队列按本计数；不新增数据库列，不把未掌握总数当今日数量。
- 改 `src/components/error-list/error-row.tsx`、`notebook-list-header.tsx`、`error-list-content.tsx` 与 `src/lib/error-list/error-list-select.ts`：按配图能力返回轻量标识或按需 SVG，保留分页，不读整页图当缩略图。
- 复用 `QuestionFigure` 的安全渲染规则；无配图时回形针原图入口，无原图时不显示；增加来自同一队列快照的“今天”标签。
- 去掉页面独立 `ShortIdLocator`，把精确题号定位并入搜索；本内已有 `locateByShortId` 行为继续保留。
- “复习这本 · n 题”走原 `subjectId` 会话入口；移除 `NotebookListHeader` 手机悬浮添加按钮，用工具区录入。
- 验收：`notebook-list.spec.ts`、`notebook-management.spec.ts`、短编号和筛选集成；无配图/有配图/无出处三组、数量一致、手机不遮挡截图。
- 建议提交：`feat: 增加学生错题本封面与清晰列表`。

### S7 题目详情与分组菜单

- 改 `src/components/error-detail/detail-content.tsx`、`question-card.tsx`、`answer-card.tsx`、`analysis-tabs.tsx`、`review-summary.tsx`，复用现有 `EditMode`、`MasteryPanel` 与 `ReviewSchedulePanel`。
- 错答用红笔删除线但保持可读，正确答案绿荧光；错因贴纸优先用已有结构字段，长分析仍放正文。
- 改 `src/components/question/source-thumb.tsx`，组合现有 `SourcePageImage`、`SourceViewer`：固定照片预览高度、按真实坐标画框，保留多页、多框、旧图和重新框选。
- 改 `src/components/error-detail/detail-menu.tsx` 与 `src/components/ui/more-menu.tsx`：四组分隔，复用 `separatorBefore`；保持所有工具、能力开关、删除确认和任务恢复入口。
- 使用 `src/lib/latex-check.ts` 的 `findLatexIssuesByField` / `countLatexIssues` 条件展示修复；必要时接渲染失败信号，不因普通反斜杠常驻。
- 主按钮改为“再来一道类似的”；圆点读取现有复习阶段，手机操作条避开四标签底栏。
- 验收：菜单开关两态、公式正常/失败、无原图、长题、编辑取消保存、来源框选冲突、管理员/普通账号；详情与出处相关单元/集成通过。
- 建议提交：`feat: 整理题目详情与分组工具菜单`。

### S8 收集册与连续天数：仅派生数据

- 新增 `src/lib/student-progress.ts`（纯计算）、`src/lib/student-progress-service.ts`（首行 `server-only`）与 `src/app/api/student-progress/route.ts`（`withUser` 鉴权）；名称为拟定。
- 从现有题目、标签、有效作答与掌握概率派生三态，按学科+体系+标签分组；复用 `masteryStatusOf`，不读取“前 10”当全集。
- 近 30 个应用日全对且有作答才算在好转；无记录、重复导入、未作答、无题标签不能获得奖励；全掌握优先。
- 改 `src/app/collection/page.tsx`；新增 `src/components/student/collection-page.tsx`，支持全量分页、稳定排序、状态筛选、去知识点未掌握列表练习。
- 改 `src/components/stats/wrong-answer-stats.tsx` 的 `WeakTagsCard` 区域为同源收集摘要/入口；`src/app/api/stats/weak-tags/route.ts` 可保持旧客户端兼容。
- 连续完成日只取复习任务完成证据；`src/app/api/stats/activity/route.ts` 包含录入，不能直接使用。可复用 `src/lib/stats/stats-streak.ts` 的日期集合算法，输入必须另算。
- 先确认历史可重放口径：现有记录缺每日任务快照、过去额度和估时历史；不能直接历史调用有回填行为的 `getReviewQueue` 冒充只读还原。
- 产品已确认首版简化口径：某应用日有至少一次有效复习作答即为完成日；今天未复习时显示截至昨天的连续数及“今天复习后继续”。严格历史任务完成重放暂不实现，不回填或新增奖励账本。
- 今天页连续圆形红章放在问候右侧，手机缩小；周贴纸放在右栏清单、状态卡之后与录入之前，无本周新贴纸时隐藏。收集册单体系学科隐藏体系名，多体系学科分小节各显示一次体系标题。
- 接 S4“这周新贴纸”和 S5 进步/掌握变化；不能还原获得周时改为“现在已贴上”。重新评估后刷新，撤销与删题可导致派生状态变化。
- 验收：纯函数与集成覆盖混合体系、全掌握、近期全对、无记录、撤销、跨应用时区午夜、今天未复习、连续中断、获得日未知；断言 Prisma 与备份版本无差异。
- 建议提交：`feat: 按学习记录推算收集册与完成连续天数`。

### S9 按小问作答与逐问判题：先另写设计

- 独立新增小问设计文档，提交 `docs: 设计逐小问作答与判题协议`；本期先不改数据或提供商传输。
- 设计需明确小问 ID、共享材料、答案/笔迹归属、逐问判定和整题自评关系、旧整题迁移、撤销及备份往返。
- 代码设计入口为 `src/lib/ai/base-provider.ts`、`src/lib/ai/prompts/`、`response-parser.ts`，以及 `src/app/api/practice/grade/route.ts`、`src/app/api/practice/record/route.ts`、`src/types/api.ts`。
- 提示词具体文件与小问表/字段方案需确认；AI 行为放基类，提供商只管传输，输出限制沿用 `withModelOutputLimit`。
- 后续实现拆成数据兼容、AI 协议、逐问 UI 三类可部署提交；需有实际结构才将 S5 的整题组变为多小问。
- 验收设计覆盖旧题无小问、材料跨页、部分正确、AI 缺项、手写转写失败；后续代码提交同样执行 lint、单元、集成门禁。

## 4. 每步验证与交付门禁

每个代码提交执行 `npm run lint`、`npm run test:unit`、`npm run test:integration`，零警告通过再交付。
沿用现有 E2E 隔离启动器 `npm run test:e2e`；按步骤补运行相关场景，不操作真实学生数据。
`playwright.config.ts` 目前只有桌面 Chromium，新增 iPad 横屏 1180×820、竖屏 820×1180、手机 390×844 项目及触控设置。
三视口分别截图浅色和深色，补桌面 1280×900；S1 后再验证简洁切换、管理和打印外观未受污染。
E2E 从旧五标签和旧按钮文案迁移到四标签及语义角色；保留必要稳定标识，避免依赖旋转样式类名。
建议新增 `e2e/student-ui.spec.ts` 覆盖今天→作答→对照→收工、错题本→详情→类似题、空态回路。
真机检查 iPad Safari、Apple Pencil、横竖屏与软键盘；模拟视口不等于笔性能验收。
每个实施提交同步受影响的 `README.md`、`README.en.md` 与 Wiki 中英文页面；本次只写计划，不修改这些文件。
不主动执行生产构建；后续部署依授权在隔离构建环境操作，记录检查时间及 `/api/health` 的版本和 revision。

## 5. 风险与应对

| 风险 | 应对 |
| --- | --- |
| 标题字体体积、缺字或许可漏包 | 子集总量 ≤800KB，系统回退，离线检查，包内验证 OFL 与版权声明 |
| 深色稿未画，透明层对比度不达标 | S1 候选令牌需出图确认；按实际合成色逐组测 ≥4.5:1 |
| iPad Safari 手写延迟、掌误触与重排 | 复用逻辑画布，限制重绘，真机试写；保留打字替代与草稿 |
| 新导航丢功能或遮住操作 | S2 先接状态卡和任务面板；核对所有旧路由，检查安全区与固定栏 |
| E2E 旧视口和选择器失效 | 每期同步相关用例；新增 iPad 项目，保持隔离测试数据 |
| 新贴纸与历史连续数被过度承诺 | 返回可核实结果与未知状态；不捏造获得时间或任务历史，单列待确认 |
| SW 无法接管首次网关错误 | 已受控导航兜底与首次错误页分开验收，边缘配置另行安排 |

## 6. 不在本计划内与待确认

- 打印页和管理后台的手账改版；仅需验证强制简洁边界，不重做这些页面。
- S0–S8 的数据结构和持久用户数据扩展、Prisma 迁移、备份格式升级。
- AGENTS.md 规定的导入导出结构同步在本次无结构变更时不触发；不是豁免条款。
- 若 S9 新增字段/表或以后加入账号同步风格、获得时间等持久数据，必须同步 `src/lib/backup/format.ts`、`src/app/api/export/route.ts`、`src/app/api/import/route.ts`、`src/__tests__/integration/data-backup.test.ts`，并按规则升版本、兼容旧备份。
- 待产品确认：风格开关作用范围及本浏览器保存方案、深色补图、近期窗口、历史完成日重放规则。
- 上述待确认只约束相应实现；S0 以及已有组件整理可以先做。本次文档不自动启动任何实施步骤。
