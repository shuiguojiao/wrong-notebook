# 存量题核对运维

存量题默认按需检查，无自动全量任务。部署时先备份，再按常规流程执行正式 Prisma 迁移（保留已有数据）；本次迁移仅新增可空的用户每日展示账本列。不要为检查而重建数据库。

## 手动限速检查

与复习回填脚本相同，必须显式指定目标数据库，并启用 Node 的 `react-server` 条件。先在隔离副本验证：

```bash
DATABASE_URL="file:/absolute/path/target.db" node --conditions=react-server scripts/backfill-question-integrity.cjs --user user@example.com --source-prefix "历史试卷" --limit 100 --interval-ms 1000 --rules-only
```

- `--user`：可选，用户 ID 或完整邮箱；指定但不存在则报错，不回退为全用户。
- `--source-prefix`：可选，匹配题目 `source` 字段前缀，不是出处页文件名。
- `--limit`：最多检查多少道，默认 100，范围 1–10000；按创建时间、ID 排序，只选择未检查或检查版本落后的题。
- `--interval-ms`：上一题处理完成后到下一题开始的间隔，默认 1000 毫秒，范围 100–60000；逐题串行。
- `--rules-only`：默认行为，仅规则，不调用 AI，也不扣 AI 配额。
- `--ai`：显式选择规则加 AI，与 `--rules-only` 互斥；等待现有去抖队列执行、结果落盘后才处理下一题。仍受用户数据授权、管理员开关、配额、模型并发和重试规则约束，不能绕过设置。

不传用户与来源会选择所有用户范围，请先用较小 `--limit` 验证。输出一行 JSON：`selected`（选中）、`checked`（规则检查完成）、`skippedOrFailed`（并发已检查或失败）、`flagged`（记录了可见问题，含延后）、`deferred`（超额延后）、`rulesOnly`。`checked` 不代表 AI 已执行；开关关闭、无图、额度不足或授权缺失会跳过 AI。规则已检查的当前版本不会在下次脚本运行时再次被选中，本脚本不提供强制重跑 AI。

同一用户的规则和 AI 新发现共用每日三题额度，处理和删除不返还；超额问题仍保存证据，之后读取统一入口时每天最多再放三题。日期均按应用时区计算，不依赖脚本机器时区。脚本只在被手动调用时运行，不注册计划任务。

## 当日观察

管理员登录后读取 `GET /api/admin/question-integrity`，响应禁止缓存，服务端同时记录 `integrity-daily-summary` 日志。普通用户没有权限。接口完全只读，不触发放出、重检或 AI。

- `imports` / `flaggedImports` / `flaggedImportRate`：当日新导入、曾发现用户可见问题的题目数和比例。
- `byType`：各问题类型的 `handled`、`dismissed`、`dismissRate`；“没问题”占比达到 30% 时优先收紧该类型。
- `timedActions` / `timedQuestions` / `averageHandlingMs`：有计时的动作数、题目数及每题平均毫秒数（同题当日动作耗时累加），目标低于 10000；没有样本返回 `null`。

口径限制：仅有新增元数据的题参与新导入统计；历史点击不补造处理时间，未完成 AI 的比例属于当前快照。处理和建议修复后会保留计数依据。题目删除后，其元数据也随题删除；接口覆盖存续题，删除事件保留在 `question-check-handling` 日志，不能将接口视为完整审计统计。计时包含卡片停留与确认，1 小时封顶，不等同于用户主动操作时间。当前备份 v18 中的可选字段与旧备份兼容，同日恢复取较大账本计数。
