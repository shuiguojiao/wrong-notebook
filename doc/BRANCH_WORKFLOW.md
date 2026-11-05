# 公开主线维护

`main` 仅包含可公开的应用源码、通用部署示例和开发文档。公开远程名为 `github`。

## 上传前检查

在每个工作副本启用钩子：

```bash
git config core.hooksPath .githooks
python3 scripts/check-public-history.py main
```

钩子在向 GitHub 上传任何分支或标签前，检查整个历史中的私有文件路径，以及固定公开基线之后的全部可达对象，包括已删除内容、合并父提交和标签说明。
检查会拒绝私有部署文件、实际内网地址、私有服务域名、本机提交邮箱和私钥。
已审阅的文档示例地址仅允许出现在指定示例文件中；新例外需要审阅。
浅克隆会拒绝检查；先运行 `git fetch --unshallow` 补齐历史。

固定公开基线为 `9751f074f713f55add71174ebe4066641ad370f4`，是首次加入私有部署信息之前的上游提交。此前的上游源码和历史保持原样；该检查不表示旧上游历史通过了完整密钥审计。缺少该基线或该基线不是待推送引用的祖先时，检查全部可达对象。

该检查用于阻止常见误推；本地钩子可被绕过，仍需审阅差异并使用密钥扫描工具检查公开历史。
GitHub Actions 是上传后的补充检查。推送前必须先在本地完成检查。

## 推送公开主线

推送前按 `AGENTS.md` 展示状态和拟推送差异，并取得用户确认；用户已明确要求推送时直接执行。

```bash
git switch main
git pull --ff-only github main
python3 scripts/check-public-history.py main
git push github main
```

本 fork 暂不发布安装包、npm 包或 App；如需安装包，可使用 `scripts/package/` 自行构建。
