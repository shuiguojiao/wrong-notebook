# 数据备份与恢复

网页导出适合迁移个人学习数据；整站恢复应备份数据库、图片目录、服务端配置和部署参数。


## 服务端自动快照

默认开启，每天按应用时区凌晨 3 点起检查执行；若当天尚未成功备份（含 partial），失败后继续重试，每小时最多尝试一次；启动五分钟后，距上次成功已超过 24 小时（或没有成功记录）时补跑。同一进程内手动与定时互斥，构建期间不运行。服务或安卓单机版未运行时无法备份；单机版与桌面版默认使用启动器创建的用户可写数据目录。目录不可写会记录失败，不影响应用请求。

- `BACKUP_ENABLED=true`：设为 `false` 关闭手动及自动备份。
- `BACKUP_KEEP=7`：保留最近 7 份快照，可设为 1–365；若其中没有完整快照，额外保留最新一份完整快照及其图片。
- `BACKUP_DIR`：默认数据库同级 `backups/`，Docker 为 `/app/data/backups`，源码为 `prisma/backups`；自定义路径须对服务账户可写且持久化。

**同盘备份无法抵御硬盘损坏。强烈建议将 `BACKUP_DIR` 放到另一块盘或 NAS 挂载点，或定期同步完整备份目录到异地。** Docker 使用额外挂载时须同步设置容器内路径及权限。多实例不能共用一个备份目录，本功能的互斥范围是单个服务进程。

每份 `snapshot-*/` 包含 `database.sqlite` 和 `manifest.json`；所有快照共用备份根目录的 `images/` 镜像。数据库用 SQLite `VACUUM INTO` 生成一致性快照，不直接复制在线数据库；镜像按内容哈希增量复制，清单记录全部引用。数据库完整性通过后即原子发布并轮换；缺图或坏图不会阻止数据库备份，结果记为 `partial`。清单的 `complete` 标识图片是否完整，并以 `missingImageReferences` / `corruptImageReferences` 记录缺失、损坏的 `local-image:` 引用（不记录绝对路径）。镜像清理覆盖全部保留快照的引用。

管理员可在管理看板查看备份位置、最近结果与快照列表并手动触发；超过 48 小时未成功会醒目提示。

`status.json` 保存最近结果、数据库最近成功时间（含 partial）及最近完整备份时间 `lastCompleteAt`（旧状态缺省为 null）；目录本身不可写时只能在进程内保留错误。备份包含全部用户、密码哈希及数据库内的敏感数据，不加密，应限制目录权限。配置文件、环境变量、证书不包含在自动快照内，仍须单独备份。不要将备份目录公开映射为静态资源，也不要在备份期间运行 `images:prune` 等离线清理命令。


## 验证快照与恢复演练

自动备份与验证器要求 Node.js 22.13 或以上（使用内置 SQLite 的只读连接）。不支持时备份记录 `BACKUP_NODE_UNSUPPORTED`，管理页提示升级；备份模块加载或调度启动失败仅记录日志，不影响应用启动。在源码目录运行，无需配置在线数据库，也无需停止在线服务：

```bash
npm run backup:verify -- /mnt/backup/wrong-notebook/snapshot-具体时间及标识
# 也可以指定该快照的 manifest.json
npm run backup:verify -- /mnt/backup/wrong-notebook/snapshot-具体时间及标识/manifest.json
```

命令输出 JSON：`ok`、SQLite `integrity_check` 结果、用户数、错题数、图片引用数、缺失/损坏数、数据库哈希与清单引用一致性。`databaseValid` 区分数据库是否完好，`imagesComplete` 标识图片是否完整；partial 仍以非 0 退出，仅全部通过才退出 0。输出不包含用户资料或题目内容。`npm` 自身可能输出命令标题，机器解析时可加 `--silent`。不要把「命令能运行」当成恢复成功；请核对统计数量。

Docker 中可直接执行（替换为容器内快照路径）：

```bash
docker compose exec --user nextjs:nodejs wrong-notebook npm run backup:verify -- /app/data/backups/snapshot-具体时间及标识
```

npm 发布包安装目录中也有 `backup:verify` 脚本。桌面版、飞牛OS、安卓单机版的服务端包包含预编译命令，可使用匹配的 Node 运行时在安装包目录执行：

```bash
node --conditions=react-server dist-scripts/scripts/backup-verify.js /实际备份目录/snapshot-具体时间及标识
```

做恢复演练时，先将**快照目录与同一备份根目录下完整的 `images/`** 一起复制到隔离位置，保持 `备份根/snapshot-*/` 与 `备份根/images/` 的相邻关系，再在副本上运行验证。仅复制快照子目录不能独立恢复图片。同步异地时也应一起复制；建议在无备份运行的窗口同步，以免与快照轮换竞争。

### 从自动快照恢复

1. 先对备份副本执行验证，确认 `ok=true`、来源应用版本、用户及错题数合理；另存当前数据、配置和版本信息。
2. **停止所有访问该数据库的服务进程**（Docker 例如 `docker compose stop wrong-notebook`；桌面/安卓须退出本地服务）。不要在在线数据库上覆盖文件。
3. 将 `DATABASE_URL` 指向的原数据库文件及同名 `-wal`、`-shm`、`-journal` 文件移到安全留存目录；不要让旧 WAL 与恢复数据库混用。把快照中的 `database.sqlite` 复制到 `DATABASE_URL` 实际路径并使用原数据库文件名。
4. 将备份根目录的 `images/` 内容复制回 `IMAGE_STORAGE_DIR`；未配置时是实际数据库同级的 `images/`。可先移走原图片目录再完整复制镜像。镜像可能含其他保留快照的图片，额外文件不影响使用。
5. 为数据库、图片目录及父目录恢复服务账户的读写权限。使用与备份匹配的应用版本、原有配置和 `NEXTAUTH_SECRET`，以 `PRESERVE_EXISTING_DATA=true` 启动；需要升级时再单独执行正式迁移。
6. 启动服务（Docker 例如 `docker compose start wrong-notebook`），检查健康接口，登录核对用户、错题、原图、标签、历史与试卷。隔离演练时关闭自动备份或使用独立 `BACKUP_DIR`，避免操作真实备份。

验证器不会检查未入库的外部配置、证书或第三方图片 URL 的可用性，也不能替代登录后的业务核对。备份目录不能直接作为在线数据库及在线图片目录使用；镜像清理依赖保留快照的引用，请勿手工改写 manifest 或在运行中删除快照文件。


## 备份范围

| 方式 | 包含内容 | 适用场景 |
| --- | --- | --- |
| 网页 JSON 导出（完整备份） | 错题本、系统及自定义标签、错题、复习计划、练习记录、随机错题试卷、未处理的识别任务及部分用户资料 | 个人数据留存、受支持字段的导入 |
| 题目交换格式 JSON（导出 JSON） | 选中的错题题目内容（题干、答案、解析、知识点、难度、配图、可选原图） | 题目内容交换、跨系统导入 |
| 自动服务端快照 | 完整 SQLite 数据库、全部用户与共享图片镜像，不含外部配置及证书 | 定期数据备份、停服恢复 |
| 整站文件备份 | 完整 SQLite 数据库、图片目录、`config/`、部署配置及需要的证书 | 灾难恢复、迁移整站、升级前回退准备 |

当前 JSON 导出不包含完整用户账户及密码、AI 数据授权或服务端 AI 配置。即使管理员选择导出全部数据，也不能替代整站备份。


## 网页导出与导入

在设置的数据管理入口导出 JSON，并妥善保存。普通用户导入时，导出文件中的用户邮箱必须与当前账户一致；管理员可以使用管理范围的全部数据导入导出。

### 导出 JSON（题目交换格式）

错题本的多选栏提供「导出 JSON」功能，将选中的错题导出为[题目交换格式 JSON v1](../QUESTION_FORMAT.md)文件。与完整备份不同，交换格式只包含题目内容（题干、答案、解析、知识点、难度、配图等），不含练习记录、复习计划、试卷、用户偏好等数据。

- 只导出属于当前用户的错题；不属于自己的 id 会被静默忽略。
- 可选「包含原图」：开启后，本地文件或旧 Base64 原图（PNG/JPEG/WebP）会以内嵌图片放入 `images` 字段。
- 题干为空的题目会被跳过，并在响应 `warnings` 中计入 `EMPTY_QUESTION_TEXT_SKIPPED`。
- 导出结果可被 `parseQuestionFile` 直接解析，实现往返闭环。

### 完整备份导出

本地图片文件缺失或哈希校验失败时，完整备份（含管理员全量导出）会将相应图片字段留空并继续导出，设置页会提示跳过的图片数量。备份仅在有缺图时包含可选的 `missingImages` 计数（按图片字段统计，共享文件可能计入多次）；它不影响导入，格式仍为第 12 版，旧备份照常导入。题库导出也会跳过缺失或损坏的原图，数量通过 `X-Missing-Images` 响应头提供。缺失的图片无法由该备份恢复，请保留原图片目录或其他完好的备份。

系统标签和自定义标签会保留标签体系及父子层级。不同年级下的同名章节、知识点分别还原，题目按备份中的标签关联恢复到具体节点；语文课程的年级、章节、知识点及其下的自定义标签也包含在内。导入兼容父子节点乱序的旧备份，重复导入不会重复创建同一路径的标签。

错题的配图、GeoGebra 演示、中英文 SVG 动画讲解及其已合成的云端语音（MP3）、最近一次举一反三和掌握概率都会随导出文件还原，SVG 在导入时重新净化；没有掌握概率的题目导入后会重新评估。试卷连同题目和每次录入的结果一起还原；导出时仍在生成的题目导入后显示为失败，可在试卷页重新生成。导入本人的导出文件时，还会还原录入年级识别规则及固定年级、导入前人工校对、判重阈值、GeoGebra 演示、SVG 动画讲解和界面主题等偏好设置。

导出文件为第 12 版，包含尚未处理的识别任务（待校对草稿和失败的任务，含题目图片或题目文字与识别结果）以及未完成的多题批次（分题草稿及你的调整、分题失败的批次、已开始但仍有题未入库的批次）；已保存的任务和全部入库的批次不导出。导入时待校对草稿和分题草稿保持原状，其余任务（含导出时仍在识别或保存的）显示为失败，导出时仍在分题的批次显示为分题失败，需要时手动重试，导入本身不会调用 AI。批次内的任务导入后仍归在原批次中，重复导入同一文件不会重复创建。旧版备份没有这些字段，照常导入。

第 7 版起导出文件新增 `extensions` 命名空间，用于 fork 项目存放私有扩展数据（如题库元数据）。`extensions` 按 `<key>: { version, data }` 组织，每个扩展自行管理版本号；上游默认导出空对象 `{}`，导入时对未注册的 key 安全跳过并记录警告，版本高于当前程序支持的扩展同样跳过。fork 项目可在 `src/lib/backup-extensions.ts` 的 `BACKUP_EXTENSIONS` 数组中注册扩展。

第 8 版起 `examPapers` 新增 `mode` 字段（`generate` 举一反三 / `original` 原题直出）；旧版文件没有该字段时导入按 `generate` 处理。

第 9 版起 `errorItems` 新增 `questionType` 字段（题型，如单选题、填空题、计算题等）；旧版文件没有该字段时导入为 null。

第 10 版起 `examPapers.questions` 新增 `score` 字段（每题分值，最多一位小数）；旧版文件没有该字段时导入为未设分值。

第 11 版起 `examPapers` 新增 `groupByType` 字段（是否按题型分大题），`examPapers.questions` 新增 `questionType` 字段（创建试卷题目时快照的来源题型）；旧版文件没有这些字段时导入为 false / null。

恢复备份时保留题目原有年级，不应用当前录入年级规则；旧文件未包含规则时不会覆盖当前账户设置。

每道错题及每道试卷题目的配图显示比例与显示位置（居左/居中/居右）也会导出和还原，同时用于页面显示与打印；旧备份缺少此字段或值无效时使用默认 100% 和居中。

导入时会合并已有错题本、标签，并按题干相似度处理重复题目。重复题可能在已有题目下新增一次做错记录，因此反复导入同一份文件可能改变练习历史。

导入前保留原始备份，完成后核对新增题目、标签、重复题数量和作答历史。需要完整还原到某个时间点时，使用文件备份恢复。

## Docker 整站备份

图片默认位于数据库同级的 `images/`：Docker 为 `/app/data/images`（随 `data/` 挂载），源码默认 `prisma/images/`。可通过 `IMAGE_STORAGE_DIR` 指向其他持久化目录；自定义目录必须单独加入备份和恢复。图片通过登录鉴权接口读取，请勿把目录映射为公开静态目录。

SQLite 继续保存题目与学习记录，图片字段内部使用文件引用；旧 Base64 数据可继续使用。网页 JSON 完整备份仍携带全部图片内容（含做错记录、未完成任务及草稿），题库 JSON 在选中「包含原图」时携带原图，不导出本机路径，导入时重新写入文件。备份数据结构仍为第 12 版。

### 旧图片迁移与文件清理

先停止服务并备份数据库及已有图片目录。在源码项目根目录、使用与应用相同的 `DATABASE_URL` 和 `IMAGE_STORAGE_DIR` 执行：

```bash
npm run images:migrate -- --offline
npm run images:prune -- --offline
```

迁移会分页处理错题原图、做错记录图片、识别任务图片、整页图片和分题草稿中的图片。文件写入并校验后才更新引用，保留原有更新时间，可重复执行；失败时已迁移部分仍可使用，未迁移部分保留原 Base64。程序不会自动停服，`--offline` 表示操作者已停止所有访问该数据库及图片目录的应用进程。

清理默认只报告未引用文件数量。确认停服和备份后，执行 `npm run images:prune -- --offline --delete` 才删除。共享图片只要仍被任一题目、作答记录、任务或草稿引用就保留；删除题目、替换图片或数据库事务失败留下的文件统一在此清理，避免并发时误删。若任何被引用文件缺失或校验失败，清理会中止，不执行删除。

Docker 安装可在停止服务后，用相同镜像和挂载运行一次性维护容器（继承应用环境配置，不启动 Web 服务）：

```bash
docker compose stop wrong-notebook
docker compose run --rm --no-deps --user nextjs:nodejs --entrypoint node wrong-notebook --conditions=react-server dist-scripts/scripts/images.js migrate --offline
docker compose run --rm --no-deps --user nextjs:nodejs --entrypoint node wrong-notebook --conditions=react-server dist-scripts/scripts/images.js prune --offline
docker compose start wrong-notebook
```

安装包也包含 `dist-scripts/scripts/images.js`，可用同样的 Node 参数运行，但必须显式设置实际数据库的绝对 `DATABASE_URL` 及自定义图片目录。命令失败时先排查原因，再恢复服务；不要删除原始备份。旧 SQLite 文件迁移后不会立即缩小，空闲页会被后续写入复用；确需缩小文件时，在备份和停服后另行执行 SQLite `VACUUM`，并预留临时磁盘空间。

下例适用于[部署指南](Deployment)中的目录布局。停止应用后再归档，可使 SQLite 数据文件、WAL/SHM 辅助文件及配置保持一致。

在部署目录执行：

```bash
mkdir -p backups
docker compose stop wrong-notebook
backup_file="backups/wrong-notebook-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$backup_file" data config docker-compose.yml .env
docker compose start wrong-notebook
tar -tzf "$backup_file"
```

备份失败时不要继续升级，先处理失败原因并确认服务恢复。使用内置 HTTPS 时，把 `certs/` 也加入归档；有额外部署文件时一并保存。

备份中可能含题目原图、用户资料、密码哈希和 AI 凭据，应限制访问并保存在独立位置。检查归档能够读取，并在隔离环境中验证恢复流程。

## 恢复整站

1. 确认备份时间、来源版本和归档内容；保存当前数据与配置的另一份副本。
2. 停止应用，避免恢复过程中继续写入数据库。
3. 在独立目录解开备份并检查，再恢复 `data/`、`config/` 和所需部署文件。
4. 优先使用与备份匹配的镜像版本，保留正确的挂载路径和 `NEXTAUTH_SECRET`。
5. 启动后检查 `/api/health`，登录核对用户、错题、标签、作答历史和试卷。

不要把旧数据库直接交给不兼容的新旧版本反复切换。需要升级时，在恢复验证完成后单独执行[升级流程](Deployment)。

## 源码运行的备份

默认 SQLite 文件位于 `prisma/dev.db`，实际位置由 `DATABASE_URL` 决定。停止服务后备份实际数据库所在目录、`config/`、`.env` 和版本信息；恢复时使用匹配代码及依赖，再按需要执行正式迁移。

范围依据：[导出实现](https://github.com/margrop/wrong-notebook/blob/main/src/app/api/export/route.ts) · [导入实现](https://github.com/margrop/wrong-notebook/blob/main/src/app/api/import/route.ts) · [数据模型](https://github.com/margrop/wrong-notebook/blob/main/prisma/schema.prisma)。

第 12 版起，练习记录包含解题思路（`notes`）与自动判题依据（`gradeReason`），自己的答案沿用作答快照（`wrongAnswerText`）；旧版备份没有新增字段时恢复为 null。
